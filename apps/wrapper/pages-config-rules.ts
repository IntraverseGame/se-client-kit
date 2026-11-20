// The Pages configuration's own rules beyond the Wrapper's validator
// (pages-config.ts; specs/client-kit.md, The Pages sites' configuration;
// ADR-009, amendment note of 2026-11-17), so that the configuration job
// refuses what the deploy would refuse later: for production, the release's
// check (.github/workflows/pages-prod-check.yml) refuses it before npm
// publishes. Pure.
//
// - In both modes, every origin the deploy's headers step reads from the
//   Wrapper's document (pages.yml and pages-prod.yml, "Write the Pages headers
//   files") matches that step's `origin` pattern: the origin of each RPC
//   endpoint URL (its scheme and authority, as the step's jq takes it), each
//   game and operator origin, and the Wrapper's origin (of `playApiBaseUrl`).
//   The step refuses any other.
// - In production mode only, `environment` is `production`, so W-26a's boot
//   rule (`minRpcQuorum` at least 2) and the production cluster rule (every
//   `solana` source on mainnet-beta) apply when the Wrapper's validator checks
//   the documents. Staging runs as `preview`.
//
// An issue names an input and a field with a code, never a value: the values
// are hostnames kept out of the logs.

/**
 * The deploy's headers step's `origin` pattern, character for character
 * (tools/pages-config-origins.test.ts compares the two): `https`, lowercase
 * dot-separated labels of letters, digits, and inner `-`, and an optional
 * port.
 */
export const HEADERS_ORIGIN_PATTERN =
  "^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$";

const HEADERS_ORIGIN = new RegExp(HEADERS_ORIGIN_PATTERN, "u");

/** The step's `capture("^(?<o>[a-z]+://[^/?#]+)")` of an endpoint URL. */
const URL_ORIGIN = /^[a-z]+:\/\/[^/?#]+/u;

/** The step's `capture("^(?<o>[^/]+//[^/?#]+)/play/v1$")` of the Play base. */
const PLAY_API_ORIGIN = /^([^/]+\/\/[^/?#]+)\/play\/v1$/u;

/** The code of an origin the headers step would refuse. */
export const NOT_HEADERS_ORIGIN = "not-https-origin";

/** The code of a document that does not configure `production`. */
export const NOT_PRODUCTION = "not-production";

type Document = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Document =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isHeadersOrigin = (value: string | undefined): boolean =>
  value !== undefined && HEADERS_ORIGIN.test(value);

const refused = (input: string, field: string): string =>
  `${input}: ${NOT_HEADERS_ORIGIN} at ${field}`;

/** The endpoints of `rpcEndpoints` the headers step would refuse. */
const endpointIssues = (rpcEndpoints: unknown): string[] =>
  isRecord(rpcEndpoints)
    ? Object.entries(rpcEndpoints).flatMap(([source, list]) =>
        Array.isArray(list)
          ? (list as readonly unknown[]).flatMap((endpoint, index) => {
              const url = isRecord(endpoint) ? endpoint["url"] : undefined;
              return typeof url === "string" &&
                !isHeadersOrigin(URL_ORIGIN.exec(url)?.[0])
                ? [
                    refused(
                      "PAGES_RPC_ENDPOINTS",
                      `rpcEndpoints.${source}.${String(index)}.url`,
                    ),
                  ]
                : [];
            })
          : [],
      )
    : [];

/** The entries of an origin list the headers step would refuse. */
const originIssues = (input: string, field: string, list: unknown): string[] =>
  Array.isArray(list)
    ? (list as readonly unknown[]).flatMap((origin, index) =>
        typeof origin === "string" && !isHeadersOrigin(origin)
          ? [refused(input, `${field}.${String(index)}`)]
          : [],
      )
    : [];

/**
 * The origins of the Wrapper's document the deploy's headers step would refuse,
 * in either mode; the validator accepts some of them.
 */
export const headersOriginIssues = (document: Document): readonly string[] => {
  const playApiBaseUrl = document["playApiBaseUrl"];
  const wrapperOrigin =
    typeof playApiBaseUrl === "string"
      ? PLAY_API_ORIGIN.exec(playApiBaseUrl)?.[1]
      : undefined;
  return [
    ...(isHeadersOrigin(wrapperOrigin)
      ? []
      : [refused("PAGES_WRAPPER_ORIGIN", "playApiBaseUrl")]),
    ...endpointIssues(document["rpcEndpoints"]),
    ...originIssues(
      "PAGES_GAME_ORIGINS",
      "gameOrigins",
      document["gameOrigins"],
    ),
    ...originIssues(
      "PAGES_OPERATOR_ORIGINS",
      "operatorOrigins",
      document["operatorOrigins"],
    ),
  ];
};

/**
 * What production mode adds: a document whose `environment` is not
 * `production`.
 */
export const productionIssues = (document: Document): readonly string[] =>
  document["environment"] === "production"
    ? []
    : [`PAGES_CHAIN_PINS: ${NOT_PRODUCTION} at environment`];
