// T-50's delegated round (S6b): the round tests' harness (round-play.ts: the
// scripted key, the round's pins, the fake RPC endpoints) with the wallet
// delegation on. The key-delegation vector was signed for the same action key
// as the vendored round (anvil account 3, the round harness's scripted key), so
// the fake's redeem answers the vector's session id and hard end
// (`redeemAs`), and the browser's clock is installed before the page loads at
// the fake's time, before the vector's expiry (1795000000, already past in real
// time), so the session is still open and the expiry still ahead. The
// configuration names the signing page and accepts the vendored `pending`
// notice; the signing page is served from the release's `signer/` at its own
// origin (signing-page.ts), and the replay wallet is announced there
// (replay-wallet.ts). The Wrapper's page is served with the release's `/*`
// `Cross-Origin-Opener-Policy` (`same-origin-allow-popups`), as the deploy
// serves it on a top-level launch, so the signing window is opened and kept
// under it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

import {
  roundEnvironmentConfig,
  serveEnvironmentConfig,
} from "./environment-config.ts";
import {
  FAKE_NOW,
  SIGNER_ORIGIN,
  WRAPPER_DIST,
  WRAPPER_ORIGIN,
} from "./origins.ts";
import { delegationVector, replayWallet } from "./replay-wallet.ts";
import { advanceUntil, expect, test as roundTest } from "./round-play.ts";
import { ROUND_PINS } from "./round-vector.ts";
import { serveSigningPage } from "./signing-page.ts";
import { TEXT } from "./wrapper-page.ts";

/**
 * Serves the Wrapper's page with the `/*` rule's opener policy of the release's
 * `headers.json`, as built; returns how often it was served.
 */
const serveWrapperWithOpenerPolicy = async (
  context: BrowserContext,
): Promise<() => number> => {
  const file = JSON.parse(
    readFileSync(join(WRAPPER_DIST, "headers.json"), "utf8"),
  ) as Record<string, Readonly<Record<string, string>> | undefined>;
  const policy = file["/*"]?.["Cross-Origin-Opener-Policy"];
  if (policy === undefined) {
    throw new Error("headers.json /* has no Cross-Origin-Opener-Policy");
  }
  const body = readFileSync(join(WRAPPER_DIST, "index.html"));
  let served = 0;
  await context.route(
    url => url.origin === WRAPPER_ORIGIN && url.pathname === "/",
    async route => {
      served += 1;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cross-origin-opener-policy": policy,
        },
        body,
      });
    },
  );
  return () => served;
};

export const DELEGATION_TEXT = {
  link: "Link a wallet",
  heading: "Link a wallet to this session",
  confirm: "Open the signing window",
  linked:
    "Wallet linked. Every round you start in this session carries the link.",
  linkedLine: "Wallet linked for this session",
  signerHeading: "Link a wallet to your game session",
  wallet: "Replay Wallet",
} as const;

type DelegationFixtures = { readonly delegation: null };

export const test = roundTest.extend<DelegationFixtures>({
  // Before the vector's expiry, at the fake's time (see the header).
  // An override keeps the round harness's registration (automatic).
  pageClock: async ({ page }, use) => {
    await page.clock.install({ time: FAKE_NOW });
    await use(page.clock);
  },

  // After `fakeRpc`, so this configuration is the one served.
  delegation: [
    async ({ context, fakePlayApi, fakeRpc: _rpc, playApiBaseUrl }, use) => {
      const vector = delegationVector();
      fakePlayApi.redeemAs({
        sessionId: vector.sessionId,
        sessionExpiresAt: new Date(vector.expiry * 1000).toISOString(),
      });
      await serveEnvironmentConfig(context, {
        ...roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
        signingPageOrigin: SIGNER_ORIGIN,
        acceptPendingNotices: true,
      });
      await serveSigningPage(context);
      await replayWallet(context);
      const served = await serveWrapperWithOpenerPolicy(context);
      await use(null);
      // Every T-50 signed case launches the Wrapper, so each ran under it.
      expect(served()).toBeGreaterThan(0);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the consent dialog from the bar's menu. */
export const openConsent = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: TEXT.menu }).click();
  await page.getByRole("button", { name: DELEGATION_TEXT.link }).click();
  await expect(
    page.getByRole("dialog", { name: DELEGATION_TEXT.heading }),
  ).toBeVisible();
};

/** Confirms the dialog and returns the signing window, at its wallet list. */
export const openSigningWindow = async (page: Page): Promise<Page> => {
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("dialog", { name: DELEGATION_TEXT.heading })
    .getByRole("button", { name: DELEGATION_TEXT.confirm })
    .click();
  const signing = await opened;
  // The page's 1 s of looking for a wallet, run on the installed clock.
  const listed = signing.getByRole("heading", {
    name: DELEGATION_TEXT.signerHeading,
  });
  await advanceUntil(page, () => listed.isVisible());
  return signing;
};

/** Picks the replay wallet; the Wrapper then says the wallet is linked. */
export const signInWindow = async (
  page: Page,
  signing: Page,
): Promise<void> => {
  // The replay wallet answers at once, so the click's own effect can close the window (SP-9).
  await signing
    .getByRole("button", { name: DELEGATION_TEXT.wallet })
    .click()
    .catch((error: unknown) => {
      if (!signing.isClosed()) throw error;
    });
  await expect(page.getByText(DELEGATION_TEXT.linked)).toBeVisible();
};

/** The start body's `keyDelegation` the vector gives, as the shell sends it. */
export const vectorKeyDelegation = () => {
  const vector = delegationVector();
  return {
    wallet: vector.wallet,
    expiry: vector.expiry,
    noticeHash: vector.noticeHash,
    signature: vector.signature,
  };
};
