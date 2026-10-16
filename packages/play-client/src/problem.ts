import type { ErrorCode, PlayProblem } from "@intraverse/se-client-contracts";

/**
 * The fields of a Play API problem (RFC 9457 `problem+json` with a typed `code`
 * and `retryable`, the contracts' `PlayProblem`) that the client routes on. The
 * client does not validate the problem: the whole body stays `unknown` on the
 * error, and only the `snapshot` package's `PlayProblem` validator can type it
 * (and the `snapshot` a `ROUND_ACTIVE` problem embeds).
 *
 * `code` is a string because a newer backend may send a code this kit does not
 * know; a consumer falls back to `status` and `retryable` then (W-42).
 */
export type ProblemSummary = {
  readonly status: PlayProblem["status"];
  readonly code: ErrorCode | (string & Record<never, never>);
  readonly retryable: PlayProblem["retryable"];
  readonly requestId?: NonNullable<PlayProblem["requestId"]>;
};

/** The codes that end the session when they answer a call (W-7, W-42). */
export const SESSION_ENDING_CODES: readonly ErrorCode[] = [
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "UNAUTHENTICATED",
];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the routing fields of an error response's problem body, or returns
 * `undefined` when the body is not a problem (not an object, a missing or empty
 * `code`, a `retryable` that is not a boolean) or the HTTP status is not an
 * error status. `status` is the HTTP response's own status.
 */
export const readProblem = (
  body: unknown,
  httpStatus: number,
): ProblemSummary | undefined => {
  if (!isRecord(body) || httpStatus < 400 || httpStatus > 599) {
    return undefined;
  }
  const { code, retryable, requestId } = body;
  if (
    typeof code !== "string" ||
    code.length === 0 ||
    typeof retryable !== "boolean"
  ) {
    return undefined;
  }
  return typeof requestId === "string"
    ? { status: httpStatus, code, retryable, requestId }
    : { status: httpStatus, code, retryable };
};

/** Whether the problem ends the session: the shell discards its credentials. */
export const endsSession = (problem: ProblemSummary): boolean =>
  SESSION_ENDING_CODES.some(code => code === problem.code);
