// The UI state's smaller transitions: leaving an ended round once another round
// shows (W-40), clearing a typed error when the player tries again (W-42), and
// whether the game's latest copy was built (W-38, W-55). wrapper-state.ts
// re-exports them with the rest of the state's transitions.

import type { WrapperState } from "./wrapper-state.ts";

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
