// What the Snapshot poller follows (W-35): the shown round, the shell's cancel
// of it, and whether its move or cash-out is not confirmed (W-16), or nothing
// when no poll may run (a typed error, a blocking state).

import type { CancelState, RoundProgress } from "./round-input.ts";
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
