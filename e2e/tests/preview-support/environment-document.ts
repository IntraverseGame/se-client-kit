// The environment document check (RFC-002, "Safety: the mode refuses what it
// should not run against"). The suite fetches the document from the preview
// origin the way the Wrapper does (W-43: no credentials, no cache, no redirect,
// 15 s) in the global setup and again in each test's fixture, and:
//
// - refuses `environment` other than `preview` (a `production` or `local`
//   document stops the run: the control against pointing the money-moving mode
//   at the wrong stack);
// - reads `playApiBaseUrl` and `verifyApiBaseUrl` from the document, and does
//   not derive them from the preview origin;
// - checks that every origin the browser would reach (the two API bases, each
//   RPC endpoint) is on the allow-list, and that `gameOrigins` lists the shared
//   game origin.
//
// It repeats the Wrapper's own boot rule and does not replace or relax it: the
// Wrapper validates the whole document. A failure names the check, and an
// origin where it is an origin; never a path, a query, or the document, because
// a provider key can sit in an RPC path.

import { ENVIRONMENT_CONFIG_PATH } from "../harness/environment-config.ts";
import { OriginRefusedError } from "./guard-preview.ts";
import type { PreviewEnvironment } from "./preview-environment.ts";

/** The Wrapper's timeout for the document (W-43). */
export const DOCUMENT_TIMEOUT_MS = 15_000;

export type PreviewSafetyCheck =
  | "fetch"
  | "document"
  | "environment"
  | "game-origin";

export class PreviewSafetyError extends Error {
  readonly check: PreviewSafetyCheck;

  constructor(check: PreviewSafetyCheck) {
    super(`the environment document check failed (${check})`);
    this.name = "PreviewSafetyError";
    this.check = check;
  }
}

/** What the suite reads of the validated document. */
export type PreviewDocument = {
  readonly playApiBaseUrl: string;
  readonly verifyApiBaseUrl: string;
  readonly gameOrigins: readonly string[];
  /** Every RPC endpoint URL; the suite never prints one. */
  readonly rpcUrls: readonly string[];
};

export type FetchLike = (
  url: string,
  init: {
    readonly credentials: "omit";
    readonly cache: "no-store";
    readonly redirect: "error";
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly json: () => Promise<unknown>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (
  document: Record<string, unknown>,
  name: string,
): string => {
  const value = document[name];
  if (typeof value !== "string") throw new PreviewSafetyError("document");
  return value;
};

const rpcUrlsOf = (document: Record<string, unknown>): readonly string[] => {
  const endpoints = document["rpcEndpoints"];
  if (!isRecord(endpoints)) throw new PreviewSafetyError("document");
  return Object.values(endpoints).flatMap(list => {
    if (!Array.isArray(list)) throw new PreviewSafetyError("document");
    return list.map((endpoint: unknown) => {
      if (!isRecord(endpoint)) throw new PreviewSafetyError("document");
      return stringField(endpoint, "url");
    });
  });
};

const originOf = (url: string): string => {
  try {
    const { origin } = new URL(url);
    if (origin !== "null") return origin;
  } catch {
    // Falls through: a value that is not a URL is a malformed document.
  }
  throw new PreviewSafetyError("document");
};

/**
 * The document's fields the suite reads, or a `PreviewSafetyError`; an origin
 * off the allow-list is an `OriginRefusedError` that names the origin only.
 */
export const checkEnvironmentDocument = (
  environment: PreviewEnvironment,
  document: unknown,
): PreviewDocument => {
  if (!isRecord(document)) throw new PreviewSafetyError("document");
  if (document["environment"] !== "preview") {
    throw new PreviewSafetyError("environment");
  }
  const playApiBaseUrl = stringField(document, "playApiBaseUrl");
  const verifyApiBaseUrl = stringField(document, "verifyApiBaseUrl");
  const rpcUrls = rpcUrlsOf(document);
  const gameOrigins = document["gameOrigins"];
  if (!Array.isArray(gameOrigins)) throw new PreviewSafetyError("document");
  for (const url of [playApiBaseUrl, verifyApiBaseUrl, ...rpcUrls]) {
    const origin = originOf(url);
    if (!environment.allowedOrigins.includes(origin)) {
      throw new OriginRefusedError(origin);
    }
  }
  if (!gameOrigins.includes(environment.gameOrigin)) {
    throw new PreviewSafetyError("game-origin");
  }
  return Object.freeze({
    playApiBaseUrl,
    verifyApiBaseUrl,
    gameOrigins: Object.freeze(gameOrigins.map(String)),
    rpcUrls: Object.freeze(rpcUrls),
  });
};

/**
 * Fetches the document from the preview origin, as the Wrapper does, and checks
 * it. `fetchImpl` is injectable for tests; the default is the platform
 * `fetch`.
 */
export const loadPreviewDocument = async (
  environment: PreviewEnvironment,
  fetchImpl: FetchLike = fetch,
): Promise<PreviewDocument> => {
  let body: unknown;
  try {
    const response = await fetchImpl(
      `${environment.origin}${ENVIRONMENT_CONFIG_PATH}`,
      {
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new PreviewSafetyError("fetch");
    body = await response.json();
  } catch (error: unknown) {
    // A network error names the host and may name more: only the check is kept.
    throw error instanceof PreviewSafetyError
      ? error
      : new PreviewSafetyError("fetch");
  }
  return checkEnvironmentDocument(environment, body);
};
