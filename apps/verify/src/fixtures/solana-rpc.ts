// Test-only: a fake Solana JSON-RPC endpoint set and a manual clock, for the
// Solana chain read's tests (VT-14). Each endpoint answers `getGenesisHash`,
// `getBlock`, and `getBlocksWithLimit` from a script, at once, after a delay on
// the manual clock, or never (until the request is aborted). A call it was not
// scripted for is recorded as unexpected. No real network, no real clock.
//
// The answers are synthetic: the block values are RFC-007 section 5's base58
// vectors, used as `blockhash` texts.

import type { ChainReadClock, ChainReadDeps } from "../chain-read.ts";

/** Mainnet-beta's genesis hash, the pin of cluster 101. */
export const MAINNET = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
/** Testnet's genesis hash: another cluster for a mainnet-beta source. */
export const TESTNET = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";

/** Block values, base58 and as the page writes them (RFC-007's vectors). */
export const VALUE_A = {
  base58: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  hex: "0xce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab",
} as const;
export const VALUE_B = {
  base58: "JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG",
  hex: `0x${"ff".repeat(32)}`,
} as const;
/** 33 bytes and 31 bytes: well-formed base58, refused by the decoded length. */
export const BYTES_33 = "JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFH";
export const BYTES_31 = "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofL";
/** A valid parent's `blockhash` (32 zero bytes). */
export const PARENT = "11111111111111111111111111111111";

/** The round's slot N, and the slot of the first block after it when skipped. */
export const SLOT = 380_000_000n;
export const NEXT = SLOT + 2n;

/** A `getBlock` result for a block at `slot`, with `change` applied. */
export const blockAt = (
  slot: bigint,
  blockhash: string,
  change: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  blockhash,
  previousBlockhash: PARENT,
  parentSlot: Number(slot) - 1,
  blockTime: 1_763_600_000,
  blockHeight: 360_000_000,
  ...change,
});

/** What a fake endpoint answers to one call. */
export type Reply =
  | { readonly result: unknown }
  | { readonly error: number; readonly message?: string }
  | { readonly status: number }
  /** A body as is: not a JSON-RPC response, or one without `jsonrpc`. */
  | { readonly body: unknown }
  /** Pends until the request's signal aborts. */
  | "hang";

/** A reply, or a reply sent `after` milliseconds of the manual clock. */
export type Scripted =
  | Reply
  | { readonly after: number; readonly reply: Reply };

/** One endpoint's script; `getBlock` and `getBlocksWithLimit` by slot. */
export type SolanaScript = {
  readonly genesis?: Scripted;
  readonly blocks?: Readonly<Record<string, Scripted>>;
  readonly next?: Readonly<Record<string, Scripted>>;
};

/** A block at N with `value`, on mainnet-beta. */
export const agreeing = (value: string = VALUE_A.base58): SolanaScript => ({
  blocks: { [SLOT.toString()]: { result: blockAt(SLOT, value) } },
});

/** N skipped (`code`), the next finalized block at `NEXT` with `value`. */
export const skipping = (
  value: string = VALUE_A.base58,
  code = -32_007,
): SolanaScript => ({
  blocks: {
    [SLOT.toString()]: { error: code, message: "Slot was skipped" },
    [NEXT.toString()]: {
      result: blockAt(NEXT, value, { parentSlot: Number(SLOT) - 1 }),
    },
  },
  next: { [SLOT.toString()]: { result: [Number(NEXT)] } },
});

/** A clock the test moves by hand; timers fire in order of their due time. */
export type ManualClock = ChainReadClock & {
  readonly now: () => number;
  /** Moves the clock by `ms`, firing every timer due on the way. */
  readonly advance: (ms: number) => Promise<void>;
  /** The delay of every timer set, in order. */
  readonly delays: readonly number[];
};

/** Lets every pending microtask chain settle. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one more microtask chain settle
    await Promise.resolve();
  }
};

export const manualClock = (): ManualClock => {
  type Timer = { readonly due: number; readonly callback: () => void };
  const timers = new Map<number, Timer>();
  const delays: number[] = [];
  let now = 0;
  let next = 0;
  const earliest = (target: number): [number, Timer] | undefined =>
    [...timers.entries()]
      .filter(([, timer]) => timer.due <= target)
      .toSorted(([a, x], [b, y]) => x.due - y.due || a - b)[0];
  return {
    setTimeout: (callback, ms) => {
      next += 1;
      timers.set(next, { due: now + ms, callback });
      delays.push(ms);
      return next;
    },
    clearTimeout: handle => {
      timers.delete(handle as number);
    },
    now: () => now,
    delays,
    advance: async ms => {
      const target = now + ms;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- a fired timer may set the next one
        await flush();
        const due = earliest(target);
        if (due === undefined) break;
        const [id, timer] = due;
        timers.delete(id);
        now = timer.due;
        timer.callback();
      }
      now = target;
      await flush();
    },
  };
};

/** One request the fake received. */
export type SolanaRequest = {
  readonly url: string;
  readonly method: string;
  readonly params: unknown;
  readonly init: RequestInit | undefined;
  /** The clock's time when it was sent. */
  readonly at: number;
};

export type SolanaFake = {
  readonly deps: ChainReadDeps;
  readonly clock: ManualClock;
  readonly requests: SolanaRequest[];
  /** Calls no script answers: a test expects none. */
  readonly unexpected: string[];
};

const bodyOf = (reply: Exclude<Reply, "hang">): unknown => {
  if ("result" in reply) return { jsonrpc: "2.0", id: 1, result: reply.result };
  if ("error" in reply) {
    return {
      jsonrpc: "2.0",
      id: 1,
      error: { code: reply.error, message: reply.message ?? "error" },
    };
  }
  return "body" in reply ? reply.body : null;
};

const scriptedFor = (
  script: SolanaScript,
  method: string,
  params: readonly unknown[],
): Scripted | undefined => {
  if (method === "getGenesisHash") return script.genesis ?? { result: MAINNET };
  const slot = String(params[0]);
  if (method === "getBlock") return script.blocks?.[slot];
  if (method === "getBlocksWithLimit") return script.next?.[slot];
  return undefined;
};

/** A fake endpoint set keyed by URL, on a manual clock. */
export const solanaFake = (
  scripts: Readonly<Record<string, SolanaScript>>,
): SolanaFake => {
  const clock = manualClock();
  const requests: SolanaRequest[] = [];
  const unexpected: string[] = [];
  const fakeFetch = function (
    this: unknown,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    // The platform's fetch refuses any `this` but the global object.
    if (this !== undefined) throw new TypeError("Illegal invocation");
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: unknown[];
    };
    requests.push({
      url,
      method: body.method,
      params: body.params,
      init,
      at: clock.now(),
    });
    const scripted = scriptedFor(scripts[url] ?? {}, body.method, body.params);
    if (scripted === undefined) {
      unexpected.push(`${url} ${body.method} ${JSON.stringify(body.params)}`);
      return Promise.reject(new TypeError("unexpected call"));
    }
    const [after, reply] =
      typeof scripted === "object" && "after" in scripted
        ? [scripted.after, scripted.reply]
        : [undefined, scripted];
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
      const send = (): void => {
        if (reply === "hang") return;
        const status = "status" in reply ? reply.status : 200;
        const json = bodyOf(reply);
        resolve({ status, json: () => Promise.resolve(json) } as Response);
      };
      if (after === undefined) send();
      else clock.setTimeout(send, after);
    });
  };
  return {
    deps: { fetch: fakeFetch as typeof fetch, clock },
    clock,
    requests,
    unexpected,
  };
};
