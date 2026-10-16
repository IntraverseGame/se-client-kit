// Problem bodies for the fake Play API, typed against the contracts'
// `PlayProblem` so that a change of the contract breaks them at compile time.
// They follow the schema's rules: `retryable` is true exactly for the
// retryable codes, and only `ROUND_ACTIVE` embeds a Snapshot.

import type { ErrorCode, PlayProblem } from "@intraverse/se-client-contracts";

const problem = (
  code: ErrorCode,
  status: number,
  retryable: boolean,
): PlayProblem => ({
  type: "about:blank",
  title: "Play error",
  status,
  requestId: `req-${code.toLowerCase()}`,
  code,
  retryable,
  detail: "A server message the client never shows or logs.",
});

export const insufficientFunds: PlayProblem = problem(
  "INSUFFICIENT_FUNDS",
  422,
  false,
);
export const staleAction: PlayProblem = problem("STALE_ACTION", 409, false);
export const unavailable: PlayProblem = problem("UNAVAILABLE", 503, true);
export const entropyUnavailable: PlayProblem = problem(
  "ENTROPY_UNAVAILABLE",
  503,
  true,
);
export const sessionExpired: PlayProblem = problem(
  "SESSION_EXPIRED",
  401,
  false,
);
export const sessionRevoked: PlayProblem = problem(
  "SESSION_REVOKED",
  401,
  false,
);
export const unauthenticated: PlayProblem = problem(
  "UNAUTHENTICATED",
  401,
  false,
);

/** Every problem above, by name, for table-driven tests. */
export const problems: Readonly<Record<string, PlayProblem>> = {
  insufficientFunds,
  staleAction,
  unavailable,
  entropyUnavailable,
  sessionExpired,
  sessionRevoked,
  unauthenticated,
};
