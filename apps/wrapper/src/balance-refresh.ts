// RFC-001 Q16, W-35: where the Wrapper does not poll (the next-start screen
// and a round's result), a deposit made in another tab leaves the balance out
// of date. When the page becomes visible again, the Snapshot
// is read once, so the balance and the bet limits are current before the next
// start. One read per return, never a poll: returns that come together are
// merged by a debounce, a read in flight takes no second one, and nothing
// is read in a state that polls, shows a problem, or is final. Time comes from
// the injected timers only.

import { roundEnded } from "./round-input.ts";
import type { TimerHandle, Timers } from "./timers.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

/** The merge window for page returns that come together. */
export const BALANCE_REFRESH_DEBOUNCE_MS = 1000;

/**
 * Whether the state shows a balance that a read may refresh now: `idle`, or a
 * round that ended, with no blocking state, typed error, or connection problem
 * (those have their own reads, W-43, W-44), and not the shell's cancel
 * mid-way.
 */
export const mayRefreshBalance = (state: WrapperState): boolean =>
  !isFinal(state) &&
  state.blocking === undefined &&
  state.problem === undefined &&
  !state.connectionProblem &&
  !state.offline &&
  state.snapshot !== undefined &&
  (state.snapshot.status === "idle" ||
    roundEnded(state.snapshot, state.check?.cancel));

/** The part of the document that tells when the page is visible again. */
export type VisibilityTarget = {
  readonly visibilityState: string;
  readonly addEventListener: (
    type: "visibilitychange",
    listener: () => void,
  ) => void;
  readonly removeEventListener: (
    type: "visibilitychange",
    listener: () => void,
  ) => void;
};

/**
 * The page becoming visible again, and only that: `focus` also fires when the
 * focus moves from the game's frame back to the Wrapper's own page, after every
 * move, which is not a return (RFC-001 Q16).
 */
export const visibilityReturns =
  (doc: VisibilityTarget) =>
  (onReturn: () => void): (() => void) => {
    const onChange = (): void => {
      if (doc.visibilityState === "visible") onReturn();
    };
    doc.addEventListener("visibilitychange", onChange);
    return (): void => {
      doc.removeEventListener("visibilitychange", onChange);
    };
  };

export type BalanceRefreshOptions = {
  readonly timers: Timers;
  /** Calls back when the page returns; answers the unsubscribe. */
  readonly subscribe: (onReturn: () => void) => () => void;
  /** The state now; the read is allowed by `mayRefreshBalance`. */
  readonly state: () => WrapperState;
  /** A start or cash-out call is in flight: no read beside it. */
  readonly calling: () => boolean;
  /** One quiet read (`readQuietly`); settles when it is applied or dropped. */
  readonly read: () => Promise<void>;
  readonly debounceMs?: number;
};

/** Starts the watch; returns its stop. */
export const watchBalance = (options: BalanceRefreshOptions): (() => void) => {
  const delay = options.debounceMs ?? BALANCE_REFRESH_DEBOUNCE_MS;
  let waiting: TimerHandle | undefined;
  let reading = false;
  const refresh = (): void => {
    waiting = undefined;
    if (reading || options.calling() || !mayRefreshBalance(options.state())) {
      return;
    }
    reading = true;
    void options.read().finally(() => {
      reading = false;
    });
  };
  const unsubscribe = options.subscribe(() => {
    if (waiting !== undefined) options.timers.clearTimeout(waiting);
    waiting = options.timers.setTimeout(refresh, delay);
  });
  return (): void => {
    unsubscribe();
    if (waiting !== undefined) options.timers.clearTimeout(waiting);
    waiting = undefined;
  };
};
