// Fetches and validates the environment configuration document (V-3). It is
// public and served from the page's own origin, so it is fetched without
// credentials and never cached; a response that is not a valid document is the
// configuration-error state, and the page makes no other request. Fetch and
// the timers are injected.

import type { ChainReadClock } from "./chain-read.ts";
import {
  type ConfigIssue,
  validateEnvironmentConfig,
  type VerifyConfig,
} from "./environment-config.ts";

/** Where the document is read from: the same origin as the Wrapper's. */
// PROVISIONAL: who serves the document and its path are open
// (TODO(hosting) in specs/wrapper.md, Configuration).
export const ENVIRONMENT_CONFIG_PATH = "/environment-config.json";

/** W-43: a request times out. */
export const CONFIG_REQUEST_TIMEOUT_MS = 15_000;

export type ConfigLoadResult =
  | { readonly kind: "ok"; readonly config: VerifyConfig }
  | { readonly kind: "invalid"; readonly issues: readonly ConfigIssue[] }
  /** An error status or a body that is not JSON. */
  | { readonly kind: "unreadable" }
  /** No response: offline, DNS, TLS, timeout. */
  | { readonly kind: "network" };

export type ConfigLoadOptions = {
  readonly fetch: typeof fetch;
  readonly clock: ChainReadClock;
  readonly url: string;
  /** The page's own origin (the disjoint-origins rule). */
  readonly ownOrigin: string;
};

/** Loads the document once. Never throws. */
export const loadEnvironmentConfig = async (
  options: ConfigLoadOptions,
): Promise<ConfigLoadResult> => {
  const { fetch: request } = options;
  const controller = new AbortController();
  const timer = options.clock.setTimeout(() => {
    controller.abort();
  }, CONFIG_REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      // Called unbound: a `fetch` taken off `window` must not get another `this`.
      response = await request(options.url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      return { kind: "network" };
    }
    if (!response.ok) return { kind: "unreadable" };
    let document: unknown;
    try {
      document = await response.json();
    } catch {
      return controller.signal.aborted
        ? { kind: "network" }
        : { kind: "unreadable" };
    }
    const result = validateEnvironmentConfig(document, options.ownOrigin);
    return result.ok
      ? { kind: "ok", config: result.config }
      : { kind: "invalid", issues: result.issues };
  } finally {
    options.clock.clearTimeout(timer);
  }
};
