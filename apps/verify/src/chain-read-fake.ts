// A fake JSON-RPC endpoint set, a fake clock, and a fetch that refuses a
// non-undefined `this` as the real one does, for the chain read's tests.

import type { ChainReadClock, ChainReadDeps } from "./chain-read.ts";
import type { Hash32 } from "./hex.ts";

export const CHAIN = 8453;
export const BLOCK = 123_456n;
export const HASH_A: Hash32 = `0x${"ab".repeat(32)}`;
export const HASH_B: Hash32 = `0x${"cd".repeat(32)}`;

/** What a fake endpoint does: answers, or hangs until the clock fires. */
export type Behavior = {
  readonly chainId?: number | "garbage" | "missing";
  readonly hash?: string | "missing" | "wrong-block";
  readonly hang?: boolean;
  readonly status?: number;
};

export type Fake = {
  readonly deps: ChainReadDeps;
  readonly requests: { url: string; method: string; params: unknown }[];
  readonly delays: number[];
};

export const fake = (behaviors: Readonly<Record<string, Behavior>>): Fake => {
  const timers = new Map<number, () => void>();
  let next = 0;
  const delays: number[] = [];
  const requests: Fake["requests"] = [];
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
    for (const callback of timers.values()) callback();
  };
  const fakeFetch = function (
    this: unknown,
    input: string | URL | Request,
    init?: RequestInit,
  ) {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: unknown;
    };
    if (this !== undefined) throw new TypeError("Illegal invocation");
    requests.push({ url, method: body.method, params: body.params });
    const behavior = behaviors[url] ?? {};
    if (behavior.hang === true) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
        queueMicrotask(fire);
      });
    }
    const reply = (result: unknown): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
          status: behavior.status ?? 200,
        }),
      );
    if (body.method === "eth_chainId") {
      if (behavior.chainId === "missing") return reply(null);
      if (behavior.chainId === "garbage") return reply("eight");
      return reply(`0x${(behavior.chainId ?? CHAIN).toString(16)}`);
    }
    if (behavior.hash === "missing") return reply(null);
    const number =
      behavior.hash === "wrong-block" ? "0x1" : `0x${BLOCK.toString(16)}`;
    const hash = behavior.hash === "wrong-block" ? HASH_A : behavior.hash;
    return reply({ hash: hash ?? HASH_A, number });
  };
  return {
    deps: { fetch: fakeFetch as typeof fetch, clock },
    requests,
    delays,
  };
};
