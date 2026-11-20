// The chain part of the environment configuration (W-26, W-26a, W-26b, and the
// Wrapper's Configuration section): the environment, the backend signer
// address, the registry domain, the RPC endpoints, the chain kind, and the
// pinned chain of each entropy source, the quorum, and the lag margins. It is
// the only trust anchor of the chain checks: a value a response carries is
// compared with it, never used in its place. The rest of the document (the API
// bases, the origin allow-lists) is read by the Wrapper; this module ignores it.

import type { Address } from "@intraverse/se-client-signing";

import {
  isCount,
  isRecord,
  NAME,
  own,
  readAddress,
  readEndpoint,
  type RpcEndpoint,
  shareProvider,
} from "./config-fields.ts";
import { readSources, type SourceConfig } from "./source-config.ts";

/** Which environment the document configures (W-26a's boot rule reads it). */
export type Environment = "production" | "preview" | "local";

declare const VALIDATED: unique symbol;

/** A configuration that passed `validateChainConfig`, deeply frozen. */
export type ChainConfig = {
  readonly environment: Environment;
  /** The address that signs `CreateRoundAuth` (W-26), lowercase. */
  readonly runtimeSigner: Address;
  /** The registry's EIP-712 domain fields this environment pins. */
  readonly registryDomain: {
    readonly chainId: bigint;
    /** Lowercase. */
    readonly verifyingContract: Address;
  };
  /** How many endpoints must answer and agree (W-26a). */
  readonly minRpcQuorum: number;
  /**
   * `true` when `minRpcQuorum` is 1 (only `local` or `preview`): the Wrapper
   * shows the "chain check not independent (development)" indicator and every
   * tip check records `tipCheck: "degraded"`.
   */
  readonly degraded: boolean;
  /** Per entropy source, by its Snapshot `source` identifier. */
  readonly sources: Readonly<Record<string, SourceConfig>>;
  readonly [VALIDATED]: true;
};

/** Why a configuration was refused. */
export type ChainConfigIssueCode =
  /** `environment` is not `production`, `preview`, or `local`. */
  | "invalid-environment"
  /** `runtimeSigner` is not a non-zero address. */
  | "invalid-signer"
  /** `registryDomain` does not hold a chain id and a non-zero contract address. */
  | "invalid-domain"
  /** `minRpcQuorum` is not an integer of at least 1. */
  | "invalid-quorum"
  /** The boot rule: `production` with `minRpcQuorum` below 2 (W-26a). */
  | "production-quorum"
  /** `rpcEndpoints` is missing, empty, or holds a malformed endpoint. */
  | "invalid-endpoints"
  /** Two endpoints of one source share a provider or a URL (W-26b). */
  | "shared-provider"
  /** A source has fewer configured endpoints than `minRpcQuorum` (W-26b). */
  | "quorum-unreachable"
  /**
   * `entropyChainId` is missing for a source, names a source with no endpoints,
   * or is not an integer of at least 1.
   */
  | "invalid-entropy-chain-id"
  /**
   * `tipLagMargin` is missing for a source, names a source with no endpoints,
   * or is not a non-negative integer.
   */
  | "invalid-lag-margin"
  /**
   * `entropyChainKind` is not an object, or its entry is missing for a source,
   * names a source with no endpoints, or is not `evm` or `solana`.
   */
  | "invalid-entropy-chain-kind"
  /**
   * A source's kind disagrees with its name or its pinned chain: a `solana`
   * source not keyed `solana` or whose `entropyChainId` is not 101, 102, or
   * 103, or an `evm` source keyed `solana` or with one of those numbers.
   */
  | "entropy-chain-kind-mismatch"
  /**
   * A `production` document pins a `solana` source on a test cluster (102 or
   * 103): production's entropy is mainnet-beta, 101 (RFC-007, Q10).
   */
  | "production-cluster";

/** One refusal: what is wrong and in which field (a dotted path). */
export type ChainConfigIssue = {
  readonly code: ChainConfigIssueCode;
  readonly field: string;
};

export type ChainConfigResult =
  | { readonly ok: true; readonly config: ChainConfig }
  | { readonly ok: false; readonly issues: readonly ChainConfigIssue[] };

/** W-26a: the quorum when the document sets none. */
export const DEFAULT_MIN_RPC_QUORUM = 2;

const ENVIRONMENTS: ReadonlySet<string> = new Set([
  "production",
  "preview",
  "local",
]);

type Issues = ChainConfigIssue[];

const readEndpoints = (
  value: unknown,
  issues: Issues,
): Map<string, readonly RpcEndpoint[]> | undefined => {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    issues.push({ code: "invalid-endpoints", field: "rpcEndpoints" });
    return undefined;
  }
  const sources = new Map<string, readonly RpcEndpoint[]>();
  for (const [source, list] of Object.entries(value)) {
    const field = `rpcEndpoints.${source}`;
    if (!NAME.test(source) || !Array.isArray(list) || list.length === 0) {
      issues.push({ code: "invalid-endpoints", field });
      continue;
    }
    const endpoints = (list as readonly unknown[]).map(entry =>
      readEndpoint(entry),
    );
    if (endpoints.some(e => e === undefined)) {
      issues.push({ code: "invalid-endpoints", field });
      continue;
    }
    const valid = Object.freeze(endpoints as RpcEndpoint[]);
    if (shareProvider(valid)) {
      issues.push({ code: "shared-provider", field });
    }
    sources.set(source, valid);
  }
  return sources;
};

const readDomain = (
  value: unknown,
): ChainConfig["registryDomain"] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const chainId = own(value, "chainId");
  const verifyingContract = readAddress(own(value, "verifyingContract"));
  if (!isCount(chainId, 1) || verifyingContract === undefined) {
    return undefined;
  }
  return Object.freeze({ chainId: BigInt(chainId), verifyingContract });
};

const readQuorum = (
  value: unknown,
  environment: unknown,
  issues: Issues,
): number | undefined => {
  const quorum = value === undefined ? DEFAULT_MIN_RPC_QUORUM : value;
  if (!isCount(quorum, 1)) {
    issues.push({ code: "invalid-quorum", field: "minRpcQuorum" });
    return undefined;
  }
  if (environment === "production" && quorum < DEFAULT_MIN_RPC_QUORUM) {
    issues.push({ code: "production-quorum", field: "minRpcQuorum" });
  }
  return quorum;
};

/**
 * Validates the chain part of the environment configuration document (parsed
 * JSON) and returns it typed and frozen, or every issue found. The Wrapper
 * refuses to start (the configuration-error state, nothing signed) on any
 * issue; `production-quorum` is W-26a's boot rule, and `production-cluster`
 * keeps a `production` document's `solana` source on mainnet-beta.
 *
 * Read fields: `environment`, `runtimeSigner`, `registryDomain` (`chainId`,
 * `verifyingContract`), `rpcEndpoints` (per source, a list of `{ provider, url
 * }`), `entropyChainKind` (per source, required: `evm` or `solana`),
 * `entropyChainId` (per source, required: the source's chain id, or its cluster
 * number for a `solana` source), `minRpcQuorum` (default 2), and `tipLagMargin`
 * (per source, required). Other fields are ignored.
 */
export const validateChainConfig = (document: unknown): ChainConfigResult => {
  // A document that is not an object is read as an empty one: every required
  // field is then reported missing.
  const fields = isRecord(document) ? document : {};
  const issues: Issues = [];
  const environment = own(fields, "environment");
  if (typeof environment !== "string" || !ENVIRONMENTS.has(environment)) {
    issues.push({ code: "invalid-environment", field: "environment" });
  }
  const runtimeSigner = readAddress(own(fields, "runtimeSigner"));
  if (runtimeSigner === undefined) {
    issues.push({ code: "invalid-signer", field: "runtimeSigner" });
  }
  const registryDomain = readDomain(own(fields, "registryDomain"));
  if (registryDomain === undefined) {
    issues.push({ code: "invalid-domain", field: "registryDomain" });
  }
  const quorum = readQuorum(own(fields, "minRpcQuorum"), environment, issues);
  const endpoints = readEndpoints(own(fields, "rpcEndpoints"), issues);
  const pinned = readSources(
    fields,
    endpoints ?? new Map(),
    environment === "production",
  );
  issues.push(...pinned.issues);
  if (quorum !== undefined && endpoints !== undefined) {
    for (const [source, list] of endpoints) {
      if (list.length < quorum) {
        issues.push({
          code: "quorum-unreachable",
          field: `rpcEndpoints.${source}`,
        });
      }
    }
  }
  if (
    issues.length > 0 ||
    runtimeSigner === undefined ||
    registryDomain === undefined ||
    quorum === undefined ||
    endpoints === undefined
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.map(issue => Object.freeze(issue))),
    });
  }
  const config = {
    environment: environment as Environment,
    runtimeSigner,
    registryDomain,
    minRpcQuorum: quorum,
    degraded: quorum < DEFAULT_MIN_RPC_QUORUM,
    sources: pinned.sources,
  } as ChainConfig;
  return Object.freeze({ ok: true, config: Object.freeze(config) });
};
