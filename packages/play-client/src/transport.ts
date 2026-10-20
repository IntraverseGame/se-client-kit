import { NetworkError } from "./network-error.ts";
import {
  onAbort,
  sleep,
  type AbortControllerLike,
  type CancelSignal,
  type Clock,
  type FetchLike,
  type RequestInitLike,
  type ResponseLike,
} from "./platform.ts";
import { ProblemError } from "./problem-error.ts";
import { readProblem } from "./problem.ts";
import { ProtocolError, type PlayClientError } from "./protocol-error.ts";
import {
  assertDeadline,
  assertPath,
  checkBaseUrl,
  parseJson,
  platformAbortController,
} from "./request-rules.ts";
import {
  DEFAULT_RETRY_CONFIG,
  assertRetryConfig,
  backoffDelayMs,
  isRepeatable,
  type RetryConfig,
} from "./retry.ts";
import { clockOffsetMs } from "./token-schedule.ts";

/** Default request timeout (W-43, Wrapper configuration). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type TransportOptions = {
  /**
   * The Play API base, `playApiBaseUrl` of the environment configuration: an
   * `https:` URL, or `http:` on a loopback host only (`localhost`, `127.0.0.1`,
   * `[::1]`).
   */
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly clock: Clock;
  /** Defaults to the platform `AbortController`, when there is one. */
  readonly createAbortController?: () => AbortControllerLike;
  readonly timeoutMs?: number;
  readonly retry?: RetryConfig;
};

/**
 * Returns the `Authorization` header value at send time. The caller (the shell)
 * keeps the token; the transport reads it for one request and keeps nothing.
 */
export type Authorization = () => string;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type PlayRequestBase = {
  readonly method: HttpMethod;
  /** A path below the base, `/...`, with no query string or fragment. */
  readonly path: string;
  /** Sent as JSON. The same value is sent on every repeat. */
  readonly body?: unknown;
  readonly authorization?: Authorization;
  /**
   * Aborting it ends the request: the in-flight `fetch` is aborted, a backoff
   * wait is cleared, and `send` rejects with a `NetworkError` (`aborted`).
   * Nothing is repeated after it.
   */
  readonly signal?: CancelSignal;
};

/**
 * A request and how it may be repeated (see `RetryClass`). A refresh must name
 * the old token's deadline.
 */
export type PlayRequest = PlayRequestBase &
  (
    | {
        readonly retry: "never" | "idempotent" | "start";
        /** No repeat starts at or after this local time. */
        readonly notAfterMs?: number;
      }
    | {
        readonly retry: "refresh";
        /**
         * The old token's deadline in the local clock (`localDeadlineMs`): no
         * repeat starts at or after it (W-7).
         */
        readonly notAfterMs: number;
      }
  );

export type PlayResponse = {
  readonly status: number;
  /** The parsed JSON body, uninterpreted: a Snapshot stays `unknown`. */
  readonly body: unknown;
  /** The local clock when the response arrived. */
  readonly receivedAtMs: number;
  /** `server - local`, from the response's `Date` header (W-6). */
  readonly clockOffsetMs: number | undefined;
};

export type Transport = {
  /**
   * Sends a request, repeating it as its retry class allows. Resolves with a
   * 2xx response; rejects with a `NetworkError`, a `ProblemError`, or a
   * `ProtocolError`.
   */
  readonly send: (request: PlayRequest) => Promise<PlayResponse>;
};

/**
 * The `Authorization` header value for a play token: `Bearer <token>`, the Play
 * API document's `playToken` bearer scheme (W-3).
 */
export const bearerAuthorization = (token: string): string => `Bearer ${token}`;

const isPlayClientError = (error: unknown): error is PlayClientError =>
  error instanceof NetworkError ||
  error instanceof ProblemError ||
  error instanceof ProtocolError;

const ignore = (): void => {};

/**
 * Creates the request layer of the Play API client: one `fetch` per attempt,
 * with the W-3 request options, the W-43 timeout, problem mapping, and bounded
 * retries by retry class.
 */
export const createTransport = (options: TransportOptions): Transport => {
  const baseUrl = checkBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    throw new RangeError("the request timeout must be a positive duration");
  }
  const retry = options.retry ?? DEFAULT_RETRY_CONFIG;
  assertRetryConfig(retry);
  const createAbortController =
    options.createAbortController ?? platformAbortController;
  const { clock } = options;

  const exchange = async (
    request: PlayRequest,
    init: RequestInitLike,
    controller: AbortControllerLike | undefined,
  ): Promise<{ readonly response: ResponseLike; readonly text: string }> => {
    let handle: unknown;
    let unsubscribe = ignore;
    const stop = new Promise<never>((_resolve, reject) => {
      handle = clock.setTimeout(() => {
        controller?.abort();
        reject(new NetworkError(request, "timeout"));
      }, timeoutMs);
      unsubscribe = onAbort(request.signal, () => {
        controller?.abort();
        reject(new NetworkError(request, "aborted"));
      });
    });
    const call = (async () => {
      let response: ResponseLike;
      try {
        response = await options.fetch(`${baseUrl}${request.path}`, init);
      } catch {
        throw new NetworkError(request, "network");
      }
      let text: string;
      try {
        text = await response.text();
      } catch {
        throw new NetworkError(request, "network");
      }
      return { response, text };
    })();
    try {
      return await Promise.race([call, stop]);
    } finally {
      clock.clearTimeout(handle);
      unsubscribe();
      // A late rejection of the losing side is expected and handled here.
      call.catch(ignore);
      stop.catch(ignore);
    }
  };

  const attempt = async (
    request: PlayRequest,
    body: string | undefined,
  ): Promise<PlayResponse> => {
    const headers: Record<string, string> = {
      accept: "application/json, application/problem+json",
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (request.authorization !== undefined) {
      headers["authorization"] = request.authorization();
    }
    const controller = createAbortController();
    const init: RequestInitLike = {
      method: request.method,
      headers,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
      ...(body === undefined ? {} : { body }),
      ...(controller === undefined ? {} : { signal: controller.signal }),
    };
    const { response, text } = await exchange(request, init, controller);
    const receivedAtMs = clock.now();
    const parsed = parseJson(text);
    const { status } = response;
    if (status >= 200 && status <= 299) {
      if (!parsed.ok) {
        throw new ProtocolError(
          request,
          status,
          "the response body is not JSON",
        );
      }
      return {
        status,
        body: parsed.value,
        receivedAtMs,
        clockOffsetMs: clockOffsetMs(
          response.headers.get("date"),
          receivedAtMs,
        ),
      };
    }
    const problem = parsed.ok ? readProblem(parsed.value, status) : undefined;
    if (problem === undefined) {
      throw new ProtocolError(request, status, "unexpected response");
    }
    throw new ProblemError(request, problem, parsed.value);
  };

  const send = async (request: PlayRequest): Promise<PlayResponse> => {
    assertPath(request.path);
    assertDeadline(request);
    const body =
      request.body === undefined ? undefined : JSON.stringify(request.body);
    for (let attemptNumber = 1; ; attemptNumber += 1) {
      if (request.signal?.aborted === true) {
        throw new NetworkError(request, "aborted");
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- a retry must follow the failed attempt, never run beside it
        return await attempt(request, body);
      } catch (error) {
        if (
          !isPlayClientError(error) ||
          attemptNumber >= retry.maxAttempts ||
          !isRepeatable(request.retry, error)
        ) {
          throw error;
        }
        const delayMs = backoffDelayMs(retry, attemptNumber);
        if (
          request.notAfterMs !== undefined &&
          clock.now() + delayMs >= request.notAfterMs
        ) {
          throw error;
        }
        // oxlint-disable-next-line no-await-in-loop -- the backoff wait sits between two sequential attempts
        const waited = await sleep(clock, delayMs, request.signal);
        if (!waited) {
          throw new NetworkError(request, "aborted");
        }
      }
    }
  };

  return { send };
};
