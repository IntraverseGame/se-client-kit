// Test-only: Solana rounds for check 6 as the page runs it (VT-14). A document
// that lists the vectors' EVM source (`ethereum:block`) beside a `solana` one,
// as staging does during its switch; the vectors' rounds moved to slot N of
// `solana`; and one fetch that serves both kinds. The rounds are synthetic.

import type { ChainReadDeps } from "../chain-read.ts";
import type { RoundEvidence } from "../round-evidence.ts";
import { bookBody } from "./book-body.ts";
import { accepted, environmentDocument } from "./environment.ts";
import {
  chainDeps,
  configFor,
  evidenceOf,
  evidenceOfBody,
  RPC_URLS,
  signatureVector,
  validSnapshot,
} from "./rounds.ts";
import { URLS } from "./solana-read.ts";
import {
  agreeing,
  SLOT,
  solanaFake,
  type SolanaScript,
  VALUE_B,
} from "./solana-rpc.ts";
import { asRecord } from "./verify-body.ts";

const pinned = signatureVector("create-round-auth-accept").pinned;

const solanaSources = accepted(
  environmentDocument({
    rpcEndpoints: {
      solana: URLS.map((url, i) => ({ provider: `s${String(i)}`, url })),
    },
    entropyChainKind: { solana: "solana" },
    entropyChainId: { solana: 101 },
    tipLagMargin: { solana: 64 },
  }),
).sources;

/** The vectors' EVM source (`ethereum:block`) beside a `solana` one. */
export const mixedConfig = configFor(pinned, {
  sources: { ...configFor(pinned).sources, ...solanaSources },
});

/** Every `solana` endpoint with `script`. */
export const both = (script: SolanaScript): Record<string, SolanaScript> =>
  Object.fromEntries(URLS.map(url => [url, script]));

/** A vector round moved to the `solana` source at slot N, as `status`. */
export const solanaEvidence = async (
  status: string,
  blockValue?: string,
): Promise<RoundEvidence> => {
  const snapshot = validSnapshot("coinflip-active-ready-hash");
  snapshot["status"] = status;
  const evidence = await evidenceOf(snapshot);
  if (evidence.randomnessProof === undefined) {
    throw new TypeError("the snapshot carries no randomness proof");
  }
  const { blockValue: _vector, ...proof } = evidence.randomnessProof;
  return {
    ...evidence,
    randomnessProof: {
      ...proof,
      source: "solana",
      blockNumber: SLOT,
      ...(blockValue === undefined ? {} : { blockValue }),
    },
  };
};

/**
 * The vendored won book round moved to slot N of `solana` (cluster 101), its
 * `entropy.value` and seed made from `value` (no check 2 to 4 applies to it).
 */
export const solanaBook = async (value: string): Promise<RoundEvidence> => {
  const body = await bookBody("book-lifecycle-won", value);
  body["entropy"] = {
    ...asRecord(body["entropy"]),
    source: "solana",
    chainId: 101,
    block: Number(SLOT),
  };
  return evidenceOfBody(body);
};

/**
 * One fetch for both sources: the Solana fake (agreeing on `VALUE_A`) for the
 * `solana` endpoints, the EVM `chainDeps` (agreeing on `VALUE_B`'s hex) for the
 * others, with every call recorded as `<url> <method>`.
 */
export const mixedDeps = (): {
  readonly deps: ChainReadDeps;
  readonly calls: string[];
} => {
  const sol = solanaFake(both(agreeing()));
  const solFetch = sol.deps.fetch;
  const evmFetch = chainDeps(
    Object.fromEntries(RPC_URLS.map(url => [url, { hash: VALUE_B.hex }])),
  ).fetch;
  const calls: string[] = [];
  const deps: ChainReadDeps = {
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      calls.push(`${String(input)} ${method}`);
      return URLS.includes(String(input))
        ? solFetch(input, init)
        : evmFetch(input, init);
    }) as typeof fetch,
    clock: sol.deps.clock,
  };
  return { deps, calls };
};
