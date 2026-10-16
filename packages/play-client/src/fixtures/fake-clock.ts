import type { Clock, TimerHandle } from "../platform.ts";

type Timer = {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
};

export type FakeClock = Clock & {
  /** Moves time forward, firing every timer that falls due, in order. */
  readonly advance: (ms: number) => Promise<void>;
  /** The number of timers not yet fired or cleared. */
  readonly pending: () => number;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one more microtask chain settle
    await Promise.resolve();
  }
};

/** A manual clock: time moves only through `advance`. */
export const createFakeClock = (startMs: number): FakeClock => {
  let now = startMs;
  let nextId = 1;
  let timers: Timer[] = [];
  return {
    now: () => now,
    setTimeout: (callback: () => void, delayMs: number): TimerHandle => {
      const timer = { id: nextId, at: now + delayMs, callback };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    clearTimeout: (handle: TimerHandle): void => {
      timers = timers.filter(timer => timer.id !== handle);
    },
    pending: () => timers.length,
    advance: async (ms: number): Promise<void> => {
      const end = now + ms;
      await flush();
      for (;;) {
        const due = timers
          .filter(timer => timer.at <= end)
          .toSorted((a, b) => a.at - b.at || a.id - b.id)[0];
        if (due === undefined) {
          break;
        }
        timers = timers.filter(timer => timer.id !== due.id);
        now = due.at;
        due.callback();
        // oxlint-disable-next-line no-await-in-loop -- a fired timer's continuation runs before the next timer
        await flush();
      }
      now = end;
      await flush();
    },
  };
};
