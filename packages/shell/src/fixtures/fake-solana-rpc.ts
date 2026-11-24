// Test-only: a scripted Solana JSON-RPC transport for the tip check (RFC-007
// section 3), with fake-rpc.ts's manual clock. No network, no real timers.
// Its answers are synthetic. The genesis hashes are the public protocol
// constants the shell pins; the URLs are reserved example hosts that nothing
// resolves, with no key.

import type { CancelSignal } from "@intraverse/se-client-play-client";

import type { ChainConfig } from "../chain-config.ts";
import type { RpcEndpoint } from "../config-fields.ts";
import type { RpcCall, RpcTransport } from "../rpc-transport.ts";
import { runTipCheck, type SolanaTipCheckRecord } from "../tip-check.ts";
import {
  chainConfig,
  ENTROPY_CHAIN_ID,
  endpoints,
  SOURCE,
} from "./chain-config.ts";
import { flush } from "./fake-locks.ts";
import {
  type Behavior,
  createManualClock,
  type ManualClock,
} from "./fake-rpc.ts";
import { type IssuedRound, issueRound } from "./round-auth.ts";

/** Mainnet-beta's genesis hash, cluster 101's pin. */
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
/** Testnet's genesis hash: another cluster, well formed. */
export const TESTNET_GENESIS = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";

/** The source name a `solana` source is keyed by. */
export const SOLANA = "solana";

/** The lag margin, in slots, of the fixture documents' `solana` source. */
export const SOLANA_MARGIN = 64n;

/** `count` endpoints of the `solana` source, providers `s1` to `s<count>`. */
export const solanaEndpoints = (
  count: number,
): readonly { provider: string; url: string }[] =>
  Array.from({ length: count }, (_, i) => ({
    provider: `s${i + 1}`,
    url: `https://solana${i + 1}.example`,
  }));

/**
 * Overrides of the production fixture document: one `solana` source on
 * mainnet-beta with `count` endpoints and a margin of 64 slots.
 */
export const solanaOnly = (count = 3): Readonly<Record<string, unknown>> => ({
  rpcEndpoints: { [SOLANA]: solanaEndpoints(count) },
  entropyChainKind: { [SOLANA]: "solana" },
  entropyChainId: { [SOLANA]: 101 },
  tipLagMargin: { [SOLANA]: Number(SOLANA_MARGIN) },
});

/** Overrides with an `evm` source and a `solana` source (staging's shape). */
export const WITH_BOTH: Readonly<Record<string, unknown>> = {
  rpcEndpoints: { [SOURCE]: endpoints(2), [SOLANA]: solanaEndpoints(2) },
  entropyChainKind: { [SOURCE]: "evm", [SOLANA]: "solana" },
  entropyChainId: { [SOURCE]: ENTROPY_CHAIN_ID, [SOLANA]: 101 },
  tipLagMargin: { [SOURCE]: 2, [SOLANA]: Number(SOLANA_MARGIN) },
};

/** What one Solana provider does. */
export type SolanaScript = {
  /**
   * Its genesis hash, or a behavior for the `getGenesisHash` call; by default
   * mainnet-beta's.
   */
  readonly genesisHash?: string | Behavior;
  /** Its final slot, or a behavior for the `getSlot` call. */
  readonly slot: bigint | Behavior;
};

export type FakeSolanaRpc = {
  readonly transport: RpcTransport;
  /** Every call, in order, with the signal the tip check passed. */
  readonly calls: () => readonly {
    readonly endpoint: RpcEndpoint;
    readonly call: RpcCall;
    readonly signal: CancelSignal | undefined;
  }[];
  /** Answers the `"deferred"` call `method` of `provider` with `result`. */
  readonly answer: (provider: string, method: string, result: unknown) => void;
};

export const createFakeSolanaRpc = (
  scripts: Readonly<Record<string, SolanaScript>>,
): FakeSolanaRpc => {
  const calls: {
    endpoint: RpcEndpoint;
    call: RpcCall;
    signal: CancelSignal | undefined;
  }[] = [];
  const deferred = new Map<string, (result: unknown) => void>();
  const respond = (
    key: string,
    answer: bigint | string | Behavior,
  ): Promise<unknown> => {
    if (typeof answer === "bigint") {
      // A slot is a JSON number.
      return Promise.resolve(Number(answer));
    }
    if (typeof answer === "object") {
      return Promise.resolve(answer.raw);
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
          deferred.set(key, resolve);
        });
      }
      default: {
        return Promise.resolve(answer);
      }
    }
  };
  const transport: RpcTransport = (endpoint, call, signal) => {
    calls.push({ endpoint, call, signal });
    const script = scripts[endpoint.provider];
    if (script === undefined) {
      return Promise.reject(new Error("no such provider"));
    }
    const key = `${endpoint.provider} ${call.method}`;
    switch (call.method) {
      case "getGenesisHash": {
        return respond(key, script.genesisHash ?? MAINNET_GENESIS);
      }
      case "getSlot": {
        return respond(key, script.slot);
      }
      default: {
        // A Solana endpoint knows no EVM method.
        return Promise.reject(new Error("method not found"));
      }
    }
  };
  return {
    transport,
    calls: () => calls,
    answer: (provider, method, result) => {
      deferred.get(`${provider} ${method}`)?.(result);
    },
  };
};

/** A provider whose final slot is `slot`, on mainnet-beta. */
export const at = (slot: bigint): SolanaScript => ({ slot });

/** Providers `s1` to `s3`, each at final slot `slot`, on mainnet-beta. */
export const agreeing = (slot = 1_000n): Record<string, SolanaScript> => ({
  s1: at(slot),
  s2: at(slot),
  s3: at(slot),
});

export type SolanaRun = {
  readonly scripts: Readonly<Record<string, SolanaScript>>;
  /** Overrides of the configuration document; `solanaOnly()` by default. */
  readonly config?: Readonly<Record<string, unknown>>;
  /** A validated configuration, used instead of `config` when given. */
  readonly validated?: ChainConfig;
  readonly source?: string;
  readonly timeoutMs?: number;
};

export type SolanaRunResult = {
  readonly result: SolanaTipCheckRecord;
  readonly rpc: FakeSolanaRpc;
  readonly clock: ManualClock;
};

/**
 * Runs a Solana tip check to its end: after the scripted answers are read,
 * every call still open is timed out (there is one round of calls).
 */
export const runSolanaScripted = async ({
  scripts,
  config = solanaOnly(),
  validated,
  source = SOLANA,
  timeoutMs,
}: SolanaRun): Promise<SolanaRunResult> => {
  const rpc = createFakeSolanaRpc(scripts);
  const clock = createManualClock();
  const pending = runTipCheck({
    config: validated ?? chainConfig(config),
    source,
    transport: rpc.transport,
    clock,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  await flush();
  clock.fireAll();
  const result = await pending;
  if (result.kind !== "solana") {
    throw new Error("runSolanaScripted reads the solana source");
  }
  return { result, rpc, clock };
};

/**
 * The vendored round issued again for source `solana` on cluster 101, under a
 * configuration that pins that source with kind `solana` (endpoints `p1` and
 * `p2`), so W-26's checks 1 to 5 pass on it and only its tip check can fail.
 */
export const issueSolanaRound = (): IssuedRound =>
  issueRound({
    before: p => {
      p.randomnessProof["source"] = SOLANA;
      p.auth["entropyChainId"] = 101;
    },
    chains: { [SOLANA]: 101 },
  });

/** The issued Solana round's two endpoints, neither answering. */
export const SILENT_ROUND_ENDPOINTS: Readonly<Record<string, SolanaScript>> = {
  p1: { slot: "silent" },
  p2: { slot: "silent" },
};
