// The checks and small helpers of the request layer (internal).

import type { AbortControllerLike } from "./platform.ts";

const PATH = /^(?:\/[A-Za-z0-9._~\-:@!$&'()*+,;=%]+)+\/?$/u;
const HTTPS_BASE = /^https:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/u;
const LOOPBACK_HTTP_BASE =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/[^\s?#]*)?$/u;

/**
 * Checks the Play API base and returns it without a trailing slash: `https:`,
 * or `http:` on a loopback host only (`localhost`, `127.0.0.1`, `[::1]`); no
 * credentials, query string, or fragment.
 */
export const checkBaseUrl = (baseUrl: string): string => {
  if (!HTTPS_BASE.test(baseUrl) && !LOOPBACK_HTTP_BASE.test(baseUrl)) {
    throw new TypeError(
      "the Play API base is an https URL (http only on a loopback host), with no credentials, query string, or fragment",
    );
  }
  return baseUrl.replace(/\/+$/u, "");
};

/** A path is absolute below the base, with no query string or fragment. */
export const assertPath = (path: string): void => {
  if (
    !PATH.test(path) ||
    path.split("/").some(segment => segment === "." || segment === "..")
  ) {
    throw new TypeError(
      "a Play API path is absolute, with no query string or fragment",
    );
  }
};

/** A refresh names the old token's deadline (W-7). */
export const assertDeadline = (request: {
  readonly retry: string;
  readonly notAfterMs?: number;
}): void => {
  if (request.retry === "refresh" && !Number.isFinite(request.notAfterMs)) {
    throw new TypeError("a refresh must name the old token's deadline");
  }
};

type GlobalWithAbort = {
  readonly AbortController?: new () => AbortControllerLike;
};

/** The platform `AbortController`, when there is one. */
export const platformAbortController = (): AbortControllerLike | undefined => {
  const { AbortController } = globalThis as GlobalWithAbort;
  return AbortController === undefined ? undefined : new AbortController();
};

/** Parses a body; an empty body is `undefined`. */
export const parseJson = (
  text: string,
): { readonly ok: boolean; readonly value: unknown } => {
  if (text === "") {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, value: undefined };
  }
};
