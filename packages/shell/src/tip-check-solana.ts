// The tip check of a `solana` source (W-26b; RFC-007 section 3). The shell
// asks every configured endpoint of the source for its genesis hash and its
// final slot (`getSlot` at `finalized`), both at once, in one round of calls:
// there is no second pass at `h_low`, since a finalized slot does not fork. Any
// endpoint that reports another genesis hash than the one the kit pins for the
// source's cluster fails it. It passes only if at least `minRpcQuorum` gave a
// final slot, every one of them reported the pinned genesis hash, and every
// one is within the source's lag margin, in slots, of `h_top`. It never drops
// an outlier and never picks a side.

import type { RpcCall } from "./rpc-transport.ts";
import { readGenesisHash, readSlot } from "./solana-answers.ts";
import type { SourceConfig } from "./source-config.ts";
import { ask, type AskOptions, NO_ANSWER } from "./tip-check-ask.ts";

/** One endpoint's answers to a Solana tip check, kept with the record. */
export type SolanaEndpointAnswer = {
  readonly kind: "solana";
  readonly provider: string;
  /**
   * The genesis hash it reported (`getGenesisHash`, base58), or `null` when it
   * did not answer that call in time with a genesis hash.
   */
  readonly genesisHash: string | null;
  /** Its final slot, or `null` when it did not answer in time with one. */
  readonly finalSlot: bigint | null;
};

/** The failures a Solana tip check can give, in the order it judges them. */
export type SolanaTipFailure =
  | "chain-id-mismatch"
  | "too-few-answered"
  | "chain-id-unavailable"
  | "lagging";

/** What the Solana calls gave: every answer, the tip, and the verdict. */
export type SolanaTipReading = {
  readonly answers: readonly SolanaEndpointAnswer[];
  /** `h_top`, the highest final slot; `null` when no endpoint gave one. */
  readonly tip: bigint | null;
  /** `h_low`, the lowest final slot; `null` when no endpoint gave one. */
  readonly low: bigint | null;
  /** Unset when the check passed. */
  readonly failure: SolanaTipFailure | undefined;
};

type SolanaSource = Extract<SourceConfig, { readonly kind: "solana" }>;

const GET_GENESIS_HASH: RpcCall = Object.freeze({
  method: "getGenesisHash",
  params: Object.freeze([] as const),
});

const GET_FINAL_SLOT: RpcCall = Object.freeze({
  method: "getSlot",
  params: Object.freeze([
    Object.freeze({ commitment: "finalized" } as const),
  ] as const),
});

const judge = (
  answers: readonly SolanaEndpointAnswer[],
  quorum: number,
  tip: bigint | null,
  source: SolanaSource,
): SolanaTipFailure | undefined => {
  // Another cluster, whether or not that endpoint gave a final slot.
  if (
    answers.some(
      a => a.genesisHash !== null && a.genesisHash !== source.genesisHash,
    )
  ) {
    return "chain-id-mismatch";
  }
  const answered = answers.flatMap(a =>
    a.finalSlot === null ? [] : [{ ...a, finalSlot: a.finalSlot }],
  );
  if (tip === null || answered.length < quorum) {
    return "too-few-answered";
  }
  if (answered.some(a => a.genesisHash === null)) {
    return "chain-id-unavailable";
  }
  return answered.some(a => tip - a.finalSlot > source.tipLagMargin)
    ? "lagging"
    : undefined;
};

/**
 * Asks every endpoint of a `solana` source for its genesis hash and its final
 * slot, each call with its own timeout, and judges the answers. Never rejects
 * on an endpoint's failure.
 */
export const readSolanaTip = async (
  options: AskOptions,
  timeoutMs: number,
  source: SolanaSource,
  quorum: number,
): Promise<SolanaTipReading> => {
  const { endpoints } = source;
  const [hashes, slots] = await Promise.all([
    Promise.all(
      endpoints.map(endpoint =>
        ask(options, timeoutMs, endpoint, GET_GENESIS_HASH, readGenesisHash),
      ),
    ),
    Promise.all(
      endpoints.map(endpoint =>
        ask(options, timeoutMs, endpoint, GET_FINAL_SLOT, readSlot),
      ),
    ),
  ]);
  const answers = endpoints.map((endpoint, i): SolanaEndpointAnswer => {
    const hash = hashes[i];
    const slot = slots[i];
    return {
      kind: "solana",
      provider: endpoint.provider,
      genesisHash: hash === undefined || hash === NO_ANSWER ? null : hash,
      finalSlot: slot === undefined || slot === NO_ANSWER ? null : slot,
    };
  });
  const heights = answers.flatMap(a =>
    a.finalSlot === null ? [] : [a.finalSlot],
  );
  const tip =
    heights.length === 0 ? null : heights.reduce((a, b) => (b > a ? b : a));
  const low =
    heights.length === 0 ? null : heights.reduce((a, b) => (b < a ? b : a));
  return {
    answers,
    tip,
    low,
    failure: judge(answers, quorum, tip, source),
  };
};
