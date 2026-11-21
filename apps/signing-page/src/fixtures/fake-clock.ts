// A manual clock for the page's tests: timers fire only when the test moves
// time with `advance`, in order of their due time.

import type { PageClock } from "../clock.ts";

export type FakeClock = PageClock & {
  /** Moves time forward, firing every timer due, then lets promises settle. */
  readonly advance: (ms: number) => Promise<void>;
  /** The timers not fired or cleared yet, by their delay. */
  readonly pending: () => readonly number[];
  readonly now: () => number;
};

type Timer = {
  readonly id: number;
  readonly due: number;
  readonly delay: number;
  readonly callback: () => void;
};

/** Lets every queued promise callback run. */
export const settle = async (): Promise<void> => {
  for (let round = 0; round < 20; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one microtask turn at a time
    await Promise.resolve();
  }
};

export const fakeClock = (): FakeClock => {
  let now = 0;
  let next = 1;
  const timers = new Map<number, Timer>();
  return {
    setTimeout: (callback, delay) => {
      const id = next;
      next += 1;
      timers.set(id, { id, due: now + delay, delay, callback });
      return id;
    },
    clearTimeout: handle => {
      timers.delete(handle as number);
    },
    advance: async ms => {
      const end = now + ms;
      await settle();
      for (;;) {
        const due = [...timers.values()]
          .filter(timer => timer.due <= end)
          .toSorted((a, b) => a.due - b.due || a.id - b.id)[0];
        if (due === undefined) break;
        timers.delete(due.id);
        now = due.due;
        due.callback();
        // oxlint-disable-next-line no-await-in-loop -- timers fire in order
        await settle();
      }
      now = end;
    },
    pending: () => [...timers.values()].map(timer => timer.delay),
    now: () => now,
  };
};
