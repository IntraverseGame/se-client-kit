// The configuration of each entropy source, read by the Wrapper's rule (V-3;
// RFC-007 section 1): its kind and pinned chain, cross-checked with the
// source's name, and its endpoints. `tipLagMargin` is validated and not kept:
// check 6 reads one fixed block, with no lag margin.

import type { RpcEndpoint } from "./chain-read.ts";
import { type Fields, readCount, readPerSource } from "./config-fields.ts";
import { SOLANA_GENESIS_HASHES } from "./solana-clusters.ts";

type EntropyChainKind = "evm" | "solana";

/** What every entropy source pins, whatever its kind. */
type SourcePins = {
  /** The source's chain id, or its cluster number for a `solana` source. */
  readonly chainId: number;
  readonly endpoints: readonly RpcEndpoint[];
};

/** The kind, pinned chain, and endpoints of one entropy source. */
export type SourceConfig =
  | (SourcePins & { readonly kind: "evm" })
  | (SourcePins & {
      readonly kind: "solana";
      /** The genesis hash pinned in code for the cluster `chainId` (base58). */
      readonly genesisHash: string;
    });

/** A refusal of a per-source map: a `ConfigIssue`. */
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
const MAINNET_BETA = 101;

const readChainKind = (value: unknown): EntropyChainKind | undefined =>
  value === "evm" || value === "solana" ? value : undefined;

// Keyed `solana` exactly when the kind is `solana`, and, when the chain is
// known, on a Solana cluster number exactly when the kind is `solana`.
const kindAgrees = (
  source: string,
  kind: EntropyChainKind,
  chainId: number | undefined,
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
  chainId: number | undefined,
): boolean =>
  kind === "solana" &&
  chainId !== undefined &&
  SOLANA_GENESIS_HASHES.has(chainId) &&
  chainId !== MAINNET_BETA;

const sourceOf = (
  kind: EntropyChainKind,
  pins: SourcePins,
): SourceConfig | undefined => {
  if (kind === "evm") return Object.freeze({ kind, ...pins });
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
 * holds every source whose entries were all accepted, frozen.
 */
export const readSources = (
  fields: Fields,
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
    const chainId = chainIds.values.get(source);
    const kind = kinds.values.get(source);
    const config =
      chainId === undefined || kind === undefined || !margins.values.has(source)
        ? undefined
        : sourceOf(kind, { chainId, endpoints: list });
    if (config !== undefined) sources[source] = config;
  }
  return { issues, sources: Object.freeze(sources) };
};
