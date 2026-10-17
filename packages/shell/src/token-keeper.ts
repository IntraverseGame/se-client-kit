// The play token and its refresh loop (W-3, W-5 to W-8). The token lives only
// here, sealed (it prints `[redacted]`), and leaves only as the `Authorization`
// header value the transport reads per attempt. The refresh point comes from
// the response's `tokenExpiresAt`, corrected by the clock offset of the
// redeem's `Date` header, and the Wrapper's fraction and margin (play-client's
// `refreshAtMs`). At most one refresh is in flight; the new token replaces the
// old one only once its answer arrived. A retryable failure is tried again with
// bounded backoff while the old token is valid; `SESSION_EXPIRED`,
// `SESSION_REVOKED`, `UNAUTHENTICATED`, or the deadline ends the session. No
// call is made only to keep the session alive (W-8).
//
// It logs nothing and emits nothing but the one end notice.

import {
  type Authorization,
  backoffDelayMs,
  bearerAuthorization,
  type Clock,
  DEFAULT_REFRESH_CONFIG,
  DEFAULT_RETRY_CONFIG,
  endsSession,
  isExpired,
  localDeadlineMs,
  NetworkError,
  parseDeadline,
  ProblemError,
  type RefreshConfig,
  refreshAtMs,
  refreshPlayToken,
  type RetryConfig,
  singleFlight,
  type TimerHandle,
  type TokenDeadline,
  type Transport,
} from "@intraverse/se-client-play-client";

import { ShellError } from "./errors.ts";
import {
  disposeSecret,
  type PlayToken,
  redacting,
  revealSecret,
  sealSecret,
} from "./redaction.ts";

export type TokenKeeperOptions = {
  /** The Play API transport (the refresh call). */
  readonly transport: Transport;
  readonly clock: Clock;
  /** The refresh fraction and margin (W-6, Wrapper configuration). */
  readonly refresh?: RefreshConfig;
  /** The backoff between refresh attempts after a retryable failure (W-7). */
  readonly retry?: RetryConfig;
  /** Called once, when the session ends for any reason. */
  readonly onEnd: () => void;
};

/** The redeem's answer, as the keeper starts from it. */
export type FirstToken = {
  readonly playToken: PlayToken;
  readonly tokenExpiresAt: string;
  readonly receivedAtMs: number;
  /** From the redeem response's `Date` header (W-6); `undefined` counts as 0. */
  readonly clockOffsetMs: number | undefined;
};

export type TokenKeeper = {
  /**
   * The `Authorization` value of the current token; `session-ended` after the
   * end.
   */
  readonly authorization: Authorization;
  readonly ended: () => boolean;
  /** Ends the session: the token is forgotten and no refresh is made. */
  readonly end: () => void;
};

/** Seals a refreshed token at once, so the plain text is never kept. */
const seal = (token: string): PlayToken => sealSecret("play-token", token);

const isRetryable = (error: unknown): boolean =>
  error instanceof NetworkError ||
  (error instanceof ProblemError && error.problem.retryable);

/**
 * Holds the session's play token and runs its refresh schedule, from the
 * redeem's answer. Throws `invalid-input` when `tokenExpiresAt` is not a
 * deadline.
 */
export const createTokenKeeper = (
  options: TokenKeeperOptions,
  first: FirstToken,
): TokenKeeper => {
  const { transport, clock } = options;
  const config = options.refresh ?? DEFAULT_REFRESH_CONFIG;
  const retry = options.retry ?? DEFAULT_RETRY_CONFIG;
  const offset = first.clockOffsetMs ?? 0;

  const deadlineOf = (
    expiresAt: string,
    receivedAtMs: number,
  ): TokenDeadline => {
    const expiresAtMs = parseDeadline(expiresAt);
    if (expiresAtMs === undefined) throw new ShellError("invalid-input");
    return { expiresAtMs, receivedAtMs, clockOffsetMs: offset };
  };

  let token: PlayToken = first.playToken;
  let deadline = deadlineOf(first.tokenExpiresAt, first.receivedAtMs);
  let ended = false;
  let failures = 0;
  let refreshTimer: TimerHandle | undefined;
  let expiryTimer: TimerHandle | undefined;

  const clearTimers = (): void => {
    if (refreshTimer !== undefined) clock.clearTimeout(refreshTimer);
    if (expiryTimer !== undefined) clock.clearTimeout(expiryTimer);
    refreshTimer = undefined;
    expiryTimer = undefined;
  };

  const end = (): void => {
    if (ended) return;
    ended = true;
    clearTimers();
    disposeSecret(token);
    options.onEnd();
  };

  const authorization: Authorization = () => {
    if (ended) throw new ShellError("session-ended");
    return bearerAuthorization(revealSecret(token));
  };

  const at = (localMs: number, run: () => void): TimerHandle =>
    clock.setTimeout(run, Math.max(0, localMs - clock.now()));

  // The token that reached its deadline cannot be refreshed: the end (W-7).
  const watchExpiry = (): void => {
    if (expiryTimer !== undefined) clock.clearTimeout(expiryTimer);
    expiryTimer = at(localDeadlineMs(deadline), () => {
      if (isExpired(deadline, clock.now())) end();
    });
  };

  // Its timers call `refresh`, defined below, only after it exists.
  const schedule = (): void => {
    refreshTimer = at(refreshAtMs(deadline, config), () => {
      void refresh();
    });
    watchExpiry();
  };

  const refresh = singleFlight(async (): Promise<void> => {
    if (ended) return;
    const presented = deadline;
    try {
      const result = await refreshPlayToken(transport, {
        authorization,
        seal,
        notAfterMs: localDeadlineMs(presented),
      });
      if (ended) {
        disposeSecret(result.body.playToken);
        return;
      }
      const next = deadlineOf(result.body.tokenExpiresAt, result.receivedAtMs);
      disposeSecret(token);
      token = result.body.playToken;
      deadline = next;
      failures = 0;
      schedule();
    } catch (error) {
      if (ended) return;
      if (error instanceof ProblemError && endsSession(error.problem)) {
        end();
        return;
      }
      if (!isRetryable(error)) {
        // Not worth repeating: the old token serves until its deadline.
        return;
      }
      failures += 1;
      const againAt = clock.now() + backoffDelayMs(retry, failures);
      if (againAt < localDeadlineMs(presented)) {
        refreshTimer = at(againAt, () => {
          void refresh();
        });
      }
    }
  });

  schedule();

  return redacting({
    authorization,
    ended: (): boolean => ended,
    end,
  });
};
