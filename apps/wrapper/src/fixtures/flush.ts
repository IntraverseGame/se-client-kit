// Test-only: settling promise callbacks without a real timer.

import type { ManualTimers } from "./manual-timers.ts";

/** Lets queued promise callbacks run for `rounds` microtask turns. */
export const flush = async (rounds = 10): Promise<void> => {
  let chain: Promise<unknown> = Promise.resolve();
  for (let i = 0; i < rounds; i += 1) {
    chain = chain.then(() => null);
  }
  await chain;
};

/** Moves the manual clock in 100 ms steps, settling the reads each starts. */
export const stepTimers = async (
  timers: ManualTimers,
  ms: number,
): Promise<void> => {
  let chain: Promise<unknown> = Promise.resolve();
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    chain = chain.then(() => {
      timers.advance(100);
      return flush();
    });
  }
  await chain;
};
