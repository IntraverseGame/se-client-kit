// Test-only: a manual wall clock (milliseconds since the epoch) whose timers
// fire only when the test advances it, in due order. No real clock or timer.

import type { Clock } from "@intraverse/se-client-play-client";

export type WallClock = Clock & {
  /** Moves the clock forward by `ms`, firing every timer that falls due. */
  readonly advance: (ms: number) => void;
  /** The due times of the pending timers, in order. */
  readonly dueTimes: () => readonly number[];
};

type Timer = { readonly due: number; readonly run: () => void };

export const createWallClock = (startMs: number): WallClock => {
  let now = startMs;
  let next = 0;
  const timers = new Map<number, Timer>();
  const advance = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .toSorted(([, a], [, b]) => a.due - b.due)[0];
      if (due === undefined) break;
      const [handle, timer] = due;
      timers.delete(handle);
      now = Math.max(now, timer.due);
      timer.run();
    }
    now = target;
  };
  return {
    now: () => now,
    setTimeout: (run, delayMs) => {
      next += 1;
      timers.set(next, { due: now + Math.max(0, delayMs), run });
      return next;
    },
    clearTimeout: handle => {
      timers.delete(handle as number);
    },
    advance,
    dueTimes: () =>
      [...timers.values()].map(timer => timer.due).toSorted((a, b) => a - b),
  };
};
