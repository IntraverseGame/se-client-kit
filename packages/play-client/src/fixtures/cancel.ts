import type { CancelSignal } from "../platform.ts";

export type FakeCancel = {
  readonly signal: CancelSignal;
  readonly abort: () => void;
};

/** A cancel signal with the platform `AbortSignal`'s listener behavior. */
export const createCancel = (): FakeCancel => {
  const listeners = new Set<() => void>();
  const state = { aborted: false };
  const signal: CancelSignal = {
    get aborted() {
      return state.aborted;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  return {
    signal,
    abort: () => {
      state.aborted = true;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};
