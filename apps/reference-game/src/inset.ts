// The game's side of the `inset` capability (RFC-005, W-38): it declares
// `inset` in its `hello`, so the Wrapper gives its frame the whole stage and
// tells it the band its bar covers (`layout`). The game keeps its whole
// interface above that band, and only its background runs under it
// (render.ts). Compatibility runs one way: a Wrapper that does not know the
// capability ignores such a `hello` and answers nothing, so when no `layout`
// arrives within `LAYOUT_TIMEOUT_MS` the game says a plain `hello` and lays
// out as a game without the capability (a band of 0). It never falls back on a
// missing `snapshot`, which a Wrapper may rightly withhold.

import { helloMessage } from "./protocol.ts";

/** How long the game waits for `layout` after its `hello`. */
export const LAYOUT_TIMEOUT_MS = 2000;

/** The timers the fallback uses; injected, so tests drive time. */
export type GameTimers = {
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

export type Inset = {
  /** A `layout` arrived: the band the bar covers, in CSS pixels. */
  readonly layout: (insetBottom: number) => void;
  readonly close: () => void;
};

/**
 * Says the capable `hello` and starts the fallback's timer (none without
 * `timers`); `onLayout` gets each band, and 0 on the fallback.
 */
export const sayHello = (options: {
  readonly post: (message: unknown) => void;
  readonly timers: GameTimers | undefined;
  readonly onLayout: (insetBottom: number) => void;
}): Inset => {
  let answered = false;
  options.post(helloMessage());
  const timer = options.timers?.setTimeout(() => {
    if (answered) return;
    answered = true;
    // No `layout`: the Wrapper did not take the capable `hello`.
    options.post(helloMessage(false));
    options.onLayout(0);
  }, LAYOUT_TIMEOUT_MS);
  const stop = (): void => {
    if (timer !== undefined) options.timers?.clearTimeout(timer);
  };
  return Object.freeze({
    layout: (insetBottom: number): void => {
      answered = true;
      stop();
      options.onLayout(insetBottom);
    },
    close: stop,
  });
};
