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
// (replay-wallet.ts).

import type { Page } from "@playwright/test";

import {
  roundEnvironmentConfig,
  serveEnvironmentConfig,
} from "./environment-config.ts";
import { FAKE_NOW, SIGNER_ORIGIN } from "./origins.ts";
import { delegationVector, replayWallet } from "./replay-wallet.ts";
import { advanceUntil, expect, test as roundTest } from "./round-play.ts";
import { ROUND_PINS } from "./round-vector.ts";
import { serveSigningPage } from "./signing-page.ts";
import { TEXT } from "./wrapper-page.ts";

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
      await use(null);
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
  await signing.getByRole("button", { name: DELEGATION_TEXT.wallet }).click();
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
