// The tip check (W-26b, with W-26a's quorum and degraded mode): the round's
// entropy source is looked up in the configuration and read by its kind, an
// `evm` source by `tip-check-evm.ts` and a `solana` source by
// `tip-check-solana.ts` (RFC-007 section 3), and what they saw is kept as the
// round's frozen record (W-27). Neither drops an outlier or picks a side: any
// disagreement fails the check.
//
// The network is an injected transport; the readers build the JSON-RPC calls
// and read their results as untrusted data.

import {
  type Clock,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "@intraverse/se-client-play-client";

import type { ChainConfig } from "./chain-config.ts";
import { ShellError } from "./errors.ts";
import type { RpcTransport } from "./rpc-transport.ts";
import { type EvmEndpointAnswer, readEvmTip } from "./tip-check-evm.ts";
import {
  readSolanaTip,
  type SolanaEndpointAnswer,
} from "./tip-check-solana.ts";

/** One endpoint's answers, kept with the record whether it agreed or not. */
export type EndpointAnswer = EvmEndpointAnswer | SolanaEndpointAnswer;

/** Why a tip check failed. */
export type TipCheckFailure =
  /** The configuration lists no endpoints for the round's entropy source. */
  | "unknown-source"
  /** Fewer than `minRpcQuorum` endpoints gave a final block or slot (W-26a). */
  | "too-few-answered"
  /** An answering endpoint gave no chain id (no genesis hash, for Solana). */
  | "chain-id-unavailable"
  /** An endpoint, answering or not, reported another chain than the source's. */
  | "chain-id-mismatch"
  /** An answering endpoint is more than the lag margin behind `h_top`. */
  | "lagging"
  /** An answering endpoint gave no block hash at `h_low` (EVM only). */
  | "hash-unavailable"
  /** The answering endpoints gave different hashes at `h_low` (EVM only). */
  | "hash-mismatch";

/** What every tip check records, whatever the source's kind. */
type RecordFields = {
  /** The Snapshot's `proofs.randomnessProof.source`. */
  readonly source: string;
  readonly passed: boolean;
  /** Set exactly when `passed` is `false`. */
  readonly failure?: TipCheckFailure;
  /** `degraded` when `minRpcQuorum` is 1 (local or preview only, W-26a). */
  readonly tipCheck: "independent" | "degraded";
  /**
   * The observed tip `h_top` (a block, or a slot for a `solana` source); `null`
   * when no endpoint answered.
   */
  readonly tip: bigint | null;
  /** `h_low`; `null` when no endpoint answered. */
  readonly low: bigint | null;
  /** The source's lag margin the check used, in the source's unit. */
  readonly tipLagMargin: bigint | null;
  /**
   * The source's configured chain id the check required (its cluster number,
   * for a `solana` source).
   */
  readonly chainId: bigint | null;
};

/** The record of an `evm` source's tip check. */
export type EvmTipCheckRecord = RecordFields & {
  readonly kind: "evm";
  /** Every configured endpoint, in configuration order. */
  readonly answers: readonly EvmEndpointAnswer[];
};

/** The record of a `solana` source's tip check (RFC-007 section 3). */
export type SolanaTipCheckRecord = RecordFields & {
  readonly kind: "solana";
  /** The genesis hash the kit pins for the source's cluster (base58). */
  readonly genesisHash: string;
  /** Every configured endpoint, in configuration order. */
  readonly answers: readonly SolanaEndpointAnswer[];
};

/**
 * The record of a source the configuration does not list (`unknown-source`): it
 * has no kind, and no endpoint was asked.
 */
export type UnlistedTipCheckRecord = RecordFields & {
  readonly kind: null;
  readonly answers: readonly [];
};

/** What the tip check saw, kept with the round's record (W-26b, W-27). */
export type TipCheckRecord =
  | EvmTipCheckRecord
  | SolanaTipCheckRecord
  | UnlistedTipCheckRecord;

export type TipCheckOptions = {
  readonly config: ChainConfig;
  /** The round's entropy source, as the Snapshot names it. */
  readonly source: string;
  readonly transport: RpcTransport;
  /** The timers of each call's timeout (W-43). */
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  /** Each call's timeout. The default is the Wrapper's 15 s (W-43). */
  readonly timeoutMs?: number;
};

const frozenAnswers = <A extends EndpointAnswer>(
  answers: readonly A[],
): readonly A[] => Object.freeze(answers.map(a => Object.freeze({ ...a })));

const verdict = (
  failure: TipCheckFailure | undefined,
):
  | { readonly passed: true }
  | { readonly passed: false; readonly failure: TipCheckFailure } =>
  failure === undefined ? { passed: true } : { passed: false, failure };

/**
 * Runs the tip check for `source` against every endpoint the configuration
 * lists for it, with the calls and the rule of the source's kind. Never rejects
 * on an endpoint's failure: the record says what each one answered and whether
 * the check passed. Throws `invalid-input` for a timeout that is not a positive
 * duration.
 */
export const runTipCheck = async (
  options: TipCheckOptions,
): Promise<TipCheckRecord> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    throw new ShellError("invalid-input");
  }
  const { config, source } = options;
  const tipCheck = config.degraded ? "degraded" : "independent";
  const sourceConfig = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  if (sourceConfig === undefined) {
    return Object.freeze({
      kind: null,
      source,
      passed: false,
      failure: "unknown-source",
      tipCheck,
      tip: null,
      low: null,
      tipLagMargin: null,
      chainId: null,
      answers: Object.freeze([] as const),
    });
  }
  const { tipLagMargin, chainId } = sourceConfig;
  const quorum = config.minRpcQuorum;
  const common = { source, tipCheck, tipLagMargin, chainId } as const;
  if (sourceConfig.kind === "solana") {
    const reading = await readSolanaTip(
      options,
      timeoutMs,
      sourceConfig,
      quorum,
    );
    return Object.freeze({
      kind: "solana",
      ...common,
      ...verdict(reading.failure),
      tip: reading.tip,
      low: reading.low,
      genesisHash: sourceConfig.genesisHash,
      answers: frozenAnswers(reading.answers),
    });
  }
  const reading = await readEvmTip(options, timeoutMs, sourceConfig, quorum);
  return Object.freeze({
    kind: "evm",
    ...common,
    ...verdict(reading.failure),
    tip: reading.tip,
    low: reading.low,
    answers: frozenAnswers(reading.answers),
  });
};
