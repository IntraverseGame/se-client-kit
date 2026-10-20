// The environment configuration document (specs/wrapper.md, Configuration).
// One document per environment, served from the SE origin, holds only public
// values; the Wrapper refuses to start on an invalid one. The chain part
// (`environment`, `runtimeSigner`, `registryDomain`, `rpcEndpoints`,
// `entropyChainId`, `minRpcQuorum`, `tipLagMargin`) is validated by the shell's
// `validateChainConfig`, which also applies both boot rules: `production` with
// `minRpcQuorum` below 2 (W-26a) and a source with fewer endpoints than
// `minRpcQuorum` (W-26b). This module reads the rest and refuses any field the
// schema does not list, and applies the disjoint-origins rule:
// `operatorOrigins` and `gameOrigins` share no entry, and neither holds the
// Wrapper's own origin (the SE origin), so no origin is both an embedder and a
// game (W-49, specs/wrapper/operator-embedding.md).

import {
  type ChainConfig,
  type ChainConfigIssueCode,
  validateChainConfig,
} from "@intraverse/se-client-shell";

/** A document that passed `validateEnvironmentConfig`, frozen. */
export type EnvironmentConfig = {
  /** The chain part, as the shell validated it (W-26, W-26a, W-26b). */
  readonly chain: ChainConfig;
  /** The Play API base, ending with `/play/v1` (no trailing slash). */
  readonly playApiBaseUrl: string;
  /** The verify page base (W-39). */
  readonly verifyBaseUrl: string;
  /** The allow-list of game origins D (W-37), at least one. */
  readonly gameOrigins: readonly string[];
  /** The allow-list of operator page origins A (W-49); may be empty. */
  readonly operatorOrigins: readonly string[];
};

/** Why a document was refused: the shell's chain codes, and the Wrapper's. */
export type EnvironmentConfigIssueCode =
  | ChainConfigIssueCode
  /** A top-level field the schema does not list. */
  | "unknown-field"
  /** `playApiBaseUrl` is not an absolute URL ending with `/play/v1`. */
  | "invalid-play-api-base"
  /** `verifyBaseUrl` is not an absolute URL. */
  | "invalid-verify-base"
  /** `gameOrigins` is not a non-empty list of distinct origins. */
  | "invalid-game-origins"
  /** `operatorOrigins` is not a list of distinct origins. */
  | "invalid-operator-origins"
  /**
   * The disjoint-origins rule: `operatorOrigins` holds the SE origin or an
   * entry of `gameOrigins`, or `gameOrigins` holds the SE origin.
   */
  | "overlapping-origins";

export type EnvironmentConfigIssue = {
  readonly code: EnvironmentConfigIssueCode;
  /** The field, as a dotted path. */
  readonly field: string;
};

export type EnvironmentConfigResult =
  | { readonly ok: true; readonly config: EnvironmentConfig }
  | { readonly ok: false; readonly issues: readonly EnvironmentConfigIssue[] };

/** Every top-level field of the document; any other is refused. */
export const ENVIRONMENT_CONFIG_FIELDS: readonly string[] = Object.freeze([
  "environment",
  "playApiBaseUrl",
  "verifyBaseUrl",
  "runtimeSigner",
  "registryDomain",
  "rpcEndpoints",
  "entropyChainId",
  "minRpcQuorum",
  "tipLagMargin",
  "gameOrigins",
  "operatorOrigins",
]);

const PLAY_API_SUFFIX = "/play/v1";
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const own = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown => (Object.hasOwn(record, key) ? record[key] : undefined);

/**
 * An absolute `https:` URL, or `http:` on a loopback host (the shell's rule for
 * RPC endpoints), with no credentials, query, or fragment.
 */
const readUrl = (value: unknown): URL | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
  // `href` is the parser's serialization: a value that is not already written
  // that way (a trailing `?` or `#`, odd casing) is refused, not repaired.
  const canonical = url.href === value || url.href === `${value}/`;
  const plain =
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "";
  return secure && canonical && plain ? url : undefined;
};

const readPlayApiBase = (value: unknown): string | undefined => {
  const url = readUrl(value);
  return url !== undefined &&
    typeof value === "string" &&
    url.href === value &&
    url.pathname.endsWith(PLAY_API_SUFFIX)
    ? value
    : undefined;
};

const readVerifyBase = (value: unknown): string | undefined =>
  readUrl(value) === undefined ? undefined : (value as string);

/** An origin, written exactly as `URL.origin` serializes it. */
const readOrigin = (value: unknown): string | undefined => {
  const url = typeof value === "string" ? readUrl(value) : undefined;
  return url !== undefined && url.origin === value ? value : undefined;
};

const readOrigins = (
  value: unknown,
  minimum: number,
): readonly string[] | undefined => {
  if (!Array.isArray(value) || value.length < minimum) {
    return undefined;
  }
  const origins = (value as readonly unknown[]).map(entry => readOrigin(entry));
  if (origins.some(origin => origin === undefined)) {
    return undefined;
  }
  const list = origins as string[];
  return new Set(list).size === list.length ? Object.freeze(list) : undefined;
};

/** The disjoint-origins rule's issues, given both lists as read. */
const overlaps = (
  ownOrigin: string,
  gameOrigins: readonly string[] | undefined,
  operatorOrigins: readonly string[] | undefined,
): EnvironmentConfigIssue[] => [
  ...(operatorOrigins !== undefined &&
  operatorOrigins.some(
    origin => origin === ownOrigin || gameOrigins?.includes(origin) === true,
  )
    ? [{ code: "overlapping-origins" as const, field: "operatorOrigins" }]
    : []),
  ...(gameOrigins?.includes(ownOrigin) === true
    ? [{ code: "overlapping-origins" as const, field: "gameOrigins" }]
    : []),
];

/**
 * Validates the environment configuration document (parsed JSON) for the
 * Wrapper at `ownOrigin` (the SE origin) and returns it typed and frozen, or
 * every issue found. The Wrapper refuses to start (the configuration-error
 * state, nothing signed) on any issue. An issue names a field only, never a
 * value.
 */
export const validateEnvironmentConfig = (
  document: unknown,
  ownOrigin: string,
): EnvironmentConfigResult => {
  const fields = isRecord(document) ? document : {};
  const issues: EnvironmentConfigIssue[] = [];
  for (const field of Object.keys(fields)) {
    if (!ENVIRONMENT_CONFIG_FIELDS.includes(field)) {
      issues.push({ code: "unknown-field", field });
    }
  }
  const chain = validateChainConfig(document);
  if (!chain.ok) {
    issues.push(
      ...chain.issues.map(issue => ({ code: issue.code, field: issue.field })),
    );
  }
  const playApiBaseUrl = readPlayApiBase(own(fields, "playApiBaseUrl"));
  if (playApiBaseUrl === undefined) {
    issues.push({ code: "invalid-play-api-base", field: "playApiBaseUrl" });
  }
  const verifyBaseUrl = readVerifyBase(own(fields, "verifyBaseUrl"));
  if (verifyBaseUrl === undefined) {
    issues.push({ code: "invalid-verify-base", field: "verifyBaseUrl" });
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
    !chain.ok ||
    issues.length > 0 ||
    playApiBaseUrl === undefined ||
    verifyBaseUrl === undefined ||
    gameOrigins === undefined ||
    operatorOrigins === undefined
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.map(issue => Object.freeze(issue))),
    });
  }
  return Object.freeze({
    ok: true,
    config: Object.freeze({
      chain: chain.config,
      playApiBaseUrl,
      verifyBaseUrl,
      gameOrigins,
      operatorOrigins,
    }),
  });
};
