// T-50, the signing page's states (S6b; SP-4 to SP-13), and T-49's browser
// half: the release's `signer/` served at its own origin under the `/signer/*`
// rule's headers of `headers.json`, opened from a click by a stand-in for the
// Wrapper (harness/signer-opener.ts), with the replay wallet. Each state shows
// its text and passes the axe audit: the lost connection (opened by hand), the
// configuration error, waiting for the game, timed out (no request within
// 10 s), choosing a wallet, waiting for the wallet, and finishing. Looking for
// a wallet lasts the page's own 1 s, too short for an audit, so its text is
// checked and its view (a heading in the live region, as the audited waiting
// and finishing states) is not audited apart. The context's clock is installed
// and run forward, so the page's 10 s and 1 s pass at once, never in real
// time. Once it has answered, the page
// closes its own window (SP-9); the states that never answer leave it open,
// so the wallet's calls are read while the page is still held. With a
// `Cross-Origin-Opener-Policy` header, which the release build refuses
// (T-49), the window opens without its opener and does nothing (Chromium and
// Firefox; Playwright's WebKit keeps the opener, so the case is skipped there).

import type { BrowserContext, Page, Response } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import { expect, test } from "./harness/fixtures.ts";
import { FAKE_NOW, PAGES_ORIGIN, SIGNER_ORIGIN } from "./harness/origins.ts";
import {
  delegationVector,
  replayWallet,
  type WalletHold,
} from "./harness/replay-wallet.ts";
import {
  openFromStandIn,
  receivedBy,
  sendFrom,
  vectorRequest,
} from "./harness/signer-opener.ts";
import {
  serveSigningPage,
  signerDocument,
  signerHeaders,
} from "./harness/signing-page.ts";

const TEXT = {
  lost: "This window lost its connection to the game. Close it.",
  configError:
    "This page could not load its settings. Close this window and try again from the game.",
  waiting: `Connecting to the game\u2026`,
  timedOut: "Close this window and try again from the game.",
  discovering: `Looking for your browser wallet\u2026`,
  choose: "Link a wallet to your game session",
  confirm: `Confirm in your wallet\u2026`,
  finishing: `Finishing\u2026`,
} as const;
const READY = { schema: "se.delegation/1", type: "ready" };
const WALLET = "Replay Wallet";

/** The stand-in at `PAGES_ORIGIN` is the Wrapper the page serves. */
const STAND_IN = signerDocument({ wrapperOrigins: [PAGES_ORIGIN] });

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

const expectAudited = async (page: Page): Promise<void> => {
  expect(await auditAccessibility(page)).toEqual([]);
};

/** The methods the replay wallet was asked, in order. */
const walletCalls = (signing: Page): Promise<readonly string[]> =>
  signing.evaluate(() =>
    (
      (globalThis as { seWalletCalls?: readonly { method: string }[] })
        .seWalletCalls ?? []
    ).map(call => call.method),
  );

/** The page's own waits (SP-6, SP-8), run on the installed clock. */
const REQUEST_WAIT_MS = 10_000;
const DISCOVERY_WAIT_MS = 1000;

/** Runs the clock until the window's heading reads `text`. */
const runUntilHeading = async (
  context: BrowserContext,
  signing: Page,
  text: string,
): Promise<void> => {
  await expect
    .poll(async () => {
      await context.clock.runFor(DISCOVERY_WAIT_MS / 2);
      return heading(signing).textContent();
    })
    .toBe(text);
};

/** The window asked by the stand-in, at the wallet list. */
const atWalletList = async (
  page: Page,
  context: BrowserContext,
  hold: WalletHold,
) => {
  await serveSigningPage(context, { document: STAND_IN });
  await replayWallet(context, hold);
  const signing = await openFromStandIn(page);
  await expect(heading(signing)).toHaveText(TEXT.waiting);
  await sendFrom(page, vectorRequest());
  await runUntilHeading(context, signing, TEXT.choose);
  return signing;
};

test.describe("T-50: the signing page's states (S6b)", () => {
  // Every page of the context, the signing window included, on one clock that
  // the tests run forward: no test waits for the page's 10 s or 1 s in real
  // time. Before the vector's expiry (FAKE_NOW).
  test.beforeEach(async ({ context }) => {
    await context.clock.install({ time: FAKE_NOW });
  });

  test("opened by hand: the lost connection, no configuration read", async ({
    page,
    context,
  }) => {
    await serveSigningPage(context, { document: STAND_IN });
    const requested: string[] = [];
    page.on("request", request => requested.push(request.url()));
    const response = await page.goto(`${SIGNER_ORIGIN}/`);
    expect(response).not.toBeNull();
    const headers = await (response as Response).allHeaders();
    expect(headers["content-security-policy"]).toBe(
      signerHeaders()["Content-Security-Policy"],
    );
    expect(headers["content-security-policy"]).not.toContain("img-src");
    expect(headers["cross-origin-opener-policy"]).toBeUndefined();
    await expect(heading(page)).toHaveText(TEXT.lost);
    await expect(heading(page)).toBeFocused();
    expect(
      requested.filter(url => url.endsWith("/environment-config.json")),
    ).toEqual([]);
    await expectAudited(page);
  });

  test("a configuration that is not JSON: its error state, and no ready", async ({
    page,
    context,
  }) => {
    await serveSigningPage(context, { document: "{" });
    const signing = await openFromStandIn(page);
    await expect(heading(signing)).toHaveText(TEXT.configError);
    expect(await receivedBy(page)).toEqual([]);
    await expectAudited(signing);
  });

  test("waiting for the game, then timed out after 10 s", async ({
    page,
    context,
  }) => {
    await serveSigningPage(context, { document: STAND_IN });
    const signing = await openFromStandIn(page);
    await expect(heading(signing)).toHaveText(TEXT.waiting);
    expect(await receivedBy(page)).toEqual([
      { data: READY, origin: SIGNER_ORIGIN },
    ]);
    await expectAudited(signing);
    await context.clock.runFor(REQUEST_WAIT_MS);
    await expect(heading(signing)).toHaveText(TEXT.timedOut);
    await expectAudited(signing);
    await sendFrom(page, vectorRequest());
    await expect(heading(signing)).toHaveText(TEXT.timedOut);
    expect(await receivedBy(page)).toHaveLength(1);
  });

  test("no wallet within 1 s: no-wallet, after looking for one", async ({
    page,
    context,
  }) => {
    await serveSigningPage(context, { document: STAND_IN });
    const signing = await openFromStandIn(page);
    await expect(heading(signing)).toHaveText(TEXT.waiting);
    const closed = signing.waitForEvent("close");
    await sendFrom(page, vectorRequest());
    await expect(heading(signing)).toHaveText(TEXT.discovering);
    await context.clock.runFor(DISCOVERY_WAIT_MS);
    await expect
      .poll(() => receivedBy(page))
      .toEqual([
        { data: READY, origin: SIGNER_ORIGIN },
        {
          data: {
            schema: "se.delegation/1",
            type: "failed",
            reason: "no-wallet",
          },
          origin: SIGNER_ORIGIN,
        },
      ]);
    await closed;
    expect(signing.isClosed()).toBe(true);
  });

  test("choosing, then waiting for the wallet: audited, every button disabled", async ({
    page,
    context,
  }) => {
    const signing = await atWalletList(page, context, "signature");
    await expect(heading(signing)).toBeFocused();
    await expect(
      signing.getByText("Pending legal review", { exact: true }),
    ).toBeVisible();
    await expect(
      signing.getByText(/^This link lasts until .+\.$/u),
    ).toBeVisible();
    await expectAudited(signing);
    await signing.getByRole("button", { name: WALLET }).click();
    await expect(signing.getByText(TEXT.confirm)).toBeVisible();
    await expect(signing.getByRole("button", { name: WALLET })).toBeDisabled();
    await expectAudited(signing);
    expect(await walletCalls(signing)).toEqual([
      "eth_requestAccounts",
      "eth_signTypedData_v4",
    ]);
    const closed = signing.waitForEvent("close");
    await signing.evaluate(() => {
      (globalThis as { seReleaseWallet?: () => void }).seReleaseWallet?.();
    });
    const vector = delegationVector();
    await expect
      .poll(async () => (await receivedBy(page)).at(-1)?.data)
      .toEqual({
        schema: "se.delegation/1",
        type: "result",
        wallet: vector.wallet.toLowerCase(),
        signature: vector.signature,
      });
    await closed;
    expect(signing.isClosed()).toBe(true);
  });

  test("finishing while the wallet forgets the connection: audited, then the answer, then the window closed", async ({
    page,
    context,
  }) => {
    const signing = await atWalletList(page, context, "revoke");
    await signing.getByRole("button", { name: WALLET }).click();
    await expect(heading(signing)).toHaveText(TEXT.finishing);
    expect(await receivedBy(page)).toHaveLength(1);
    expect(await walletCalls(signing)).toEqual([
      "eth_requestAccounts",
      "eth_signTypedData_v4",
      "wallet_revokePermissions",
    ]);
    await expectAudited(signing);
    const closed = signing.waitForEvent("close");
    await signing.evaluate(() => {
      (globalThis as { seReleaseWallet?: () => void }).seReleaseWallet?.();
    });
    await expect.poll(async () => (await receivedBy(page)).length).toBe(2);
    await closed;
    expect(signing.isClosed()).toBe(true);
  });

  test("T-49: a Cross-Origin-Opener-Policy header cuts the opener", async ({
    page,
    context,
    browserName,
  }) => {
    // Recorded per engine: Playwright's WebKit keeps the opener of a window
    // whose routed response carries this header (seen 2026-11-21), so the
    // header's effect is shown in Chromium and Firefox.
    test.skip(
      browserName === "webkit",
      "Playwright's WebKit keeps the opener under a routed COOP header",
    );
    await serveSigningPage(context, {
      document: STAND_IN,
      extraHeaders: { "Cross-Origin-Opener-Policy": "same-origin" },
    });
    const signing = await openFromStandIn(page);
    await expect(heading(signing)).toHaveText(TEXT.lost);
    expect(await receivedBy(page)).toEqual([]);
  });
});
