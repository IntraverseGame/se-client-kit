// The environment configuration documents of the Pages sites (ADR-008;
// specs/client-kit.md, The Pages sites' configuration): built from the
// configuration environment's values (`pages-stage`, or `pages-prod-config`
// for production) and validated with the Wrapper's own validator
// (apps/wrapper/src/environment-config.ts, the schema of specs/wrapper.md,
// Configuration), each for its own site's origin. Pure: the CLI
// (apps/wrapper/pages-config-cli.ts) reads the environment and writes the
// files.
//
// Beyond the validator (pages-config-rules.ts; ADR-009, amendment note of
// 2026-11-17): in both modes, every origin the deploy's headers step reads must
// be one that step accepts; production mode (`production: true`) also requires
// `environment` to be `production`, so W-26a's quorum rule and the production
// cluster rule apply.
//
// The two documents differ only where the site differs:
// - `playApiBaseUrl`: the Wrapper's origin plus `/play/v1` in both (the
//   verifier's page validates it and does not call it);
// - `verifyApiBaseUrl`: the site's own origin plus `/verify/v1`, through that
//   site's API proxy;
// - `verifyBaseUrl`: the verifier's origin plus `/verify` in both, so the
//   Wrapper's verify link opens the verifier's site.
// - `earlierPins`: the verifier's only, and only when the list has an entry
//   (V-3b in specs/verify-page.md). The Wrapper's validator refuses the field,
//   so each document is validated without it, and each entry is validated under
//   the same rule as the current pair.
// - `signingPageOrigin` and `acceptPendingNotices`: the Wrapper's only, and
//   only with `PAGES_SIGNER_ORIGIN`, which also builds a third document, the
//   signing page's (pages-signer-config.ts; specs/signing-page.md, SP-15).
// The chain pins, the RPC endpoints, and the game and operator origins are the
// same in both, and the deploy job derives each site's CSP lists from these
// documents, so the policy and the configuration cannot disagree.
//
// An issue names an input or a field and a code, never a value: the values are
// hostnames kept out of the logs.

import { headersOriginIssues, productionIssues } from "./pages-config-rules.ts";
import { earlierPinIssues } from "./pages-earlier-pins.ts";
import {
  type SignerInputs,
  signerInputIssues,
  signerPlan,
} from "./pages-signer-config.ts";
import {
  ENVIRONMENT_CONFIG_FIELDS,
  validateEnvironmentConfig,
} from "./src/environment-config.ts";

/** The inputs, by the names of the environment's secrets and variables. */
export type PagesConfigInputs = SignerInputs & {
  /** Secret: the Wrapper site's origin. */
  readonly PAGES_WRAPPER_ORIGIN?: string | undefined;
  /** Secret: the verifier site's origin. */
  readonly PAGES_VERIFIER_ORIGIN?: string | undefined;
  /** Secret: JSON of the chain pins. */
  readonly PAGES_CHAIN_PINS?: string | undefined;
  /** Secret: JSON of `rpcEndpoints`. */
  readonly PAGES_RPC_ENDPOINTS?: string | undefined;
  /**
   * Secret: whitespace-separated RPC origins, exactly the origins of
   * `PAGES_RPC_ENDPOINTS`' URLs (a cross-check; the CSP takes the documents').
   */
  readonly PAGES_RPC_ORIGINS?: string | undefined;
  /** Secret: whitespace-separated game origins. */
  readonly PAGES_GAME_ORIGINS?: string | undefined;
  /** Secret: whitespace-separated operator origins; may be empty. */
  readonly PAGES_OPERATOR_ORIGINS?: string | undefined;
};

/** The fields `PAGES_CHAIN_PINS` holds, and no other. */
export const CHAIN_PIN_FIELDS: readonly string[] = Object.freeze([
  "environment",
  "runtimeSigner",
  "registryDomain",
  "earlierPins",
  "entropyChainKind",
  "entropyChainId",
  "minRpcQuorum",
  "tipLagMargin",
]);

export type PagesConfigOptions = {
  /**
   * Production's own rule too (`environment` must be `production`,
   * pages-config-rules.ts): the release's check and the production deploy set
   * it; staging's job does not.
   */
  readonly production?: boolean;
};

export type PagesConfigs = {
  /** The Wrapper site's `environment-config.json`. */
  readonly wrapper: string;
  /** The verifier site's `environment-config.json`. */
  readonly verifier: string;
  /**
   * The signing page site's `environment-config.json`, only with
   * `PAGES_SIGNER_ORIGIN`; validated by the page's own validator in the job.
   */
  readonly signer?: string;
};

export type PagesConfigResult =
  | { readonly ok: true; readonly configs: PagesConfigs }
  | { readonly ok: false; readonly issues: readonly string[] };

type Document = Record<string, unknown>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Exactly an `https` origin, as `URL.origin` writes it. */
const readSiteOrigin = (value: string | undefined): string | undefined => {
  if (value === undefined || value === "") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

const readJson = (value: string | undefined): unknown => {
  if (value === undefined || value.trim() === "") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const readList = (value: string | undefined): string[] =>
  (value ?? "").split(/\s+/u).filter(entry => entry !== "");

/** The origins of `rpcEndpoints`' URLs, or `undefined` when it is malformed. */
const endpointOrigins = (rpcEndpoints: unknown): Set<string> | undefined => {
  if (!isRecord(rpcEndpoints)) return undefined;
  const origins = new Set<string>();
  for (const list of Object.values(rpcEndpoints)) {
    if (!Array.isArray(list)) return undefined;
    for (const endpoint of list as readonly unknown[]) {
      const url = isRecord(endpoint) ? endpoint["url"] : undefined;
      if (typeof url !== "string" || !URL.canParse(url)) return undefined;
      origins.add(new URL(url).origin);
    }
  }
  return origins;
};

/** Whether two lists hold the same entries, in any order. */
const sameEntries = (
  left: ReadonlySet<string>,
  right: readonly string[],
): boolean =>
  left.size === new Set(right).size && right.every(entry => left.has(entry));

/** The document with its fields in the schema's order, `earlierPins` last. */
const ordered = (document: Document): string =>
  `${JSON.stringify(
    Object.fromEntries(
      [...ENVIRONMENT_CONFIG_FIELDS, "earlierPins"]
        .filter(field => field in document)
        .map(field => [field, document[field]]),
    ),
    undefined,
    2,
  )}\n`;

/** Builds and validates both documents, or names every problem. */
export const buildPagesConfigs = (
  inputs: PagesConfigInputs,
  { production = false }: PagesConfigOptions = {},
): PagesConfigResult => {
  const issues: string[] = [];
  const wrapperOrigin = readSiteOrigin(inputs.PAGES_WRAPPER_ORIGIN);
  if (wrapperOrigin === undefined) {
    issues.push("PAGES_WRAPPER_ORIGIN: missing or not an https origin");
  }
  const verifierOrigin = readSiteOrigin(inputs.PAGES_VERIFIER_ORIGIN);
  if (verifierOrigin === undefined) {
    issues.push("PAGES_VERIFIER_ORIGIN: missing or not an https origin");
  }
  if (wrapperOrigin !== undefined && wrapperOrigin === verifierOrigin) {
    issues.push("PAGES_VERIFIER_ORIGIN: the same as PAGES_WRAPPER_ORIGIN");
  }
  const pins = readJson(inputs.PAGES_CHAIN_PINS);
  if (isRecord(pins)) {
    for (const field of Object.keys(pins)) {
      if (!CHAIN_PIN_FIELDS.includes(field)) {
        issues.push(`PAGES_CHAIN_PINS: field ${field} is not a chain pin`);
      }
    }
  } else {
    issues.push("PAGES_CHAIN_PINS: missing or not a JSON object");
  }
  const rpcEndpoints = readJson(inputs.PAGES_RPC_ENDPOINTS);
  if (rpcEndpoints === undefined) {
    issues.push("PAGES_RPC_ENDPOINTS: missing or not JSON");
  }
  const origins = endpointOrigins(rpcEndpoints);
  if (
    origins !== undefined &&
    !sameEntries(origins, readList(inputs.PAGES_RPC_ORIGINS))
  ) {
    issues.push(
      "PAGES_RPC_ORIGINS: not exactly the origins of PAGES_RPC_ENDPOINTS",
    );
  }
  issues.push(
    ...signerInputIssues(inputs, {
      wrapperOrigin: wrapperOrigin ?? "",
      verifierOrigin: verifierOrigin ?? "",
      production,
    }),
  );
  if (
    issues.length > 0 ||
    wrapperOrigin === undefined ||
    verifierOrigin === undefined ||
    !isRecord(pins)
  ) {
    return { ok: false, issues };
  }
  const { earlierPins, ...currentPins } = pins;
  const shared: Document = {
    ...currentPins,
    rpcEndpoints,
    gameOrigins: readList(inputs.PAGES_GAME_ORIGINS),
    operatorOrigins: readList(inputs.PAGES_OPERATOR_ORIGINS),
    playApiBaseUrl: `${wrapperOrigin}/play/v1`,
    verifyBaseUrl: `${verifierOrigin}/verify`,
  };
  issues.push(
    ...(production ? productionIssues(shared) : []),
    ...headersOriginIssues(shared),
    ...earlierPinIssues(
      earlierPins,
      { ...shared, verifyApiBaseUrl: `${wrapperOrigin}/verify/v1` },
      wrapperOrigin,
    ),
  );
  // An empty list is not written: the verifier's document stays what it was
  // before the field, and absent means empty to the page.
  const verifierOnly: Document =
    Array.isArray(earlierPins) && earlierPins.length > 0 ? { earlierPins } : {};
  const signer = signerPlan(inputs, {
    wrapperOrigin,
    verifierOrigin,
    environment: currentPins["environment"],
    production,
  });
  // Each site's fields beyond the shared ones: validated with the document (the
  // Wrapper's delegation fields), or written after it (the verifier's
  // `earlierPins`, which the Wrapper's validator refuses).
  const sites = [
    ["wrapper", wrapperOrigin, signer.wrapperFields, {}],
    ["verifier", verifierOrigin, {}, verifierOnly],
  ] as const;
  const documents = sites.map(([site, origin, checked, only]) => {
    const document: Document = {
      ...shared,
      verifyApiBaseUrl: `${origin}/verify/v1`,
      ...checked,
    };
    const result = validateEnvironmentConfig(document, origin);
    if (!result.ok) {
      issues.push(
        ...result.issues.map(
          issue => `${site} document: ${issue.code} at ${issue.field}`,
        ),
      );
    }
    return ordered({ ...document, ...only });
  });
  const [wrapper, verifier] = documents;
  return issues.length > 0 || wrapper === undefined || verifier === undefined
    ? { ok: false, issues }
    : {
        ok: true,
        configs: {
          wrapper,
          verifier,
          ...(signer.signerDocument === undefined
            ? {}
            : { signer: signer.signerDocument }),
        },
      };
};
