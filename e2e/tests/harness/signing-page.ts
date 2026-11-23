// The wallet signing page in the browser (T-49's browser half, T-50;
// specs/signing-page.md, SP-13, SP-15): the release's `signer/`
// (`apps/wrapper/dist/signer/`, unmodified) served at its own origin as the
// deploy lays it out: `signer/` at `/signer/`, a copy of its page at the root,
// its configuration document at `/environment-config.json`, and every response
// with the `/signer/*` rule's headers of the release's `headers.json` (the
// deploy writes them on `/*`). The file is read as built, never rewritten.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContext } from "@playwright/test";

import { SIGNER_ORIGIN, WRAPPER_DIST, WRAPPER_ORIGIN } from "./origins.ts";

const SIGNER_DIST = join(WRAPPER_DIST, "signer");
const HEADERS_FILE = join(WRAPPER_DIST, "headers.json");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/** The signing page's configuration document (SP-3) the suite serves. */
export type SignerDocument = Readonly<Record<string, unknown>>;

/** The staging-like document: the Wrapper's origin, `pending` notices allowed. */
export const signerDocument = (
  change: Readonly<Record<string, unknown>> = {},
): SignerDocument => ({
  environment: "preview",
  wrapperOrigins: [WRAPPER_ORIGIN],
  acceptPendingNotices: true,
  ...change,
});

/** The `/signer/*` rule of the release's `headers.json`, as built. */
export const signerHeaders = (): Readonly<Record<string, string>> => {
  const file = JSON.parse(readFileSync(HEADERS_FILE, "utf8")) as Record<
    string,
    Readonly<Record<string, string>> | undefined
  >;
  const rule = file["/signer/*"];
  if (rule === undefined) throw new Error("headers.json has no /signer/* rule");
  return rule;
};

export type ServeSignerOptions = {
  /** The configuration document; a string is served as the body as it is. */
  readonly document?: SignerDocument | string;
  /** Headers added to the rule's (T-49: a COOP header the build refuses). */
  readonly extraHeaders?: Readonly<Record<string, string>>;
};

/** The file under `signer/` a path names, or `undefined`. */
const fileFor = (pathname: string): string | undefined => {
  if (pathname === "/") return join(SIGNER_DIST, "index.html");
  if (!pathname.startsWith("/signer/")) return undefined;
  const relative = pathname.slice("/signer/".length);
  if (relative.includes("..") || relative === "") return undefined;
  return join(SIGNER_DIST, relative);
};

/**
 * Serves the signing page's site at `SIGNER_ORIGIN`. Registered after the
 * hermetic guard, so its requests never reach the catch-all.
 */
export const serveSigningPage = async (
  context: BrowserContext,
  options: ServeSignerOptions = {},
): Promise<void> => {
  const headers = { ...signerHeaders(), ...options.extraHeaders };
  const document = options.document ?? signerDocument();
  await context.route(`${SIGNER_ORIGIN}/**`, async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/environment-config.json") {
      await route.fulfill({
        status: 200,
        headers: { ...headers, "content-type": "application/json" },
        body:
          typeof document === "string" ? document : JSON.stringify(document),
      });
      return;
    }
    const file = fileFor(pathname);
    if (file === undefined || !existsSync(file)) {
      await route.fulfill({ status: 404, headers, body: "not found" });
      return;
    }
    const type = CONTENT_TYPES[file.slice(file.lastIndexOf("."))];
    await route.fulfill({
      status: 200,
      headers: {
        ...headers,
        "content-type": type ?? "application/octet-stream",
      },
      body: readFileSync(file),
    });
  });
};
