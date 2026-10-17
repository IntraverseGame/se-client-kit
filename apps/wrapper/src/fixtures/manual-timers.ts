// A manual clock for the Wrapper's tests: time moves only when a test calls
// `advance`, and a timer fires only then, in due order.

import type { TimerHandle, Timers } from "../timers.ts";

type Pending = {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
};

export type ManualTimers = Timers & {
  /** Moves the clock forward, firing every timer that falls due, in order. */
  readonly advance: (ms: number) => void;
  /** The delays of the timers still pending, from now. */
  readonly pendingDelays: () => readonly number[];
};

export const manualTimers = (start = 0): ManualTimers => {
  let now = start;
  let nextId = 1;
  let pending: Pending[] = [];
  const advance = (ms: number): void => {
    const end = now + ms;
    for (;;) {
      const due = pending
        .filter(timer => timer.at <= end)
        .toSorted((a, b) => a.at - b.at || a.id - b.id)[0];
      if (due === undefined) {
        break;
      }
      pending = pending.filter(timer => timer.id !== due.id);
      now = due.at;
      due.callback();
    }
    now = end;
  };
  return {
    now: (): number => now,
    setTimeout: (callback: () => void, ms: number): TimerHandle => {
      const id = nextId;
      nextId += 1;
      pending.push({ id, at: now + ms, callback });
      return id;
    },
    clearTimeout: (handle: TimerHandle): void => {
      pending = pending.filter(timer => timer.id !== handle);
    },
    advance,
    pendingDelays: (): readonly number[] =>
      pending.map(timer => timer.at - now).toSorted((a, b) => a - b),
  };
};
