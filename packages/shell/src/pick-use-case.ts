// The pick use case the controller bridge is given (`PickUseCase`, W-23): it
// hands the game's pick to the current round's flow, which re-checks it
// against the shell's own latest validated Snapshot, refuses a step it has
// already signed, and signs and sends the move. With no round open, every pick
// is `not_active`. The Wrapper wires it to the bridge; it holds no key and no
// token, and gives the bridge no signing capability beyond this one call.

import type { PickOutcome, PickUseCase } from "./controller-bridge.ts";
import type { SessionRound } from "./session-round.ts";

const NOT_ACTIVE: PickOutcome = Object.freeze({
  accepted: false,
  reason: "not_active",
});

/** The pick use case over the round flow `current` returns, if any. */
export const createPickUseCase =
  (current: () => SessionRound | undefined): PickUseCase =>
  pick => {
    const flow = current();
    return flow === undefined ? Promise.resolve(NOT_ACTIVE) : flow.pick(pick);
  };
