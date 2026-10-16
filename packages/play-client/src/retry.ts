import { NetworkError } from "./network-error.ts";
import { ProblemError } from "./problem-error.ts";
import { endsSession } from "./problem.ts";
import type { PlayClientError } from "./protocol-error.ts";

/**
 * How a call may be repeated, by what the call is:
 *
 * - `never`: the redeem of a launch code. The code is single use, so a lost or
 *   failed redeem is never repeated (W-1, W-2).
 * - `refresh`: a token refresh. A retryable problem or a lost response is
 *   repeated with the same old token while it is valid (W-6, W-7).
 * - `idempotent`: a mutating call with its intent's idempotency key, or a read. A
 *   retryable problem or a lost response is repeated with the same bytes and
 *   key (W-16, W-42, W-43).
 *
 * A problem that is not `retryable` is never repeated.
 */
export type RetryClass = "never" | "refresh" | "idempotent";

/** Bounded backoff (Wrapper configuration). */
export type RetryConfig = {
  /** Attempts in all, the first included. */
  readonly maxAttempts: number;
  /** The wait before the second attempt; it doubles up to `maxDelayMs`. */
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
};

/**
 * Provisional defaults: the Wrapper spec asks only for "a bounded number of
 * times with backoff" (W-42); these follow the polling rates of W-35 until a
 * spec fixes them.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 2_000,
};

const isDelay = (ms: number): boolean => Number.isFinite(ms) && ms >= 0;

/**
 * Refuses a configuration that is not bounded: `maxAttempts` must be a safe
 * integer of at least 1, and both delays finite, non-negative, with
 * `initialDelayMs <= maxDelayMs`.
 */
export const assertRetryConfig = (config: RetryConfig): void => {
  if (!(Number.isSafeInteger(config.maxAttempts) && config.maxAttempts >= 1)) {
    throw new RangeError("maxAttempts must be a safe integer of at least 1");
  }
  if (
    !isDelay(config.initialDelayMs) ||
    !isDelay(config.maxDelayMs) ||
    config.initialDelayMs > config.maxDelayMs
  ) {
    throw new RangeError(
      "retry delays must be finite, non-negative, and initialDelayMs <= maxDelayMs",
    );
  }
};

/** The wait before attempt `attempt + 1`, after `attempt` failed (1-based). */
export const backoffDelayMs = (config: RetryConfig, attempt: number): number =>
  Math.min(
    config.maxDelayMs,
    config.initialDelayMs * 2 ** Math.max(0, attempt - 1),
  );

/** Whether an error of a call of class `retryClass` may be repeated. */
export const isRepeatable = (
  retryClass: RetryClass,
  error: PlayClientError,
): boolean => {
  if (retryClass === "never") {
    return false;
  }
  if (error instanceof NetworkError) {
    return error.reason !== "aborted";
  }
  return (
    error instanceof ProblemError &&
    error.problem.retryable &&
    !endsSession(error.problem)
  );
};
