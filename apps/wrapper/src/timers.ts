// The clock and timers the Wrapper's UI uses, injected so that tests drive
// time themselves (no real clock, no real timer).

/** An opaque handle from `setTimeout`. */
export type TimerHandle = unknown;

export type Timers = {
  /** Milliseconds on a monotonic or wall clock; only differences are used. */
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, ms: number) => TimerHandle;
  readonly clearTimeout: (handle: TimerHandle) => void;
};

/** The platform's timers, for the browser entry. */
export const platformTimers = (scope: {
  readonly setTimeout: (callback: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
  readonly performance: { readonly now: () => number };
}): Timers =>
  Object.freeze({
    now: (): number => scope.performance.now(),
    setTimeout: (callback: () => void, ms: number): TimerHandle =>
      scope.setTimeout(callback, ms),
    clearTimeout: (handle: TimerHandle): void => {
      if (typeof handle === "number") {
        scope.clearTimeout(handle);
      }
    },
  });
