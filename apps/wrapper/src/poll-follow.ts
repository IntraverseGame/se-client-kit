// What the Snapshot poller follows (W-35): the shown round, the shell's cancel
// of it, and whether its move or cash-out is not confirmed (W-16), or nothing
// when no poll may run (a typed error, a blocking state).

import {
  type CancelState,
  type RoundProgress,
  roundEnded,
} from "./round-input.ts";
import type { ChangeCause } from "./view-options.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

/**
 * What the poller follows: the shown round, the shell's cancel of it, and
 * whether its move or cash-out is not confirmed (W-16).
 */
export type Followed = {
  readonly round: RoundProgress | undefined;
  readonly cancel?: CancelState;
  readonly unconfirmed?: boolean;
};

const NOTHING: Followed = Object.freeze({ round: undefined });

/**
 * The round the poller follows, or none when nothing may be polled. While the
 * shell's cancel of the round is `settling` or `check-later`, its reads go on
 * through the round's own failed state, a typed error, or a rejected read, none
 * of which the player could retry (W-35: no cancel left unread); only a final
 * state stops them.
 */
export const followed = (state: WrapperState): Followed => {
  const cancel = state.check?.cancel;
  if (cancel === "settling" || cancel === "check-later") {
    return isFinal(state) ? NOTHING : { round: state.snapshot, cancel };
  }
  return state.blocking === undefined && state.problem === undefined
    ? {
        round: state.snapshot,
        ...(cancel === undefined ? {} : { cancel }),
        unconfirmed: state.check?.unconfirmed !== undefined,
      }
    : NOTHING;
};

/**
 * Which cause a change of the UI is shown with (W-46, W-55): a poll never moves
 * focus, except the poll that brings the result of the book round the player
 * just started (decided by the human, 2026-10-28): its start answered
 * `starting` and the round's result arrives by a poll, so the result heading
 * takes focus as it would after the player's own action. Only that round's
 * first shown result, and only once.
 */
export type ResultFocus = {
  /** The player asked to start a round. */
  readonly started: () => void;
  /** The cause to show `state` with, given the cause of its change. */
  readonly causeOf: (state: WrapperState, cause: ChangeCause) => ChangeCause;
};

export const createResultFocus = (): ResultFocus => {
  // The player's start is waiting for its answer.
  let starting = false;
  // The book round the player started, until its result is shown.
  let round: string | undefined;
  return Object.freeze({
    started: (): void => {
      starting = true;
      round = undefined;
    },
    causeOf: (state: WrapperState, cause: ChangeCause): ChangeCause => {
      const { snapshot } = state;
      if (cause === "player") {
        if (starting) {
          starting = false;
          round =
            snapshot?.presentation === "playback" &&
            snapshot.status === "starting"
              ? snapshot.roundId
              : undefined;
        }
        return cause;
      }
      if (round === undefined || snapshot?.roundId !== round) return cause;
      if (!roundEnded(snapshot, state.check?.cancel)) return cause;
      round = undefined;
      return "player";
    },
  });
};
