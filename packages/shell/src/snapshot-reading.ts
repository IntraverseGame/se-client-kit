// What a validated Snapshot says about the action the shell has signed and not
// seen applied (W-18, W-19). PROVISIONAL: the backend's signed-action
// specification, which would tie a sequence to the Snapshot's progress, is not
// published yet. Until it is, this module reads the rule from the Snapshot
// schema alone, and it is the one place to replace when the specification
// lands:
//
// - `step` counts the moves applied (the schema: "progress through the round:
//   0 .. steps.length"), and the moves are a round's first signed messages, so
//   the move at sequence `s` is applied exactly when `step` is `s`;
// - a cash-out or a cancel is never seen applied in a round that is still
//   open; it ends the round, so a terminal status closes it;
// - a terminal Snapshot's `step` still counts the moves applied (the vendored
//   `won` and `lost` vectors count the final move), so a pending move at
//   sequence `step` was applied before the round closed;
// - a `resolving` Snapshot never shows a move applied (normative in the
//   player-facing Snapshot contract): the move is applied only once a later
//   Snapshot of the round shows it outside `resolving`;
// - `step` above what the shell signed means an action it did not sign was
//   applied: the shell cannot know `T` then, and stops (out of sync).

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

/** What the shell signed for a round and has not seen applied. */
export type PendingKind = "action" | "cash-out" | "cancel";

/** What the shell knows of its round when it reads a Snapshot. */
export type RoundPosition = {
  /** The Snapshot `roundId` (UUIDv7 text) of the round. */
  readonly roundId: string;
  /** Moves the shell has seen applied. */
  readonly applied: number;
  /** The signed action awaiting its outcome, if any. */
  readonly pending?: {
    readonly kind: PendingKind;
    readonly sequence: number;
  };
};

/** What a Snapshot shows. */
export type SnapshotReading =
  /** Not this round's Snapshot (another round, or none): nothing to learn. */
  | "other-round"
  /** The pending move was applied: `T` may advance to it. */
  | "applied"
  /** Nothing new was applied (or the Snapshot is older than what is known). */
  | "not-applied"
  /** The round is over (`won`, `lost`, or `canceled`). */
  | "closed"
  /** An action the shell did not sign was applied. */
  | "out-of-sync";

const TERMINAL: ReadonlySet<string> = new Set(["won", "lost", "canceled"]);

/** The fields of a Snapshot that say whether its round is over. */
export type RoundEnd = {
  readonly status: string;
  readonly closeReason?: string;
};

/**
 * Whether the Snapshot's round is over (`won`, `lost`, or `canceled`): the one
 * place the kit decides it from a Snapshot, read by the shell's transcript
 * state and by the Wrapper's polling (W-35) and rendering (W-39, W-40). The
 * status alone decides: `canceled` is final, with or without a `closeReason`
 * (`se.snapshot/1` as vendored from b27afc5). Whether a round with a cancel
 * still settling is over is the round flow's cancel state, not this.
 */
export const isRoundOver = (snapshot: RoundEnd): boolean =>
  TERMINAL.has(snapshot.status);

/** The fields that order a round's Snapshots. */
export type Versioned = { readonly version: number };

/**
 * Whether `snapshot` is a stale read of a round whose latest Snapshot is
 * `latest` (W-29): its `version` is lower. An equal `version` is not stale. The
 * one rule a round applies, config or book, before its tracking, its checks,
 * and its transcript state see a Snapshot of the round.
 */
export const isStale = (snapshot: Versioned, latest: Versioned): boolean =>
  snapshot.version < latest.version;

export const readSnapshot = (
  position: RoundPosition,
  snapshot: ValidSnapshot,
): SnapshotReading => {
  if (snapshot.status === "idle" || snapshot.roundId !== position.roundId) {
    return "other-round";
  }
  if (isRoundOver(snapshot)) {
    return "closed";
  }
  const { step } = snapshot;
  if (step === undefined) {
    return "not-applied";
  }
  const { pending } = position;
  if (pending?.kind === "action") {
    if (step === pending.sequence) {
      return snapshot.status === "resolving" ? "not-applied" : "applied";
    }
    return step > pending.sequence ? "out-of-sync" : "not-applied";
  }
  return step > position.applied ? "out-of-sync" : "not-applied";
};

/**
 * Whether a Snapshot that closes the round (`readSnapshot` gave `"closed"`)
 * also shows the pending move applied: the move was the round's last, and the
 * transcript confirms it before the round closes.
 */
export const closingAppliesPending = (
  position: RoundPosition,
  snapshot: ValidSnapshot,
): boolean =>
  isRoundOver(snapshot) &&
  position.pending?.kind === "action" &&
  snapshot.step === position.pending.sequence;
