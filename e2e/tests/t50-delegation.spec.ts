// T-50, the Wrapper's half (slice S6; W-62 to W-66, W-69, W-70): the wallet
// delegation in a browser, on the release bundle, against the fake Play API,
// with a preview configuration that names a signing page and accepts the
// vendored `pending` notice. The menu offers "Link a wallet" on a desktop
// browser; the consent dialog is a modal dialog that passes the audit, takes
// the focus on its heading, shows the vendored notice's exact text marked
// "Pending legal review", and gives the focus back to the menu on Escape; the
// confirm calls `window.open` under the click's user activation with exactly
// the signing page's origin plus `/`, `_blank`, and the features; a blocked
// window (`window.open` stubbed to `null`) is told as "could not connect",
// leaves the entry offered, and the next start carries no `keyDelegation`.
//
// The rest of T-50 runs with the signing page (slice S6b) served from the
// release's `signer/` at its own origin, with the replay wallet:
// `t50-signing-page.spec.ts` (the page's states and their audit, from a
// stand-in opener, and T-49's browser half, a COOP header cutting the opener)
// and `t50-delegation-signed.spec.ts` (the wallet's signature, "Wallet linked",
// the next start carrying the vector's `keyDelegation`, the round's
// `proofs.keyDelegation` passing and missing, a window closed before the
// signature, the 422 `KEY_DELEGATION_INVALID` with "Sign again" and "Continue
// without", T-13's scan, and the window closed once the answer arrives: the
// page closes itself after dropping its opener, SP-9).

import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import type { Locator, Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  environmentConfig,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import { expect, test } from "./harness/fixtures.ts";
import { SIGNER_ORIGIN } from "./harness/origins.ts";
import {
  alertPanel,
  launch,
  scriptStartingRound,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

const LINK = "Link a wallet";
const HEADING = "Link a wallet to this session";
const CONFIRM = "Open the signing window";
const COULD_NOT_CONNECT =
  "The signing window could not connect. Close it if it opened.";

/** The vendored list's one notice, `pending` (W-63). */
const vendoredNotice = (): string => {
  const list = keyDelegationNotices as {
    readonly notices: readonly { readonly text: string }[];
  };
  const [notice] = list.notices;
  if (notice === undefined) throw new Error("no vendored notice");
  return notice.text;
};

/** A stub of `window.open` that records each call and answers `null`. */
const stubWindowOpen = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    Object.defineProperty(globalThis, "seOpens", { value: calls });
    globalThis.open = (url, target, features) => {
      calls.push({
        url: String(url),
        target,
        features,
        // The click's transient activation, as a popup blocker reads it.
        active: navigator.userActivation.isActive,
      });
      return null;
    };
  });
};

const opensOf = (page: Page): Promise<unknown> =>
  page.evaluate(() => (globalThis as { seOpens?: unknown }).seOpens);

const openDialog = async (page: Page) => {
  await page.getByRole("button", { name: TEXT.menu }).click();
  await page.getByRole("button", { name: LINK }).click();
  const dialog = page.getByRole("dialog", { name: HEADING });
  await expect(dialog).toBeVisible();
  return dialog;
};

/** The most Tab presses a control may take to reach. */
const MAX_TABS = 10;

/** Presses Tab until `target` has the focus. */
const tabTo = async (page: Page, target: Locator): Promise<void> => {
  for (let press = 0; press < MAX_TABS; press += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one key press at a time
    if (await target.evaluate(element => element === document.activeElement)) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- one key press at a time
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
};

test.beforeEach(async ({ context, playApiBaseUrl }) => {
  await serveEnvironmentConfig(context, {
    ...environmentConfig(playApiBaseUrl),
    signingPageOrigin: SIGNER_ORIGIN,
    acceptPendingNotices: true,
  });
});

test.describe("T-50: the wallet delegation, the Wrapper's half (S6)", () => {
  test("the consent dialog: modal, focused, the exact notice, and the audit", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    const dialog = await openDialog(page);
    await expect(dialog.getByRole("heading", { name: HEADING })).toBeFocused();
    expect(await dialog.evaluate(element => element.matches(":modal"))).toBe(
      true,
    );
    await expect(dialog).toContainText("Pending legal review");
    await expect(dialog.locator(".se-dialog__notice")).toHaveText(
      vendoredNotice(),
      { useInnerText: false },
    );
    await expect(dialog.getByRole("button", { name: CONFIRM })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Not now" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: TEXT.menu })).toBeFocused();
  });

  test("at 320 CSS pixels (400 % of 1280) the dialog scrolls, and both controls are reached by keyboard", async ({
    page,
    fakePlayApi,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    const dialog = await openDialog(page);
    expect(
      await dialog.evaluate(
        element => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    // No horizontal scroll: the dialog fits the viewport's width.
    const fit = await dialog.evaluate(element => ({
      left: element.getBoundingClientRect().left,
      overflow: element.getBoundingClientRect().right - window.innerWidth,
    }));
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.overflow).toBeLessThanOrEqual(0);
    const confirm = dialog.getByRole("button", { name: CONFIRM });
    const notNow = dialog.getByRole("button", { name: "Not now" });
    await tabTo(page, confirm);
    await expect(confirm).toBeInViewport();
    await tabTo(page, notNow);
    await expect(notNow).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
  });

  test("a blocked window: opened under the click, told, the entry still offered, the start undelegated", async ({
    page,
    fakePlayApi,
  }) => {
    await stubWindowOpen(page);
    scriptStartingRound(fakePlayApi);
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    const dialog = await openDialog(page);
    await dialog.getByRole("button", { name: CONFIRM }).click();
    await expect(dialog).toBeHidden();
    expect(await opensOf(page)).toEqual([
      {
        url: `${SIGNER_ORIGIN}/`,
        target: "_blank",
        features: "popup,width=480,height=720",
        active: true,
      },
    ]);
    await expect(alertPanel(page)).toContainText(COULD_NOT_CONNECT);
    await expect(alertPanel(page)).toContainText(
      "You can play on without a wallet.",
    );
    await page.getByRole("button", { name: TEXT.menu }).click();
    await expect(page.getByRole("button", { name: LINK })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: TEXT.placeBet }).click();
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    await expect
      .poll(() => servedFor(fakePlayApi, "startRound").length)
      .toBe(1);
    const [start] = servedFor(fakePlayApi, "startRound");
    expect(start?.body).toEqual(expect.any(Object));
    expect(start?.body).not.toHaveProperty("keyDelegation");
  });
});
