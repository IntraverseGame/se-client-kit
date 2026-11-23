// Fetches and validates the page's configuration document (specs/signing-
// page.md, SP-3): `/environment-config.json` at its own origin's root, once, at
// load, with `credentials: "omit"`, `cache: "no-store"`, `redirect: "error"`,
// and an 8 s timeout on the page's clock, below the Wrapper's 10 s wait for
// `ready`. It is the page's only request. A document that cannot be fetched,
// is not JSON, or is refused is the configuration error state. Fetch and the
// clock are injected.

import type { PageClock } from "./clock.ts";
import {
  type SignerConfig,
  validateSignerConfig,
} from "./environment-config.ts";

/** Where the document is read from, at the page's own origin's root. */
export const CONFIG_PATH = "/environment-config.json";

/** SP-3: the configuration's own timeout, below the Wrapper's 10 s. */
export const CONFIG_TIMEOUT_MS = 8000;

export type ConfigLoadOptions = {
  readonly fetch: typeof fetch;
  readonly clock: PageClock;
  /** The page's own origin (`location.origin`). */
  readonly ownOrigin: string;
};

/** The valid document, or `undefined` for any failure. Never throws. */
export const loadSignerConfig = async (
  options: ConfigLoadOptions,
): Promise<SignerConfig | undefined> => {
  const { fetch: request, clock, ownOrigin } = options;
  const controller = new AbortController();
  const timer = clock.setTimeout(() => {
    controller.abort();
  }, CONFIG_TIMEOUT_MS);
  try {
    const response = await request(`${ownOrigin}${CONFIG_PATH}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const document: unknown = await response.json();
    const result = validateSignerConfig(document, ownOrigin);
    return result.ok ? result.config : undefined;
  } catch {
    // Offline, a redirect, the timeout, or a body that is not JSON.
    return undefined;
  } finally {
    clock.clearTimeout(timer);
  }
};
