// Test-only: a scripted JSON-RPC transport and a manual clock for the tip
// check. No network, no real timers: a test decides what each provider answers
// and when a timeout fires.

import type { CancelSignal } from "@intraverse/se-client-play-client";
import type { Bytes32 } from "@intraverse/se-client-signing";

import type { RpcEndpoint } from "../config-fields.ts";
import type { RpcCall, RpcTransport } from "../rpc-transport.ts";
import { runTipCheck, type TipCheckRecord } from "../tip-check.ts";
import { chainConfig, SOURCE } from "./chain-config.ts";
import { flush } from "./fake-locks.ts";

/** A distinct, valid block hash per (fork letter, height). */
export const hashOf = (height: bigint, fork = "a"): Bytes32 =>
  `0x${(fork.codePointAt(0) ?? 0).toString(16).padStart(2, "0")}${height
    .toString(16)
    .padStart(62, "0")}` as Bytes32;

/**
 * A behavior: `"silent"` never answers (a timeout), `"error"` rejects,
 * `"throw"` makes the transport throw at once, `"deferred"` is answered later
 * by the test, and `{ raw }` answers that value as the `result`.
 */
export type Behavior =
  | "silent"
  | "error"
  | "throw"
  | "deferred"
  | { readonly raw: unknown };

/** What one provider does. */
export type ProviderScript = {
  /** Its final block, or a behavior for the `finalized` call. */
  readonly final: bigint | Behavior;
  /**
   * Its answer for a height: the block of that height on a fork (a letter; `a`
   * by default), or a behavior.
   */
  readonly atHeight?: string | Behavior;
};

export type FakeRpc = {
  readonly transport: RpcTransport;
  /** Every call, in order, with the signal the tip check passed. */
  readonly calls: () => readonly {
    readonly endpoint: RpcEndpoint;
    readonly call: RpcCall;
    readonly signal: CancelSignal | undefined;
  }[];
  /** Answers the `"deferred"` call of `provider` with `result`. */
  readonly answer: (provider: string, result: unknown) => void;
};

const block = (height: bigint, fork: string): unknown => ({
  number: `0x${height.toString(16)}`,
  hash: hashOf(height, fork),
  parentHash: hashOf(height - 1n, fork),
});

export const createFakeRpc = (
  scripts: Readonly<Record<string, ProviderScript>>,
): FakeRpc => {
  const calls: {
    endpoint: RpcEndpoint;
    call: RpcCall;
    signal: CancelSignal | undefined;
  }[] = [];
  const deferred = new Map<string, (result: unknown) => void>();
  const respond = (
    provider: string,
    answer: bigint | string | Behavior,
    height: bigint,
  ): Promise<unknown> => {
    if (typeof answer === "object") {
      return Promise.resolve(answer.raw);
    }
    if (typeof answer === "bigint") {
      return Promise.resolve(block(answer, "a"));
    }
    switch (answer) {
      case "throw": {
        throw new Error("transport threw");
      }
      case "silent": {
        return new Promise<unknown>(() => {});
      }
      case "error": {
        return Promise.reject(new Error("rpc error"));
      }
      case "deferred": {
        return new Promise<unknown>(resolve => {
          deferred.set(provider, resolve);
        });
      }
      default: {
        return Promise.resolve(block(height, answer));
      }
    }
  };
  const transport: RpcTransport = (endpoint, call, signal) => {
    calls.push({ endpoint, call, signal });
    const script = scripts[endpoint.provider];
    const [tag] = call.params;
    if (script === undefined) {
      return Promise.reject(new Error("no such provider"));
    }
    return tag === "finalized"
      ? respond(endpoint.provider, script.final, 0n)
      : respond(endpoint.provider, script.atHeight ?? "a", BigInt(tag));
  };
  return {
    transport,
    calls: () => calls,
    answer: (provider, result) => {
      deferred.get(provider)?.(result);
    },
  };
};

export type ManualClock = {
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** The delays of the timers set so far. */
  readonly delays: () => readonly number[];
  /** How many timers are set and not yet fired or cleared. */
  readonly pending: () => number;
  /** Fires every pending timer. */
  readonly fireAll: () => void;
};

export const createManualClock = (): ManualClock => {
  const timers = new Map<number, () => void>();
  const delays: number[] = [];
  let next = 0;
  return {
    setTimeout: (callback, delayMs) => {
      next += 1;
      timers.set(next, callback);
      delays.push(delayMs);
      return next;
    },
    clearTimeout: handle => {
      timers.delete(handle as number);
    },
    delays: () => delays,
    pending: () => timers.size,
    fireAll: () => {
      const due = [...timers.values()];
      timers.clear();
      for (const callback of due) {
        callback();
      }
    },
  };
};

export type TipCheckRun = {
  readonly scripts: Readonly<Record<string, ProviderScript>>;
  /** Overrides of the configuration document. */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly source?: string;
  readonly timeoutMs?: number;
  /** Runs after the final-block calls are timed out, before the `h_low` ones. */
  readonly between?: (rpc: FakeRpc) => void;
};

export type TipCheckRunResult = {
  readonly result: TipCheckRecord;
  readonly rpc: FakeRpc;
  readonly clock: ManualClock;
};

/**
 * Runs a tip check to its end: after the scripted answers are read, every call
 * still open (the final-block calls, then the `h_low` calls) is timed out.
 */
export const runScripted = async ({
  scripts,
  config = {},
  source = SOURCE,
  timeoutMs,
  between,
}: TipCheckRun): Promise<TipCheckRunResult> => {
  const rpc = createFakeRpc(scripts);
  const clock = createManualClock();
  const pending = runTipCheck({
    config: chainConfig(config),
    source,
    transport: rpc.transport,
    clock,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  await flush();
  clock.fireAll();
  between?.(rpc);
  await flush();
  clock.fireAll();
  return { result: await pending, rpc, clock };
};
