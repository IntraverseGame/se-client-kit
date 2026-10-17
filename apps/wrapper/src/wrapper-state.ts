// The UI's state, and the pure transitions that change it. Everything comes
// from validated Snapshots and typed errors (W-28, W-29) or from the shell's
// verdicts; nothing here holds or sees a key or a token.

import {
  type ProblemInput,
  type RoundStatus,
  type SnapshotInput,
  type SnapshotRead,
  TERMINAL_STATUSES,
} from "./round-input.ts";

/**
 * The states that replace the round view (W-44), each shown distinctly. The
 * shell decides `other-tab` (W-14), `verification-failed` (W-26), and
 * `out-of-sync` (W-19); the UI only shows them.
 */
export type BlockingState =
  | "loading"
  | "configuration-error"
  | "session-ended"
  | "other-tab"
  | "verification-failed"
  | "out-of-sync"
  | "snapshot-rejected";

/** A round that ended, kept until the player starts another one (W-39, W-40). */
export type EndedRound = {
  readonly roundId: string;
  readonly status: Extract<RoundStatus, "won" | "lost" | "canceled">;
};

export type WrapperState = {
  readonly blocking?: BlockingState;
  /** The last accepted Snapshot. */
  readonly snapshot?: SnapshotInput;
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
]);

/** States of one round: only its end, or another round, clears them. */
const ROUND_STATES: ReadonlySet<BlockingState> = new Set([
  "verification-failed",
  "out-of-sync",
]);

const isFinal = (state: WrapperState): boolean =>
  state.blocking !== undefined && FINAL_STATES.has(state.blocking);

/** Whether an accepted Snapshot lifts the current blocking state. */
const lifts = (state: WrapperState, snapshot: SnapshotInput): boolean =>
  state.blocking === undefined ||
  !ROUND_STATES.has(state.blocking) ||
  TERMINAL_STATUSES.has(snapshot.status);

const without = <K extends keyof WrapperState>(
  state: WrapperState,
  key: K,
): WrapperState => {
  const next = { ...state };
  delete next[key];
  return next;
};

/**
 * Accepts a validated Snapshot, or ignores it when its `version` is lower than
 * the last accepted one, or equal to it (W-29). A round that ended is kept as
 * `endedRound` and stays until the player starts another round (W-40).
 */
export const acceptSnapshot = (
  state: WrapperState,
  snapshot: SnapshotInput,
): WrapperState => {
  if (isFinal(state)) {
    return state;
  }
  if (
    state.snapshot !== undefined &&
    snapshot.version <= state.snapshot.version
  ) {
    return state.connectionProblem
      ? { ...state, connectionProblem: false }
      : state;
  }
  const base = without(state, "problem");
  let next: WrapperState = {
    ...(lifts(state, snapshot) ? without(base, "blocking") : base),
    snapshot,
    connectionProblem: false,
  };
  if (state.snapshot?.status !== snapshot.status) {
    next = { ...next, slow: false };
  }
  if (
    TERMINAL_STATUSES.has(snapshot.status) &&
    snapshot.roundId !== undefined
  ) {
    next = {
      ...next,
      endedRound: {
        roundId: snapshot.roundId,
        status: snapshot.status as EndedRound["status"],
      },
    };
  }
  return next;
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
      return acceptSnapshot(state, read.snapshot);
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
  const next = without(without(state, "endedRound"), "problem");
  return next.blocking !== undefined && ROUND_STATES.has(next.blocking)
    ? without(next, "blocking")
    : next;
};

/** The player asks to try again: the error goes until the next answer. */
export const clearProblem = (state: WrapperState): WrapperState =>
  state.problem === undefined ? state : without(state, "problem");
