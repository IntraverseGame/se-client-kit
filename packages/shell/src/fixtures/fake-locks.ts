// Test-only: an in-memory `LockManager` with the semantics the shell relies on
// (exclusive mode, `ifAvailable`), shared between shell instances to stand for
// the tabs of one browser.

import type { LockManagerLike, LockRequestOptions } from "../web-lock.ts";

type Hold = { readonly abort: (reason: Error) => void };

export type FakeLockManager = LockManagerLike & {
  /** Whether some holder has `name`. */
  readonly isHeld: (name: string) => boolean;
  /** Takes `name` away from its holder, as `steal: true` would. */
  readonly steal: (name: string) => void;
  /** The names requested, in order. */
  readonly requested: () => readonly string[];
};

export const createFakeLockManager = (): FakeLockManager => {
  const holds = new Map<string, Hold>();
  const requested: string[] = [];

  const request = async (
    name: string,
    options: LockRequestOptions,
    callback: (lock: unknown) => Promise<unknown> | undefined,
  ): Promise<unknown> => {
    requested.push(name);
    if (options.mode !== "exclusive" || !options.ifAvailable) {
      throw new Error("the fake supports only exclusive ifAvailable requests");
    }
    // The platform calls the callback asynchronously.
    await Promise.resolve();
    if (holds.has(name)) return callback(null);
    return new Promise<unknown>((resolve, reject) => {
      const hold: Hold = {
        abort: (reason: Error): void => {
          reject(reason);
        },
      };
      holds.set(name, hold);
      const settle = (): void => {
        if (holds.get(name) === hold) holds.delete(name);
      };
      const run = async (): Promise<void> => {
        try {
          const value = await callback({ name, mode: "exclusive" });
          settle();
          resolve(value);
        } catch (error) {
          settle();
          reject(error instanceof Error ? error : new Error("rejected"));
        }
      };
      void run();
    });
  };

  return {
    request,
    isHeld: (name: string): boolean => holds.has(name),
    steal: (name: string): void => {
      const hold = holds.get(name);
      holds.delete(name);
      hold?.abort(new Error("AbortError"));
    },
    requested: (): readonly string[] => requested,
  };
};

/** Lets pending promise callbacks run. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one more microtask chain settle
    await Promise.resolve();
  }
};
