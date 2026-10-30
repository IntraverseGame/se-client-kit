// The browser entry of the Wrapper: it takes the launch code out of the URL
// before anything else (W-1: before any request or log line), then wires the
// platform (DOM, `fetch`, timers, the online state, the clipboard, the
// console, Web Locks, the random sources, the page's framing and its parent,
// and the height observer) into `boot`. The launch code stays
// sealed: nothing here can read it, and only the shell's session redeems it.

import {
  type Clock,
  createLogger,
  discardLaunchCode,
  type LogRecord,
  openPlaySession,
  takeLaunchCode,
} from "@intraverse/se-client-shell";

import { visibilityReturns } from "./balance-refresh.ts";
import { boot } from "./boot.ts";
import { embeddingOf } from "./embedding.ts";
import {
  followBarLayout,
  observeHeight,
  stageMinimumOf,
} from "./height-observer.ts";
import { createJsonRpcTransport } from "./json-rpc.ts";
import { ENVIRONMENT_CONFIG_PATH } from "./load-environment-config.ts";
import { platformTimers } from "./timers.ts";

const launchCode = takeLaunchCode(globalThis.location, globalThis.history);

// The console shows `warn` and above, as redacted records (W-4, Observability).
const sink = (record: LogRecord): void => {
  if (record.level === "error") {
    console.error(record);
  } else {
    console.warn(record);
  }
};

/** The session's clock: wall time, since token deadlines are RFC 3339 (W-5). */
const wallClock: Clock = Object.freeze({
  now: (): number => Date.now(),
  setTimeout: (callback: () => void, delayMs: number): unknown =>
    globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown): void => {
    if (typeof handle === "number") globalThis.clearTimeout(handle);
  },
});

const host = document.querySelector<HTMLElement>("#app");
if (host !== null) {
  void boot({
    doc: document,
    host,
    timers: platformTimers(globalThis),
    fetch: (url, init) => globalThis.fetch(url, init),
    configUrl: new URL(ENVIRONMENT_CONFIG_PATH, document.baseURI).href,
    logger: createLogger(sink),
    connectivity: {
      onLine: (): boolean => navigator.onLine,
      subscribe: (onChange: () => void): (() => void) => {
        globalThis.addEventListener("online", onChange);
        globalThis.addEventListener("offline", onChange);
        return (): void => {
          globalThis.removeEventListener("online", onChange);
          globalThis.removeEventListener("offline", onChange);
        };
      },
    },
    // A tab visible again: one balance read (RFC-001 Q16).
    returns: visibilityReturns(document),
    copyText: (text: string): Promise<void> =>
      navigator.clipboard.writeText(text),
    embedding: embeddingOf(globalThis.window),
    // The operator page, when framed: only `welcome` and `resize` go to it,
    // to the origin its handshake fixed (W-49b).
    parent: globalThis.window.parent,
    observeHeight: onHeight => {
      observeHeight(
        {
          doc: document,
          createObserver: onResize => new ResizeObserver(onResize),
          requestFrame: callback => {
            globalThis.requestAnimationFrame(callback);
          },
          minHeightOf: element =>
            stageMinimumOf(globalThis.getComputedStyle(element).minHeight),
        },
        onHeight,
      );
    },
    window: {
      addEventListener: (type, listener) => {
        globalThis.addEventListener(type, listener);
      },
      removeEventListener: (type, listener) => {
        globalThis.removeEventListener(type, listener);
      },
      origin: globalThis.location.origin,
    },
    // A refused configuration, framing, or handshake redeems nothing (W-1,
    // W-49a, W-49c).
    discardLaunchCode: () => {
      discardLaunchCode(launchCode);
    },
    openSession: config =>
      openPlaySession({
        launchCode,
        playApiBaseUrl: config.playApiBaseUrl,
        // The signal is the platform `AbortController`'s (play-client creates
        // it), so it is an `AbortSignal`; the kit types it structurally.
        fetch: (url, init) => globalThis.fetch(url, init as RequestInit),
        clock: wallClock,
        config: config.chain,
        locks: navigator.locks,
        randomUuid: (): string => crypto.randomUUID(),
        rpc: createJsonRpcTransport((url, init) => globalThis.fetch(url, init)),
        // PROVISIONAL (W-26b): the `tip` bind rule, the weaker of the two,
        // which an honest `future` bind also satisfies; the stricter rule waits
        // for the contract that carries the bind's mode.
        bindMode: "tip",
        // The session checks D, the redeem answer's `gameOrigin` and nothing
        // else, against these, fixed here (W-37).
        gameOrigins: config.gameOrigins,
        ownOrigin: globalThis.location.origin,
      }),
  });
  // The UI is rendered: the bar is sticky only while it takes at most half the
  // viewport, and the alert line is reachable while it overflows (W-57).
  followBarLayout({
    doc: document,
    createObserver: onResize => new ResizeObserver(onResize),
    onViewportResize: onResize => {
      globalThis.addEventListener("resize", onResize);
    },
  });
}
