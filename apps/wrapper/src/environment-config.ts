// The environment configuration document (specs/wrapper.md, Configuration).
// One document per environment, served from the SE origin, holds only public
// values; the Wrapper refuses to start on an invalid one. The chain part
// (`environment`, `runtimeSigner`, `registryDomain`, `rpcEndpoints`,
// `entropyChainKind`, `entropyChainId`, `minRpcQuorum`, `tipLagMargin`) is
// validated by the shell's `validateChainConfig`, which also applies both boot
// rules, `production` with `minRpcQuorum` below 2 (W-26a) and a source with
// fewer endpoints than `minRpcQuorum` (W-26b), and the chain kind's
// cross-check (RFC-007 section 1). This module reads the rest and refuses any
// field the schema does not list, and applies the disjoint-origins rule:
// `operatorOrigins` and `gameOrigins` share no entry, and neither holds the
// Wrapper's own origin (the SE origin), so no origin is both an embedder and a
// game (W-49, specs/wrapper/operator-embedding.md). The wallet delegation's
// two optional fields are delegation-config.ts's (W-62, W-63, ADR-012).

import {
  type ChainConfig,
  type ChainConfigIssueCode,
  validateChainConfig,
} from "@intraverse/se-client-shell";

import { type AutoplayConfig, readAutoplayConfig } from "./autoplay-config.ts";
import {
  isRecord,
  own,
  readOrigins,
  readPlayApiBase,
  readVerifyApiBase,
  readVerifyBase,
} from "./config-urls.ts";
import {
  type DelegationConfigIssueCode,
  readDelegationConfig,
} from "./delegation-config.ts";

/** A document that passed `validateEnvironmentConfig`, frozen. */
export type EnvironmentConfig = {
  /** The chain part, as the shell validated it (W-26, W-26a, W-26b). */
  readonly chain: ChainConfig;
  /** The Play API base, ending with `/play/v1` (no trailing slash). */
  readonly playApiBaseUrl: string;
  /** The verify page base (W-39). */
  readonly verifyBaseUrl: string;
  /**
   * The verify API base, ending with `/verify/v1`. The Wrapper does not call
   * it; the verify page's policy names its origin (`release-headers.ts`).
   */
  readonly verifyApiBaseUrl: string;
  /** The allow-list of game origins D (W-37), at least one. */
  readonly gameOrigins: readonly string[];
  /** The allow-list of operator page origins A (W-49); may be empty. */
  readonly operatorOrigins: readonly string[];
  /** Autoplay of book rounds, when the deployment turns it on (RFC-005). */
  readonly autoplay?: AutoplayConfig;
  /** The signing page's origin (W-62); without it nothing is delegated. */
  readonly signingPageOrigin?: string;
  /** Whether a `pending` notice may be offered (W-63); `false` when absent. */
  readonly acceptPendingNotices?: boolean;
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
  /**
   * `verifyApiBaseUrl` is not an absolute URL ending with `/verify/v1` on the
   * Wrapper's own origin (V-3a).
   */
  | "invalid-verify-api-base"
  /** `gameOrigins` is not a non-empty list of distinct origins. */
  | "invalid-game-origins"
  /** `operatorOrigins` is not a list of distinct origins. */
  | "invalid-operator-origins"
  /**
   * The disjoint-origins rule: `operatorOrigins` holds the SE origin or an
   * entry of `gameOrigins`, or `gameOrigins` holds the SE origin.
   */
  | "overlapping-origins"
  /** `autoplay` is present and malformed (RFC-005). */
  | "invalid-autoplay"
  /** One of the wallet delegation's two fields (W-62, W-63). */
  | DelegationConfigIssueCode;

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
  "verifyApiBaseUrl",
  "runtimeSigner",
  "registryDomain",
  "rpcEndpoints",
  "entropyChainKind",
  "entropyChainId",
  "minRpcQuorum",
  "tipLagMargin",
  "gameOrigins",
  "operatorOrigins",
  "autoplay",
  "signingPageOrigin",
  "acceptPendingNotices",
]);

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
  const verifyApiBaseUrl = readVerifyApiBase(
    own(fields, "verifyApiBaseUrl"),
    ownOrigin,
  );
  if (verifyApiBaseUrl === undefined) {
    issues.push({
      code: "invalid-verify-api-base",
      field: "verifyApiBaseUrl",
    });
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
  const autoplay = Object.hasOwn(fields, "autoplay")
    ? readAutoplayConfig(fields["autoplay"])
    : null;
  if (autoplay === undefined) {
    issues.push({ code: "invalid-autoplay", field: "autoplay" });
  }
  const { issues: delegationIssues, ...delegation } = readDelegationConfig(
    fields,
    {
      ownOrigin,
      environment: own(fields, "environment"),
      verifyBaseUrl,
      gameOrigins,
      operatorOrigins,
    },
  );
  issues.push(...delegationIssues);
  if (
    !chain.ok ||
    issues.length > 0 ||
    playApiBaseUrl === undefined ||
    verifyBaseUrl === undefined ||
    verifyApiBaseUrl === undefined ||
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
      verifyApiBaseUrl,
      gameOrigins,
      operatorOrigins,
      ...(autoplay === null || autoplay === undefined ? {} : { autoplay }),
      ...delegation,
    }),
  });
};
