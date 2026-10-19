// Fetches and validates the environment configuration document at boot
// (specs/wrapper.md, Configuration). It is public and served from the SE
// origin, so it is fetched without credentials and never cached by the
// browser; a response that is not a valid document refuses the start.

import {
  type EnvironmentConfig,
  type EnvironmentConfigIssue,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import type { Timers } from "./timers.ts";

/**
 * Where the document is read from, relative to the Wrapper's page. PROVISIONAL:
 * who serves the document and its path are still open (TODO(hosting) in
 * specs/wrapper.md, Configuration); this one constant changes when they are
 * decided.
 */
export const ENVIRONMENT_CONFIG_PATH = "./environment-config.json";

/** W-43: a request times out (SHOULD: 15 s, Wrapper configuration). */
export const CONFIG_REQUEST_TIMEOUT_MS = 15_000;

/** The part of `fetch` the loader uses. */
export type ConfigFetch = (
  url: string,
  init: {
    readonly method: "GET";
    readonly credentials: "omit";
    readonly cache: "no-store";
    readonly redirect: "error";
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
}>;

export type ConfigLoadResult =
  | { readonly kind: "ok"; readonly config: EnvironmentConfig }
  /** The document was read and refused: the configuration-error state. */
  | {
      readonly kind: "invalid";
      readonly issues: readonly EnvironmentConfigIssue[];
    }
  /** An error status or a body that is not JSON: the configuration-error state. */
  | { readonly kind: "unreadable"; readonly status?: number }
  /** No response (offline, DNS, TLS, timeout): the connection-problem state. */
  | { readonly kind: "network" };

export type ConfigLoadOptions = {
  readonly fetch: ConfigFetch;
  readonly url: string;
  /** The Wrapper's own origin, the SE origin (the disjoint-origins rule). */
  readonly ownOrigin: string;
  readonly timers: Timers;
  readonly timeoutMs?: number;
};

/** Loads the document once. Never throws. */
export const loadEnvironmentConfig = async (
  options: ConfigLoadOptions,
): Promise<ConfigLoadResult> => {
  const controller = new AbortController();
  const timer = options.timers.setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? CONFIG_REQUEST_TIMEOUT_MS);
  try {
    let response: Awaited<ReturnType<ConfigFetch>>;
    try {
      response = await options.fetch(options.url, {
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
    if (!response.ok) {
      return { kind: "unreadable", status: response.status };
    }
    let document: unknown;
    try {
      document = await response.json();
    } catch {
      return controller.signal.aborted
        ? { kind: "network" }
        : { kind: "unreadable", status: response.status };
    }
    const result = validateEnvironmentConfig(document, options.ownOrigin);
    return result.ok
      ? { kind: "ok", config: result.config }
      : { kind: "invalid", issues: result.issues };
  } finally {
    options.timers.clearTimeout(timer);
  }
};
