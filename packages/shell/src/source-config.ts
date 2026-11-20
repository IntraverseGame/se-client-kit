// The configuration of each entropy source (W-26b; the Wrapper's Configuration
// section; RFC-007 section 1): its kind, its pinned chain, its endpoints, and
// its lag margin, read from the per-source maps of the chain configuration. The
// kind is cross-checked with the source's name and its pinned chain, as the
// engine pins and checks its own.

import { readCount, readPerSource, type RpcEndpoint } from "./config-fields.ts";
import { SOLANA_GENESIS_HASHES } from "./solana-clusters.ts";

type EntropyChainKind = "evm" | "solana";

/** What every entropy source pins, whatever its kind. */
type SourcePins = {
  /**
   * The chain the source's blocks are on: every endpoint must report it
   * (`eth_chainId`, W-26b), and a round's `entropyChainId` must equal it (W-26,
   * check 3). For a `solana` source, its cluster number: 101, 102, or 103.
   */
  readonly chainId: bigint;
  readonly endpoints: readonly RpcEndpoint[];
  /**
   * How many blocks (slots, for a `solana` source) an endpoint may be behind
   * the highest final one. Required: there is no default. PROVISIONAL: the
   * margin per chain is not decided yet.
   */
  readonly tipLagMargin: bigint;
};

/**
 * The kind, pinned chain, endpoints, and lag margin of one entropy source
 * (W-26b; `entropyChainKind`, the Wrapper's Configuration section).
 */
export type SourceConfig =
  | (SourcePins & { readonly kind: "evm" })
  | (SourcePins & {
      readonly kind: "solana";
      /**
       * The genesis hash the kit pins in code for the cluster `chainId`
       * (base58), never read from the configuration.
       */
      readonly genesisHash: string;
    });

/** A refusal of a per-source map: a `ChainConfigIssue`. */
type SourceIssue = {
  readonly code:
    | "invalid-lag-margin"
    | "invalid-entropy-chain-id"
    | "invalid-entropy-chain-kind"
    | "entropy-chain-kind-mismatch"
    | "production-cluster";
  readonly field: string;
};

// The engine's name for its Solana source, which `randomnessTarget` encodes.
const SOLANA_SOURCE = "solana";

// Production's entropy is Solana mainnet-beta (RFC-007, Q10).
const MAINNET_BETA = 101n;

const readChainKind = (value: unknown): EntropyChainKind | undefined =>
  value === "evm" || value === "solana" ? value : undefined;

// Keyed `solana` exactly when the kind is `solana`, and, when the chain is
// known, on a Solana cluster number exactly when the kind is `solana`.
const kindAgrees = (
  source: string,
  kind: EntropyChainKind,
  chainId: bigint | undefined,
): boolean => {
  const solana = kind === "solana";
  return (
    (source === SOLANA_SOURCE) === solana &&
    (chainId === undefined || SOLANA_GENESIS_HASHES.has(chainId) === solana)
  );
};

// A Solana test cluster in a `production` document.
const offProductionCluster = (
  kind: EntropyChainKind,
  chainId: bigint | undefined,
): boolean =>
  kind === "solana" &&
  chainId !== undefined &&
  SOLANA_GENESIS_HASHES.has(chainId) &&
  chainId !== MAINNET_BETA;

const sourceOf = (
  kind: EntropyChainKind,
  pins: SourcePins,
): SourceConfig | undefined => {
  if (kind === "evm") {
    return Object.freeze({ kind, ...pins });
  }
  const genesisHash = SOLANA_GENESIS_HASHES.get(pins.chainId);
  return genesisHash === undefined
    ? undefined
    : Object.freeze({ kind, ...pins, genesisHash });
};

const refusals = (
  code: SourceIssue["code"],
  fields: readonly string[],
): SourceIssue[] => fields.map(field => ({ code, field }));

/**
 * Reads `tipLagMargin`, `entropyChainId`, and `entropyChainKind` for each
 * source of `endpoints`, cross-checks each source's kind, and, in a
 * `production` document, refuses a `solana` source on a test cluster. `sources`
 * holds every source whose three entries were all accepted, frozen.
 */
export const readSources = (
  fields: Readonly<Record<string, unknown>>,
  endpoints: ReadonlyMap<string, readonly RpcEndpoint[]>,
  production: boolean,
): {
  readonly issues: readonly SourceIssue[];
  readonly sources: Readonly<Record<string, SourceConfig>>;
} => {
  const names = [...endpoints.keys()];
  const margins = readPerSource(fields, "tipLagMargin", names, readCount(0));
  const chainIds = readPerSource(fields, "entropyChainId", names, readCount(1));
  const kinds = readPerSource(fields, "entropyChainKind", names, readChainKind);
  const mismatched = [...kinds.values]
    .filter(
      ([source, kind]) =>
        !kindAgrees(source, kind, chainIds.values.get(source)),
    )
    .map(([source]) => `entropyChainKind.${source}`);
  const offCluster = production
    ? [...kinds.values]
        .filter(([source, kind]) =>
          offProductionCluster(kind, chainIds.values.get(source)),
        )
        .map(([source]) => `entropyChainId.${source}`)
    : [];
  const issues = [
    ...refusals("invalid-lag-margin", margins.refused),
    ...refusals("invalid-entropy-chain-id", chainIds.refused),
    ...refusals("invalid-entropy-chain-kind", kinds.refused),
    ...refusals("entropy-chain-kind-mismatch", mismatched),
    ...refusals("production-cluster", offCluster),
  ];
  const sources: Record<string, SourceConfig> = {};
  for (const [source, list] of endpoints) {
    const tipLagMargin = margins.values.get(source);
    const chainId = chainIds.values.get(source);
    const kind = kinds.values.get(source);
    const config =
      tipLagMargin === undefined || chainId === undefined || kind === undefined
        ? undefined
        : sourceOf(kind, { chainId, endpoints: list, tipLagMargin });
    if (config !== undefined) {
      sources[source] = config;
    }
  }
  return { issues, sources: Object.freeze(sources) };
};
