// The environment configuration document, as the verify page reads it (V-3):
// the same document as the Wrapper's, validated by the same rules before
// anything else is read. The page cannot take the Wrapper's validator (it never
// imports `shell` or an app), so the rules are spelled here; a field the page
// does not use is still validated, so a document one refuses the other refuses
// too. An issue names a field, never a value.

import type { RpcEndpoint } from "./chain-read.ts";
import {
  type Fields,
  isCount,
  isRecord,
  NAME,
  own,
  readAddress,
  readApiBase,
  readEndpoint,
  readOrigins,
  readPerSource,
  readUrl,
  shareProvider,
} from "./config-fields.ts";

export type Environment = "production" | "preview" | "local";

/** The pinned chain and endpoints of one entropy source. */
export type SourceConfig = {
  readonly chainId: number;
  readonly endpoints: readonly RpcEndpoint[];
};

/** A document that passed `validateEnvironmentConfig`. */
export type VerifyConfig = {
  readonly environment: Environment;
  /** The address that signs `CreateRoundAuth` (lowercase). */
  readonly runtimeSigner: `0x${string}`;
  readonly registryDomain: {
    readonly chainId: bigint;
    readonly verifyingContract: `0x${string}`;
  };
  readonly minRpcQuorum: number;
  /** Per entropy source, by its `source` identifier. */
  readonly sources: Readonly<Record<string, SourceConfig>>;
  /** The page's own base, `<origin>/verify`. */
  readonly verifyBaseUrl: string;
  /** The verify API base, ending with `/verify/v1`. */
  readonly verifyApiBaseUrl: string;
};

export type ConfigIssueCode =
  | "unknown-field"
  | "invalid-environment"
  | "invalid-signer"
  | "invalid-domain"
  | "invalid-quorum"
  | "production-quorum"
  | "invalid-endpoints"
  | "shared-provider"
  | "quorum-unreachable"
  | "invalid-entropy-chain-id"
  | "invalid-lag-margin"
  | "invalid-play-api-base"
  | "invalid-verify-base"
  | "invalid-verify-api-base"
  | "invalid-game-origins"
  | "invalid-operator-origins"
  | "overlapping-origins";

export type ConfigIssue = {
  readonly code: ConfigIssueCode;
  /** The field, as a dotted path. */
  readonly field: string;
};

export type ConfigResult =
  | { readonly ok: true; readonly config: VerifyConfig }
  | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

/** Every top-level field of the document; any other is refused. */
export const CONFIG_FIELDS: readonly string[] = Object.freeze([
  "environment",
  "playApiBaseUrl",
  "verifyBaseUrl",
  "verifyApiBaseUrl",
  "runtimeSigner",
  "registryDomain",
  "rpcEndpoints",
  "entropyChainId",
  "minRpcQuorum",
  "tipLagMargin",
  "gameOrigins",
  "operatorOrigins",
]);

const ENVIRONMENTS: ReadonlySet<string> = new Set([
  "production",
  "preview",
  "local",
]);
const DEFAULT_MIN_RPC_QUORUM = 2;

type Issues = ConfigIssue[];

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
    const endpoints = (list as readonly unknown[]).map(e => readEndpoint(e));
    if (endpoints.some(e => e === undefined)) {
      issues.push({ code: "invalid-endpoints", field });
      continue;
    }
    const valid = Object.freeze(endpoints as RpcEndpoint[]);
    if (shareProvider(valid)) issues.push({ code: "shared-provider", field });
    sources.set(source, valid);
  }
  return sources;
};

const readDomain = (
  value: unknown,
): VerifyConfig["registryDomain"] | undefined => {
  if (!isRecord(value)) return undefined;
  const chainId = own(value, "chainId");
  const verifyingContract = readAddress(own(value, "verifyingContract"));
  return isCount(chainId, 1) && verifyingContract !== undefined
    ? Object.freeze({ chainId: BigInt(chainId), verifyingContract })
    : undefined;
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

/** The disjoint-origins rule: no origin is both an embedder and a game. */
const overlaps = (
  ownOrigin: string,
  gameOrigins: readonly string[] | undefined,
  operatorOrigins: readonly string[] | undefined,
): ConfigIssue[] => [
  ...(operatorOrigins?.some(
    origin => origin === ownOrigin || gameOrigins?.includes(origin) === true,
  ) === true
    ? [{ code: "overlapping-origins" as const, field: "operatorOrigins" }]
    : []),
  ...(gameOrigins?.includes(ownOrigin) === true
    ? [{ code: "overlapping-origins" as const, field: "gameOrigins" }]
    : []),
];

const unknownFields = (fields: Fields): ConfigIssue[] =>
  Object.keys(fields)
    .filter(field => !CONFIG_FIELDS.includes(field))
    .map(field => ({ code: "unknown-field" as const, field }));

/**
 * Validates the parsed document for the page served at `ownOrigin` and returns
 * it typed and frozen, or every issue found (the configuration-error state).
 */
export const validateEnvironmentConfig = (
  document: unknown,
  ownOrigin: string,
): ConfigResult => {
  const fields = isRecord(document) ? document : {};
  const issues: Issues = unknownFields(fields);
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
  const names = [...(endpoints?.keys() ?? [])];
  const margins = readPerSource(fields, "tipLagMargin", 0, names);
  const chainIds = readPerSource(fields, "entropyChainId", 1, names);
  issues.push(
    ...margins.refused.map(field => ({
      code: "invalid-lag-margin" as const,
      field,
    })),
    ...chainIds.refused.map(field => ({
      code: "invalid-entropy-chain-id" as const,
      field,
    })),
  );
  for (const [source, list] of endpoints ?? []) {
    if (quorum !== undefined && list.length < quorum) {
      issues.push({
        code: "quorum-unreachable",
        field: `rpcEndpoints.${source}`,
      });
    }
  }
  if (readApiBase(own(fields, "playApiBaseUrl"), "/play/v1") === undefined) {
    issues.push({ code: "invalid-play-api-base", field: "playApiBaseUrl" });
  }
  const verifyBase = own(fields, "verifyBaseUrl");
  const verifyBaseUrl =
    readUrl(verifyBase) === undefined ? undefined : (verifyBase as string);
  if (verifyBaseUrl === undefined) {
    issues.push({ code: "invalid-verify-base", field: "verifyBaseUrl" });
  }
  const verifyApiBaseUrl = readApiBase(
    own(fields, "verifyApiBaseUrl"),
    "/verify/v1",
  );
  if (verifyApiBaseUrl === undefined) {
    issues.push({ code: "invalid-verify-api-base", field: "verifyApiBaseUrl" });
  }
  const gameOrigins = readOrigins(own(fields, "gameOrigins"), 1);
  if (gameOrigins === undefined) {
    issues.push({ code: "invalid-game-origins", field: "gameOrigins" });
  }
  const operatorOrigins = readOrigins(own(fields, "operatorOrigins"), 0);
  if (operatorOrigins === undefined) {
    issues.push({ code: "invalid-operator-origins", field: "operatorOrigins" });
  }
  issues.push(...overlaps(ownOrigin, gameOrigins, operatorOrigins));
  if (
    issues.length > 0 ||
    runtimeSigner === undefined ||
    registryDomain === undefined ||
    quorum === undefined ||
    endpoints === undefined ||
    verifyBaseUrl === undefined ||
    verifyApiBaseUrl === undefined
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.map(issue => Object.freeze(issue))),
    });
  }
  const sources: Record<string, SourceConfig> = {};
  for (const [source, list] of endpoints) {
    const chainId = chainIds.values.get(source);
    if (chainId !== undefined) {
      sources[source] = Object.freeze({ chainId, endpoints: list });
    }
  }
  return Object.freeze({
    ok: true,
    config: Object.freeze({
      environment: environment as Environment,
      runtimeSigner,
      registryDomain,
      minRpcQuorum: quorum,
      sources: Object.freeze(sources),
      verifyBaseUrl,
      verifyApiBaseUrl,
    }),
  });
};
