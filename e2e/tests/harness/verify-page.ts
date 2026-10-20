// The verify page's harness (VT-5 to VT-8, specs/verify-page.md): the page from
// the Wrapper's release bundle (`apps/wrapper/dist/verify/`, unmodified) at
// `<wrapper origin>/verify/`, with the host's rewrite of `/verify/rounds/*` to
// `verify/index.html` (V-2), the environment configuration the page reads (the
// round tests' pins, with `verifyBaseUrl` the Wrapper's origin plus `/verify`
// and `verifyApiBaseUrl` the fake verify API's, on the same origin as in
// preview), the fake verify API (fake-verify-api.ts), and the fake RPC
// endpoints for check 6 (fake-rpc.ts, the round tests' two providers). Every
// route is a Playwright route; the hermetic guard refuses all other requests,
// so a request that leaves these origins fails the test (VT-8).
//
// The page's own routes do not carry its response headers (`headers.json` is a
// host's file): the policy and SRI rows (VT-8) are not proven here.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

import {
  ROUND_RPC_ENDPOINTS,
  roundEnvironmentConfig,
  serveEnvironmentConfig,
} from "./environment-config.ts";
import { createFakeRpc, type FakeRpc } from "./fake-rpc.ts";
import { createFakeVerifyApi, type FakeVerifyApi } from "./fake-verify-api.ts";
import { expect, test as base } from "./fixtures.ts";
import { WRAPPER_DIST, WRAPPER_ORIGIN } from "./origins.ts";
import { ROUND } from "./round-vector.ts";
import { VERIFY_PINS } from "./verify-rounds.ts";

/** The page's file in the release bundle. */
const VERIFY_INDEX = join(WRAPPER_DIST, "verify", "index.html");

/** The page's base, the Wrapper's origin plus `/verify` (V-1). */
export const VERIFY_BASE_URL = `${WRAPPER_ORIGIN}/verify`;

/**
 * Whether the bundle holds the verify page itself: its `index.html` with the
 * mount point the page's entry looks for.
 */
export const verifyPageBuilt = (): boolean =>
  existsSync(VERIFY_INDEX) &&
  readFileSync(VERIFY_INDEX, "utf8").includes('id="verify-root"');

/** Why the browser rows fail when the bundle holds no page (they never skip). */
export const VERIFY_PAGE_NOT_BUILT =
  "the release bundle holds no verify page: apps/wrapper/dist/verify/index.html with #verify-root is missing (run `pnpm build` first)";

/** The page's URL for `roundId`, or the start page's without one (V-1). */
export const verifyUrl = (roundId?: string): string =>
  roundId === undefined
    ? `${VERIFY_BASE_URL}/`
    : `${VERIFY_BASE_URL}/rounds/${encodeURIComponent(roundId)}`;

/** The configuration document the page reads, for `verifyApiBaseUrl`. */
export const verifyEnvironmentConfig = (
  playApiBaseUrl: string,
  verifyApiBaseUrl: string,
): Readonly<Record<string, unknown>> => ({
  ...roundEnvironmentConfig(playApiBaseUrl, VERIFY_PINS),
  verifyBaseUrl: VERIFY_BASE_URL,
  verifyApiBaseUrl,
});

/**
 * Serves `verify/index.html` for `/verify/` and every path under
 * `/verify/rounds/` (V-2); any other path is the static origin's. Registered
 * after the shared origins, so it takes these paths first.
 */
export const serveVerifyPage = async (
  context: BrowserContext,
): Promise<void> => {
  await context.route(`${WRAPPER_ORIGIN}/verify/**`, async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname !== "/verify/" && !pathname.startsWith("/verify/rounds/")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: existsSync(VERIFY_INDEX) ? readFileSync(VERIFY_INDEX) : "",
    });
  });
};

type VerifyOptions = {
  /** The configuration's `verifyApiBaseUrl`; where the fake verify API is. */
  readonly verifyApiBaseUrl: string;
};

type VerifyFixtures = {
  readonly fakeVerifyApi: FakeVerifyApi;
  /** Check 6's fake RPC endpoints (the round tests' two providers). */
  readonly verifyRpc: FakeRpc;
  /** The page, its rewrite, and its configuration. */
  readonly verifyPage: {
    /** Opens the page at `roundId`'s URL, or the start page without one. */
    readonly open: (page: Page, roundId?: string) => Promise<void>;
  };
};

/**
 * The suite's `test` with the fake verify API. `fakeVerifyApi` serves only the
 * API; `verifyPage` also serves the page, its configuration, and the RPC
 * endpoints.
 */
export const test = base.extend<VerifyOptions & VerifyFixtures>({
  verifyApiBaseUrl: [`${WRAPPER_ORIGIN}/verify/v1`, { option: true }],

  fakeVerifyApi: async (
    { context, hermetic: _guard, verifyApiBaseUrl },
    use,
  ) => {
    const fake = createFakeVerifyApi({ baseUrl: verifyApiBaseUrl });
    await fake.install(context);
    await use(fake);
    expect(fake.unexpected(), "calls the fake verify API did not know").toEqual(
      [],
    );
  },

  verifyRpc: async ({ context, hermetic: _guard }, use) => {
    const rpc = createFakeRpc({
      endpoints: ROUND_RPC_ENDPOINTS,
      chainId: BigInt(VERIFY_PINS.entropyChainId),
      blockNumber: ROUND.blockNumber,
      allowOrigin: WRAPPER_ORIGIN,
    });
    await rpc.install(context);
    await use(rpc);
    expect(rpc.unexpected(), "calls the fake RPC did not know").toEqual([]);
  },

  verifyPage: async (
    {
      context,
      fakeVerifyApi: _api,
      verifyRpc: _rpc,
      playApiBaseUrl,
      verifyApiBaseUrl,
    },
    use,
  ) => {
    await serveEnvironmentConfig(
      context,
      verifyEnvironmentConfig(playApiBaseUrl, verifyApiBaseUrl),
    );
    await serveVerifyPage(context);
    await use({
      open: async (page, roundId) => {
        await page.goto(verifyUrl(roundId));
      },
    });
  },
});

export { expect };
