// Test-only: the Solana chain read run against the fake endpoint set of
// `solana-rpc.ts`, with two production endpoints by default (VT-14).

import { expect } from "vitest";

import {
  readSolanaValueByQuorum,
  type SolanaReadConfig,
} from "../chain-read-solana.ts";
import {
  MAINNET,
  SLOT,
  type SolanaFake,
  solanaFake,
  type SolanaScript,
} from "./solana-rpc.ts";

export const SOL_A = "https://sol-a.example/";
export const SOL_B = "https://sol-b.example/";
export const SOL_C = "https://sol-c.example/";
export const SOL_D = "https://sol-d.example/";
export const URLS: readonly string[] = [SOL_A, SOL_B];

/** The engine's `getBlock` options, as the test expects them sent. */
export const OPTIONS = {
  commitment: "finalized",
  encoding: "json",
  transactionDetails: "none",
  rewards: false,
  maxSupportedTransactionVersion: 0,
};

/** A mainnet-beta source on `urls`, with `minRpcQuorum` 2 in production. */
export const solanaConfig = (
  urls: readonly string[] = URLS,
  overrides: Partial<SolanaReadConfig> = {},
): SolanaReadConfig => ({
  endpoints: urls.map((url, i) => ({ provider: `p${String(i)}`, url })),
  entropyChainId: 101,
  genesisHash: MAINNET,
  minRpcQuorum: 2,
  environment: "production",
  ...overrides,
});

/** `SOL_A` with `a` and `SOL_B` with `b` (`a` when `b` is not given). */
export const endpoints = (
  a: SolanaScript,
  b: SolanaScript = a,
): Record<string, SolanaScript> => ({ [SOL_A]: a, [SOL_B]: b });

/** The read of slot N under `config`. */
export const read = (
  f: SolanaFake,
  config: SolanaReadConfig = solanaConfig(),
) => readSolanaValueByQuorum(f.deps, config, SLOT);

/** The first endpoint's answer when both have `script`, at a quorum of 1. */
export const answerOf = async (script: SolanaScript) => {
  const f = solanaFake(endpoints(script));
  const result = await read(
    f,
    solanaConfig(URLS, { minRpcQuorum: 1, environment: "preview" }),
  );
  expect(f.unexpected).toEqual([]);
  return { result, answer: result.answers[0] };
};
