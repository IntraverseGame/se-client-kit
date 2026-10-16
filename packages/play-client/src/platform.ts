// The platform APIs the client uses, as the structural types it needs. The kit
// compiles without the DOM library, so the client names only what it calls; the
// browser's `fetch`, `AbortController`, and timers satisfy these types, and a
// test injects fakes.

/** The response headers the client reads. */
export type HeadersLike = {
  readonly get: (name: string) => string | null;
};

/** The part of a `fetch` response the client reads. */
export type ResponseLike = {
  readonly status: number;
  readonly headers: HeadersLike;
  readonly text: () => Promise<string>;
};

/** An abort signal, passed through to `fetch` untouched. */
export type AbortSignalLike = {
  readonly aborted: boolean;
};

/** The `fetch` options the client sets on every request (W-3). */
export type RequestInitLike = {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly credentials: "omit";
  readonly cache: "no-store";
  readonly referrerPolicy: "no-referrer";
  /** A redirect is refused: the token is never sent to another URL. */
  readonly redirect: "error";
  readonly signal?: AbortSignalLike;
};

/** The platform `fetch`, or a fake of it. */
export type FetchLike = (
  url: string,
  init: RequestInitLike,
) => Promise<ResponseLike>;

/** An `AbortController`, or a fake of it. */
export type AbortControllerLike = {
  readonly signal: AbortSignalLike;
  readonly abort: () => void;
};

/** An opaque timer handle. */
export type TimerHandle = unknown;

/**
 * Time and timers, injected so that tests control them. `now` is the local
 * clock in milliseconds since the epoch (`Date.now()` in a browser).
 */
export type Clock = {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  readonly clearTimeout: (handle: TimerHandle) => void;
};

/**
 * A caller's cancel signal: the platform `AbortSignal` satisfies it. Aborting
 * it ends a request (W-43: the shell stops a call when the session ends).
 */
export type CancelSignal = {
  readonly aborted: boolean;
  readonly addEventListener: (type: "abort", listener: () => void) => void;
  readonly removeEventListener: (type: "abort", listener: () => void) => void;
};

const noop = (): void => {};

/** Runs `listener` once when `signal` aborts; returns the unsubscribe. */
export const onAbort = (
  signal: CancelSignal | undefined,
  listener: () => void,
): (() => void) => {
  if (signal === undefined) {
    return noop;
  }
  signal.addEventListener("abort", listener);
  return () => {
    signal.removeEventListener("abort", listener);
  };
};

/**
 * Waits `delayMs` on the injected clock. Resolves `false` when `signal` aborted
 * first; the timer is then cleared.
 */
export const sleep = (
  clock: Clock,
  delayMs: number,
  signal?: CancelSignal,
): Promise<boolean> =>
  new Promise<boolean>(resolve => {
    let unsubscribe = noop;
    const handle = clock.setTimeout(() => {
      unsubscribe();
      resolve(true);
    }, delayMs);
    unsubscribe = onAbort(signal, () => {
      clock.clearTimeout(handle);
      unsubscribe();
      resolve(false);
    });
  });
