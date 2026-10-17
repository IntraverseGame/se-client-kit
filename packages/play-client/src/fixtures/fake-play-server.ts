// A fake Play API server for the operations' unit tests, built from the
// vendored Play API document (`/play/v1`): its routes are `PLAY_ROUTES`, which
// compile only against the document's paths and methods; a scripted answer is
// typed by the operation's own responses (a status the operation does not
// list, or a body of the wrong shape, does not compile); every route but the
// redeem requires the play token as `Authorization: Bearer <token>`, as the
// document's `security` says (`UNAUTHENTICATED` otherwise); and request bodies
// are decoded strictly (request-shapes.ts: an unknown or missing field, or a
// body where none is taken, is `INVALID_ARGUMENT`). Field values are not
// checked against their patterns. It is an injected `fetch`: no network, no
// timer, no clock of its own.

import type {
  ErrorCode,
  PlayApiOperations,
  PlayProblem,
} from "@intraverse/se-client-contracts";

import type { FetchLike, RequestInitLike, ResponseLike } from "../platform.ts";
import { PLAY_ROUTES, type PlayOperationId } from "../play-api.ts";
import { isAcceptedBody } from "./request-shapes.ts";
import { BASE_URL } from "./session.ts";

/** The statuses an operation's responses list in the document. */
export type ListedStatus<Id extends PlayOperationId> = Extract<
  keyof PlayApiOperations[Id]["responses"],
  number
>;

type SuccessBody<Id extends PlayOperationId> =
  PlayApiOperations[Id]["responses"][200] extends {
    readonly content: { readonly "application/json": infer Body };
  }
    ? Body
    : never;

/**
 * A problem body. Its `code` may be one the document does not list yet, to
 * stand for a newer backend (W-42).
 */
export type ProblemBody = Omit<PlayProblem, "code" | "snapshot"> & {
  readonly code: ErrorCode | (string & Record<never, never>);
};

/** One scripted answer of an operation. */
export type Answer<Id extends PlayOperationId> =
  | {
      readonly kind: "success";
      readonly body: SuccessBody<Id>;
      readonly date?: string;
    }
  | {
      /** A problem body built by `problemBody`, sent with `status`. */
      readonly kind: "problem";
      readonly status: Exclude<ListedStatus<Id>, 200>;
      readonly code: ProblemBody["code"];
      readonly retryable: boolean;
    }
  /** A body that is not JSON, with the given status. */
  | { readonly kind: "garbage"; readonly status: number }
  | { readonly kind: "network-failure" }
  /** Never answers: the call can only end by its timeout or its signal. */
  | { readonly kind: "hang" };

/** A request as the server decoded it. */
export type Served = {
  readonly operationId: PlayOperationId | undefined;
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The decoded JSON body, or `undefined` when none was sent. */
  readonly body: unknown;
};

export type FakePlayServer = {
  readonly fetch: FetchLike;
  readonly served: readonly Served[];
  /** Queues the answers to the next calls of operation `id`, in order. */
  readonly answer: <Id extends PlayOperationId>(
    id: Id,
    ...answers: readonly Answer<Id>[]
  ) => void;
};

const OPERATIONS = Object.keys(PLAY_ROUTES) as PlayOperationId[];

const routeOf = (url: string, method: string): PlayOperationId | undefined =>
  OPERATIONS.find(
    id =>
      `${BASE_URL}${PLAY_ROUTES[id].path}` === url &&
      PLAY_ROUTES[id].method === method,
  );

const response = (
  status: number,
  text: string,
  headers: Readonly<Record<string, string>>,
): ResponseLike => ({
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  text: () => Promise.resolve(text),
});

/** A problem the server sends on its own, in the document's shape. */
export const problemBody = (
  code: ErrorCode | (string & Record<never, never>),
  status: number,
  retryable: boolean,
): ProblemBody => ({
  type: "about:blank",
  title: "Play error",
  status,
  code,
  retryable,
  requestId: `req-${code.toLowerCase()}`,
  detail: "A server message the client never shows or logs.",
});

const problemResponse = (body: ProblemBody): ResponseLike =>
  response(body.status, JSON.stringify(body), {
    "content-type": "application/problem+json",
  });

const NOT_JSON: unique symbol = Symbol("not JSON");

const decode = (init: RequestInitLike): unknown => {
  if (init.body === undefined) return undefined;
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return NOT_JSON;
  }
};

const BEARER = /^Bearer \S+$/u;

const never = (): void => {};

export const createFakePlayServer = (): FakePlayServer => {
  const served: Served[] = [];
  const queues = new Map<PlayOperationId, Answer<PlayOperationId>[]>();
  const fetch: FetchLike = (url, init) => {
    const operationId = routeOf(url, init.method);
    served.push({
      operationId,
      url,
      method: init.method,
      headers: { ...init.headers },
      body: decode(init),
    });
    if (operationId === undefined) {
      return Promise.resolve(
        problemResponse(problemBody("NOT_FOUND", 404, false)),
      );
    }
    // Every operation but the redeem requires the play token (`security`).
    const authorization = init.headers["authorization"];
    if (
      operationId !== "redeemLaunchCode" &&
      (authorization === undefined || !BEARER.test(authorization))
    ) {
      return Promise.resolve(
        problemResponse(problemBody("UNAUTHENTICATED", 401, false)),
      );
    }
    if (!isAcceptedBody(operationId, served.at(-1)?.body)) {
      return Promise.resolve(
        problemResponse(problemBody("INVALID_ARGUMENT", 400, false)),
      );
    }
    const next = queues.get(operationId)?.shift();
    if (next === undefined) {
      return Promise.reject(
        new Error(`the fake Play API has no answer queued for ${operationId}`),
      );
    }
    switch (next.kind) {
      case "success": {
        return Promise.resolve(
          response(200, JSON.stringify(next.body), {
            "content-type": "application/json",
            ...(next.date === undefined ? {} : { date: next.date }),
          }),
        );
      }
      case "problem": {
        return Promise.resolve(
          problemResponse(problemBody(next.code, next.status, next.retryable)),
        );
      }
      case "garbage": {
        return Promise.resolve(
          response(next.status, "<html>not json</html>", {
            "content-type": "text/html",
          }),
        );
      }
      case "network-failure": {
        // A platform error that names the URL: the client must not pass it on.
        return Promise.reject(new TypeError(`Failed to fetch ${url}`));
      }
      default: {
        // `hang`: never answers.
        return new Promise<never>(never);
      }
    }
  };
  return {
    fetch,
    served,
    answer: (id, ...answers) => {
      const queue = queues.get(id) ?? [];
      queue.push(...(answers as readonly Answer<PlayOperationId>[]));
      queues.set(id, queue);
    },
  };
};
