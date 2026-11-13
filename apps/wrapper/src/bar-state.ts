// What the bar reads off the state besides its slots: the status detail that
// replaces a state's own (a pending move's waiting detail, W-16; the slow
// notice, W-35; a run of autoplay, W-61), and the state edge (W-60), a 2 px
// line that mirrors the status line: it sweeps while a round is starting,
// checked, or resolving (or a start is in flight), flashes once on a win, and
// takes the problem colour while a connection problem or an error shows. The
// edge is decoration (`aria-hidden`): the status line carries the meaning.

import { withCount } from "./bar-messages.ts";
import type { Messages } from "./messages.ts";
import type { ViewOptions } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

/** The state edge's form (W-60). */
export type Edge = "none" | "sweep" | "won" | "problem";

/**
 * The status detail of a pending move or cash-out (W-16, W-57): only while an
 * error that does not stop the round shows beside an `active` round, so normal
 * play never flashes it.
 */
const pendingDetail = (
  m: Messages,
  state: WrapperState,
): string | undefined => {
  const pending = state.check?.pending;
  const erred =
    state.problem !== undefined ||
    state.refused === true ||
    state.connectionProblem;
  if (pending === undefined || !erred || state.snapshot?.status !== "active") {
    return undefined;
  }
  return pending === "cash-out"
    ? m["detail.waitingCashOut"]
    : m["detail.waitingMove"];
};

/**
 * The detail that replaces the status line's own: the waiting detail, the slow
 * notice, or "Autoplay · n left" while a run goes (W-61).
 */
export const waitingDetail = (
  m: Messages,
  state: WrapperState,
  options?: ViewOptions,
): string | undefined => {
  const run = options?.autoplay?.run;
  return (
    pendingDetail(m, state) ??
    (state.slow ? m["notice.slow"] : undefined) ??
    (run === undefined ? undefined : withCount(m["autoplay.status"], run.left))
  );
};

/** The state edge for the state (W-60). */
export const edgeOf = (state: WrapperState, options: ViewOptions): Edge => {
  const { snapshot, check } = state;
  // The alert line's errors (W-41 to W-43), and every state on the cover.
  if (
    state.problem !== undefined ||
    state.refused === true ||
    state.connectionProblem ||
    (state.blocking !== undefined && state.blocking !== "loading") ||
    state.gameIncompatible === true
  ) {
    return "problem";
  }
  if (
    options.calling === true ||
    snapshot?.status === "starting" ||
    snapshot?.status === "resolving" ||
    (snapshot?.status === "active" && check?.verdict === "checking")
  ) {
    return "sweep";
  }
  return snapshot?.status === "won" ? "won" : "none";
};
