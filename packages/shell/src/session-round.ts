// What the session holds of the current round (session-play.ts,
// session-reads.ts): a config round's flow (round-flow.ts) or a book round
// (book-round.ts), through the use cases and read-only state they share.

import type { FailReason } from "./chain-decision.ts";
import type { RoundFlow } from "./round-flow.ts";

/**
 * What the session reads of a round's verdict: `checking` until W-26 decided,
 * `ready`, or `failed` with what the player is shown. A config round's
 * `RoundVerdict` is one; a book round, which W-26 does not apply to, is `ready`
 * unless it changed (W-52), and then `failed`.
 */
export type FlowVerdict =
  | { readonly state: "checking" }
  | { readonly state: "ready" }
  | { readonly state: "failed"; readonly shown: FailReason };

/**
 * What the session holds of the current round, a config round's flow or a book
 * round's (book-round.ts): its use cases and read-only state, without a config
 * round's evidence and resend.
 */
export type SessionRound = Pick<
  RoundFlow,
  | "roundId"
  | "phase"
  | "latest"
  | "over"
  | "cancel"
  | "lastError"
  | "unconfirmed"
  | "observe"
  | "refresh"
  | "checkAgain"
  | "pick"
  | "cashOut"
  | "cashOutOffered"
> & {
  readonly verdict: () => FlowVerdict;
};
