// The types of autoplay (RFC-005 section 6, W-61): what the player asks for,
// why a run stops or does not begin, and the run's state as the UI reads it.
// The run is autoplay-run.ts's.

import type { Bet } from "./round-start.ts";

/** What the player asked for. */
export type AutoplayRequest = {
  /** How many rounds: a whole number of at least 1. */
  readonly count: number;
  /** The bet, the Snapshot's own `Amount` fields of the chosen option. */
  readonly bet: Bet;
  /** The least time, in milliseconds, a result shows before the next start. */
  readonly minIntervalMs: number;
};

/** Why a run stopped (RFC-005 section 6). */
export type AutoplayStop =
  /** The player stopped it; the round in flight finishes. */
  | "player"
  /** Every round of the count was played. */
  | "count"
  /** The balance is below the bet. */
  | "balance"
  /** The latest Snapshot no longer offers the bet. */
  | "bet-not-offered"
  /** A typed error, the generic error, a void, or a refused start (W-42). */
  | "error"
  /** A connection problem (W-43). */
  | "connection"
  /** A Snapshot that failed validation (W-28). */
  | "rejected"
  /** The round ended other than `won` or `lost`. */
  | "round-ended"
  /** The round's randomness record changed (W-52). */
  | "changed-round"
  /** "Game not compatible" (W-38). */
  | "incompatible"
  /** A `playback` copy failed closed (W-55): the rounds cannot be seen. */
  | "playback-failed"
  /** The session changed (W-53). */
  | "session-changed"
  /** The session ended, or its token could not be refreshed (W-7). */
  | "session-ended"
  /** The signer lock was lost (W-14). */
  | "lock-lost"
  /** The page was hidden (RFC-005 Q3): a run never continues unattended. */
  | "hidden";

/** The stops the Wrapper reports: what only the page can see. */
export type AutoplayOutsideStop = Extract<AutoplayStop, "player" | "hidden">;

/** Why a run did not begin: nothing was sent. */
export type AutoplayRefusal =
  /** The count or the interval is not a whole number in range. */
  | "invalid-request"
  /** The session's rounds are not book rounds (`playback`). */
  | "not-book"
  /** A run is already going, or a round is open. */
  | "busy"
  /** The balance is below the bet. */
  | "balance"
  /** The latest Snapshot does not offer the bet. */
  | "bet-not-offered"
  /** The session ended or changed. */
  | "closed";

export type AutoplayState =
  /** No run yet. */
  | { readonly kind: "idle" }
  /** `left` starts are still to come, the one in flight not counted. */
  | {
      readonly kind: "running";
      readonly count: number;
      readonly left: number;
    }
  | {
      readonly kind: "stopped";
      readonly reason: AutoplayStop;
      /** How many starts the run sent. */
      readonly started: number;
    };

export type AutoplayBegin =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: AutoplayRefusal };

/** The largest count and interval a run takes. */
export const AUTOPLAY_MAX_COUNT = 1000;
export const AUTOPLAY_MAX_INTERVAL_MS = 600_000;
