// The UI state's smaller transitions: keeping a round that ended as the ended
// round (W-40, with its last verdict for the fairness chip, W-59), leaving it
// once another round shows (W-40), clearing a typed error when the player tries again (W-42), and
// whether the game's latest copy was built (W-38, W-55). wrapper-state.ts
// re-exports them with the rest of the state's transitions.

import type { RoundCheck, SnapshotInput } from "./round-input.ts";
import type { EndedRound, WrapperState } from "./wrapper-state.ts";

const withoutEndedRound = ({
  endedRound: _ended,
  ...rest
}: WrapperState): WrapperState => rest;

const withoutProblem = ({
  problem: _problem,
  ...rest
}: WrapperState): WrapperState => rest;

/**
 * The player started another round from the ended round `from` (W-40): once a
 * Snapshot of another round is shown, `from`'s panel goes. Until then (a start
 * refused, or not answered yet) it stays with its result.
 */
export const leaveEndedRound = (
  state: WrapperState,
  from: string,
): WrapperState =>
  state.endedRound?.roundId === from &&
  state.snapshot?.roundId !== undefined &&
  state.snapshot.roundId !== from
    ? withoutEndedRound(state)
    : state;

/** The player asks to try again: the error goes until the next answer. */
export const clearProblem = (state: WrapperState): WrapperState =>
  state.problem === undefined ? state : withoutProblem(state);

/**
 * Whether the latest Snapshot's game copy was built (W-38, W-55): a `playback`
 * copy that failed closed shows the notice in place of the frame until a later
 * one is built.
 */
export const gameCopied = (
  state: WrapperState,
  copied: boolean,
): WrapperState => {
  if (!copied) {
    return state.gameCopyFailed === true
      ? state
      : { ...state, gameCopyFailed: true };
  }
  if (state.gameCopyFailed === undefined) return state;
  const { gameCopyFailed: _failed, ...rest } = state;
  return rest;
};

/**
 * The shown round is over: it is kept as the ended round until the player
 * starts another one (W-40), with its result, or `ended` when the shell's
 * cancel ended it (W-33). The slow notice goes with the poll.
 */
export const endRound = (
  state: WrapperState,
  snapshot: SnapshotInput,
  check: RoundCheck | undefined,
): WrapperState =>
  snapshot.roundId === undefined
    ? state
    : {
        ...state,
        slow: false,
        endedRound: {
          roundId: snapshot.roundId,
          status:
            check?.cancel === "ended"
              ? "ended"
              : (snapshot.status as EndedRound["status"]),
          ...(check === undefined ? {} : { verdict: verdictOf(check) }),
        },
      };

/** What the ended round keeps of the shell's checks (W-59). */
export const verdictOf = (
  check: RoundCheck,
): NonNullable<EndedRound["verdict"]> => ({
  verdict: check.verdict,
  ...(check.failure === undefined ? {} : { failure: check.failure }),
  ...(check.tipFailure === undefined ? {} : { tipFailure: check.tipFailure }),
});
