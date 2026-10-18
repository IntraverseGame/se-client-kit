// The UI's state, and the pure transitions that change it. Everything comes
// from validated Snapshots and typed errors (W-28, W-29) or from the shell's
// verdicts; nothing here holds or sees a key or a token.

import {
  type CancelState,
  type ProblemInput,
  type RoundCheck,
  roundEnded,
  type RoundStatus,
  type SnapshotInput,
  type SnapshotRead,
} from "./round-input.ts";

/**
 * The states that replace the round view (W-44), each shown distinctly. The
 * shell decides `other-tab` and `unsupported-browser` (W-14),
 * `verification-failed` and `chain-unverified` (W-26, W-26a), and `out-of-sync`
 * (W-19); the UI only shows them.
 */
export type BlockingState =
  | "loading"
  | "configuration-error"
  | "session-ended"
  | "other-tab"
  | "unsupported-browser"
  | "verification-failed"
  | "chain-unverified"
  | "out-of-sync"
  | "snapshot-rejected";

/** A round that ended, kept until the player starts another one (W-39, W-40). */
export type EndedRound = {
  readonly roundId: string;
  /**
   * The round's result, or `ended`: the shell's cancel ended it with no result
   * claim (W-25, W-33).
   */
  readonly status: Extract<RoundStatus, "won" | "lost" | "canceled"> | "ended";
};

export type WrapperState = {
  readonly blocking?: BlockingState;
  /** The last accepted Snapshot. */
  readonly snapshot?: SnapshotInput;
  /** The shell's checks of that Snapshot's round, when it holds the round. */
  readonly check?: RoundCheck;
  /** The shell did not act on the player's last request (nothing was sent). */
  readonly refused?: true;
  /** The game's `hello` did not declare what the Wrapper sends (W-38). */
  readonly gameIncompatible?: true;
  readonly endedRound?: EndedRound;
  /** The typed error of the last call, shown beside the round (W-42). */
  readonly problem?: ProblemInput;
  /** A request got no response (W-43); cleared by the next response. */
  readonly connectionProblem: boolean;
  /** The browser reports being offline (W-43). */
  readonly offline: boolean;
  /** Polling has gone on longer than expected (W-35). */
  readonly slow: boolean;
  /** `minRpcQuorum` is 1 (W-26a): the "not independent" indicator. */
  readonly chainNotIndependent: boolean;
};

export const initialState: WrapperState = Object.freeze({
  blocking: "loading",
  connectionProblem: false,
  offline: false,
  slow: false,
  chainNotIndependent: false,
});

/** The codes that end the session when they answer a call (W-7, W-42). */
export const SESSION_ENDING_CODES: ReadonlySet<string> = new Set([
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "UNAUTHENTICATED",
]);

/** States nothing later clears: the page has to be launched again. */
const FINAL_STATES: ReadonlySet<BlockingState> = new Set([
  "configuration-error",
  "session-ended",
  "other-tab",
  "unsupported-browser",
]);

/** States of one round: only its end, or another round, clears them. */
const ROUND_STATES: ReadonlySet<BlockingState> = new Set([
  "verification-failed",
  "chain-unverified",
  "out-of-sync",
]);

/** Whether the state is final: nothing later replaces it. */
export const isFinal = (state: WrapperState): boolean =>
  state.blocking !== undefined && FINAL_STATES.has(state.blocking);

/** Whether an accepted Snapshot lifts the current blocking state. */
const lifts = (
  state: WrapperState,
  snapshot: SnapshotInput,
  cancel: CancelState | undefined,
): boolean =>
  state.blocking === undefined ||
  !ROUND_STATES.has(state.blocking) ||
  roundEnded(snapshot, cancel);

const without = <K extends keyof WrapperState>(
  state: WrapperState,
  key: K,
): WrapperState => {
  const next = { ...state };
  delete next[key];
  return next;
};

/** The blocking state the shell's checks call for, if any (W-19, W-26, W-44). */
const checkBlocking = (check: RoundCheck): BlockingState | undefined => {
  if (check.verdict === "verification-failed") return "verification-failed";
  if (check.verdict === "chain-unverified") return "chain-unverified";
  return check.outOfSync ? "out-of-sync" : undefined;
};

/**
 * The shown round is over: it is kept as the ended round until the player
 * starts another one (W-40), with its result, or `ended` when the shell's
 * cancel ended it (W-33). The slow notice goes with the poll.
 */
const endRound = (
  state: WrapperState,
  snapshot: SnapshotInput,
  cancel: CancelState | undefined,
): WrapperState =>
  snapshot.roundId === undefined
    ? state
    : {
        ...state,
        slow: false,
        endedRound: {
          roundId: snapshot.roundId,
          status:
            cancel === "ended"
              ? "ended"
              : (snapshot.status as EndedRound["status"]),
        },
      };

/**
 * Records the shell's checks of the shown round. A failed check blocks the
 * round until it is over (W-26: the round ends by its expiry rule); a round
 * that is over shows its result. A cancel that is `ended` ends the round,
 * whatever its last Snapshot shows: the blocking state of the round lifts
 * (W-25, W-33).
 */
const withCheck = (
  state: WrapperState,
  check: RoundCheck | undefined,
): WrapperState => {
  const shown = state.snapshot;
  if (check === undefined) return without(state, "check");
  const next = { ...state, check };
  if (shown !== undefined && check.cancel === "ended") {
    const lifted =
      next.blocking !== undefined && ROUND_STATES.has(next.blocking)
        ? without(next, "blocking")
        : next;
    return endRound(lifted, shown, check.cancel);
  }
  const blocking = checkBlocking(check);
  return blocking === undefined ||
    shown === undefined ||
    roundEnded(shown, check.cancel)
    ? next
    : block(next, blocking);
};

/**
 * Accepts a validated Snapshot, or ignores it when its `version` is lower than
 * the last accepted one, or equal to it (W-29); the shell's checks of the
 * round, which may have decided since, are applied either way. A round that
 * ended is kept as `endedRound` and stays until the player starts another round
 * (W-40).
 */
export const acceptSnapshot = (
  state: WrapperState,
  snapshot: SnapshotInput,
  check?: RoundCheck,
): WrapperState => {
  if (isFinal(state)) {
    return state;
  }
  if (
    state.snapshot !== undefined &&
    snapshot.version <= state.snapshot.version
  ) {
    const kept =
      check !== undefined && snapshot.roundId === state.snapshot.roundId
        ? withCheck(state, check)
        : state;
    return kept.connectionProblem
      ? { ...kept, connectionProblem: false }
      : kept;
  }
  const base = without(without(state, "problem"), "refused");
  let next: WrapperState = {
    ...(lifts(state, snapshot, check?.cancel)
      ? without(base, "blocking")
      : base),
    snapshot,
    connectionProblem: false,
  };
  if (state.snapshot?.status !== snapshot.status) {
    next = { ...next, slow: false };
  }
  if (roundEnded(snapshot, check?.cancel)) {
    next = endRound(next, snapshot, check?.cancel);
  }
  return withCheck(next, check);
};

/** A validated typed error (W-42). */
export const acceptProblem = (
  state: WrapperState,
  problem: ProblemInput,
): WrapperState => {
  if (isFinal(state)) {
    return state;
  }
  if (SESSION_ENDING_CODES.has(problem.code)) {
    return { ...state, blocking: "session-ended", connectionProblem: false };
  }
  if (problem.code === "STALE_ACTION") {
    return { ...state, blocking: "out-of-sync", connectionProblem: false };
  }
  if (problem.code === "ROUND_ACTIVE" && problem.snapshot !== undefined) {
    // The open round's Snapshot, validated with the problem: resume from it.
    return acceptSnapshot(state, problem.snapshot);
  }
  return { ...state, problem, connectionProblem: false };
};

/** One Snapshot read's outcome. */
export const acceptRead = (
  state: WrapperState,
  read: SnapshotRead,
): WrapperState => {
  switch (read.kind) {
    case "snapshot": {
      return acceptSnapshot(state, read.snapshot, read.check);
    }
    case "problem": {
      return acceptProblem(state, read.problem);
    }
    case "rejected": {
      return block(state, "snapshot-rejected");
    }
    case "network": {
      return isFinal(state) ? state : { ...state, connectionProblem: true };
    }
    case "session-ended": {
      return block(state, "session-ended");
    }
    case "refused": {
      return isFinal(state) ? state : { ...state, refused: true };
    }
    default: {
      return state;
    }
  }
};

/**
 * Shows a blocking state (W-44). A final one (configuration error, session
 * ended, another tab) is never replaced.
 */
export const block = (
  state: WrapperState,
  blocking: BlockingState,
): WrapperState => (isFinal(state) ? state : { ...state, blocking });

/**
 * The player starts another round: the ended round's panel goes (W-40), and so
 * do the previous round's error and round-scoped state.
 */
export const startNewRound = (state: WrapperState): WrapperState => {
  const next = without(
    without(without(state, "endedRound"), "problem"),
    "refused",
  );
  return next.blocking !== undefined && ROUND_STATES.has(next.blocking)
    ? without(next, "blocking")
    : next;
};

/** The player asks to try again: the error goes until the next answer. */
export const clearProblem = (state: WrapperState): WrapperState =>
  state.problem === undefined ? state : without(state, "problem");
