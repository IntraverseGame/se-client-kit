// Test-only: a fake `fetch` that answers one scripted response, records each
// request, can refuse a non-undefined `this` as the real one does, and a fake
// clock whose timers fire only when the test says so. No real network, no
// real clock.

import type { ChainReadClock } from "../chain-read.ts";

/** What the fake answers. */
export type Reply =
  | { readonly kind: "json"; readonly status?: number; readonly body: unknown }
  | { readonly kind: "text"; readonly status?: number; readonly body: string }
  /** `fetch` rejects (offline, DNS, TLS, a blocked request). */
  | { readonly kind: "reject" }
  /** No answer until the request is aborted (the timeout). */
  | { readonly kind: "hang" };

export type HttpFake = {
  readonly fetch: typeof fetch;
  readonly clock: ChainReadClock;
  readonly requests: { readonly url: string; readonly init: RequestInit }[];
  /** The delay of every timer set, in order. */
  readonly delays: number[];
  /** How many timers are still pending. */
  readonly pending: () => number;
  /** Fires every pending timer. */
  readonly fire: () => void;
};

/**
 * `unbound`: refuse a call with a `this` (as the browser's `fetch` does when
 * taken off `window`); the tests of that rule set it, the others read the
 * module's other behavior.
 */
export const httpFake = (reply: Reply, unbound = false): HttpFake => {
  const timers = new Map<number, () => void>();
  let next = 0;
  const delays: number[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const clock: ChainReadClock = {
    setTimeout: (callback, ms) => {
      next += 1;
      timers.set(next, callback);
      delays.push(ms);
      return next;
    },
    clearTimeout: handle => {
      timers.delete(handle as number);
    },
  };
  const fire = (): void => {
    for (const [handle, callback] of timers) {
      timers.delete(handle);
      callback();
    }
  };
  // A `function`, not an arrow: it must see the `this` it is called with.
  const fakeFetch = function (
    this: unknown,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    if (unbound && this !== undefined) {
      throw new TypeError("Illegal invocation");
    }
    requests.push({ url: String(input), init: init ?? {} });
    switch (reply.kind) {
      case "reject":
        return Promise.reject(new TypeError("Failed to fetch"));
      case "hang":
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
          queueMicrotask(fire);
        });
      case "json":
        return Promise.resolve(
          new Response(JSON.stringify(reply.body), {
            status: reply.status ?? 200,
          }),
        );
      default:
        return Promise.resolve(
          new Response(reply.body, { status: reply.status ?? 200 }),
        );
    }
  };
  return {
    fetch: fakeFetch as typeof fetch,
    clock,
    requests,
    delays,
    pending: () => timers.size,
    fire,
  };
};
