// The tip check of an `evm` source (W-26b, with W-26a's quorum). The shell asks
// every configured endpoint of the source for its chain id and its final
// block, then asks each one that gave a final block for the block at `h_low`.
// Any endpoint that reports another chain id fails it. It passes only if at
// least `minRpcQuorum` answered, every one reports the source's configured
// chain id, every one is within the source's lag margin of `h_top`, and all of
// them return one hash at `h_low`. It never drops an outlier and never picks a
// side: any disagreement fails the check.

import type { Bytes32 } from "@intraverse/se-client-signing";

import { onAnotherChain, readBlock, readChainId } from "./rpc-answers.ts";
import type { BlockTag, RpcCall } from "./rpc-transport.ts";
import type { SourceConfig } from "./source-config.ts";
import { ask, type AskOptions, NO_ANSWER } from "./tip-check-ask.ts";

/** One endpoint's answers to an EVM tip check, kept with the record. */
export type EvmEndpointAnswer = {
  readonly kind: "evm";
  readonly provider: string;
  /**
   * The chain id it reported (`eth_chainId`), or `null` when it did not answer
   * that call in time with a chain id.
   */
  readonly chainId: bigint | null;
  /** Its final block, or `null` when it did not answer in time. */
  readonly finalBlock: bigint | null;
  /**
   * Its hash of the block at `h_low`, or `null` when it was not asked (it gave
   * no final block) or did not answer that call with the block at `h_low`.
   */
  readonly hashAtLow: Bytes32 | null;
};

/** The failures an EVM tip check can give, in the order it judges them. */
export type EvmTipFailure =
  | "chain-id-mismatch"
  | "too-few-answered"
  | "chain-id-unavailable"
  | "lagging"
  | "hash-unavailable"
  | "hash-mismatch";

/** What the EVM calls gave: every answer, the tips, and the verdict. */
export type EvmTipReading = {
  readonly answers: readonly EvmEndpointAnswer[];
  /** `h_top`, the highest final block; `null` when no endpoint gave one. */
  readonly tip: bigint | null;
  /** `h_low`, the lowest final block; `null` when no endpoint gave one. */
  readonly low: bigint | null;
  /** Unset when the check passed. */
  readonly failure: EvmTipFailure | undefined;
};

const quantity = (value: bigint): `0x${string}` => `0x${value.toString(16)}`;

const getBlock = (tag: BlockTag): RpcCall =>
  Object.freeze({
    method: "eth_getBlockByNumber",
    params: Object.freeze([tag, false] as const),
  });

const GET_CHAIN_ID: RpcCall = Object.freeze({
  method: "eth_chainId",
  params: Object.freeze([] as const),
});

const maxOf = (values: readonly bigint[]): bigint =>
  values.reduce((a, b) => (b > a ? b : a));

const minOf = (values: readonly bigint[]): bigint =>
  values.reduce((a, b) => (b < a ? b : a));

type EvmSource = Extract<SourceConfig, { readonly kind: "evm" }>;

const judge = (
  answers: readonly EvmEndpointAnswer[],
  quorum: number,
  tip: bigint,
  source: EvmSource,
): EvmTipFailure | undefined => {
  const margin = source.tipLagMargin;
  if (onAnotherChain(answers, source.chainId)) {
    return "chain-id-mismatch";
  }
  const answered = answers.filter(a => a.finalBlock !== null);
  if (answered.length < quorum) {
    return "too-few-answered";
  }
  if (answered.some(a => a.chainId === null)) {
    return "chain-id-unavailable";
  }
  if (answered.some(a => tip - (a.finalBlock ?? tip) > margin)) {
    return "lagging";
  }
  if (answered.some(a => a.hashAtLow === null)) {
    return "hash-unavailable";
  }
  return new Set(answered.map(a => a.hashAtLow)).size === 1
    ? undefined
    : "hash-mismatch";
};

/**
 * Asks every endpoint of an `evm` source for its chain id and its final block,
 * then each one that gave a final block for the block at `h_low`, each call
 * with its own timeout, and judges the answers. Never rejects on an endpoint's
 * failure.
 */
export const readEvmTip = async (
  options: AskOptions,
  timeoutMs: number,
  source: EvmSource,
  quorum: number,
): Promise<EvmTipReading> => {
  const { endpoints, chainId } = source;
  const [chainIds, finals] = await Promise.all([
    Promise.all(
      endpoints.map(endpoint =>
        ask(options, timeoutMs, endpoint, GET_CHAIN_ID, readChainId),
      ),
    ),
    Promise.all(
      endpoints.map(endpoint =>
        ask(options, timeoutMs, endpoint, getBlock("finalized"), readBlock),
      ),
    ),
  ]);
  const chainIdOf = (i: number): bigint | null => {
    const reported = chainIds[i];
    return reported === undefined || reported === NO_ANSWER ? null : reported;
  };
  const heights = finals.flatMap(f => (f === NO_ANSWER ? [] : [f.number]));
  if (heights.length === 0) {
    const silent = endpoints.map((e, i): EvmEndpointAnswer => ({
      kind: "evm",
      provider: e.provider,
      chainId: chainIdOf(i),
      finalBlock: null,
      hashAtLow: null,
    }));
    return {
      answers: silent,
      tip: null,
      low: null,
      failure: onAnotherChain(silent, chainId)
        ? "chain-id-mismatch"
        : "too-few-answered",
    };
  }
  // `h_top` and `h_low` may include the height of an endpoint on another chain;
  // the check then fails as `chain-id-mismatch` before they are judged, and the
  // record still keeps every answer.
  const tip = maxOf(heights);
  const low = minOf(heights);
  const atLow = await Promise.all(
    endpoints.map((endpoint, i) =>
      finals[i] === NO_ANSWER
        ? NO_ANSWER
        : ask(options, timeoutMs, endpoint, getBlock(quantity(low)), readBlock),
    ),
  );
  const answers = endpoints.map((endpoint, i): EvmEndpointAnswer => {
    const final = finals[i];
    const block = atLow[i];
    return {
      kind: "evm",
      provider: endpoint.provider,
      chainId: chainIdOf(i),
      finalBlock:
        final === undefined || final === NO_ANSWER ? null : final.number,
      hashAtLow:
        block === undefined || block === NO_ANSWER || block.number !== low
          ? null
          : block.hash,
    };
  });
  return { answers, tip, low, failure: judge(answers, quorum, tip, source) };
};
