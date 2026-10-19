// T-14 (AC5, W-45 to W-48): a round played with the keyboard only (a visible
// focus indicator on every control reached, and no keyboard trap: Tab leaves
// the game frame for the Wrapper's controls); after a move in the game, by
// keyboard or pointer, the focus is on the Wrapper's result heading, and stays
// there once the game has shown the result too, with nothing in the game
// focused (the Wrapper blurs the focused frame element first, which
// Playwright's Firefox needs: focus-from-frame.spec.ts); and the accessibility
// audit of every status and error state. Audited here: the states a round
// passes through on its way (idle, starting, the round ready with the game
// frame, and resolving), the configuration error, and the browser without Web
// Locks (W-14, W-44).
// Each other state is audited where its own row produces it:
// - won: t10-win; lost: t11-loss;
// - the typed errors, `ROUND_ACTIVE`, the session ended at open, a failed
//   verification at open, and the not-independent indicator: t16-typed-errors;
// - out of sync, the session ended in a round, and a rejected Snapshot:
//   t16-round-errors;
// - the connection problem while a move is signed: t15-signed-action;
// - a move not confirmed (W-16): t15-unconfirmed;
// - a failed verification and "could not verify the chain" while the cancel
//   settles, canceled, round ended, and still resolving: t19-cancel-paths;
// - another tab: t17-two-tabs.
// The Wrapper's timers run on the page's clock (round-play.ts).

import type { Locator, Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import { serveEnvironmentConfig } from "./harness/environment-config.ts";
import {
  advanceUntil,
  callTails,
  expect,
  gameFrame,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck, ROUND_VECTOR, startCheck } from "./harness/round-vector.ts";
import {
  alertPanel,
  launch,
  scriptStartingRound,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** The most Tab presses a control may take to reach. */
const MAX_TABS = 30;

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

/**
 * After the player's own move, the focus is the Wrapper's result heading
 * (W-46), and still is once the game has shown the same result: the game
 * yields, moving focus only while its own document has focus, so its own
 * heading never takes it and its document has none.
 */
const focusStaysOnResult = async (page: Page): Promise<void> => {
  const heading = statusHeading(page);
  await expect(heading).toHaveText(TEXT.won);
  await expect(heading).toBeFocused();
  const gameHeading = gameFrame(page).locator("#rg-heading");
  await expect(gameHeading).toHaveText("You won");
  await expect(gameHeading).not.toBeFocused();
  // Nothing in the game has the focus: it did not keep it, or pull it back.
  expect(await gameHeading.evaluate(() => document.hasFocus())).toBe(false);
  await expect(heading).toBeFocused();
};

/** The focused control shows a focus indicator: an outline of some width. */
const showsFocus = (target: Locator): Promise<boolean> =>
  target.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });

test.describe("T-14: keyboard-only play", () => {
  test("a round is played with the keyboard alone, with a visible focus and no trap", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-idle"));
    await launch(page, fakePlayApi);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    const start = page.getByRole("button", { name: TEXT.start });
    await expect(start).toBeVisible();
    await tabTo(page, start);
    expect(await showsFocus(start)).toBe(true);
    // `scriptRound`'s answers: the start, then the round on every read.
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer("coinflip-starting", startCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(ROUND_VECTOR));
    await page.keyboard.press("Enter");
    await advanceUntil(page, () => page.locator("iframe").isVisible());
    const tails = gameFrame(page).getByRole("button", { name: "Tails" });
    await tabTo(page, tails);
    expect(await showsFocus(tails)).toBe(true);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won",
      expect: pickCheck,
    });
    await page.keyboard.press("Space");
    await focusStaysOnResult(page);
    // No keyboard trap: Tab reaches the Wrapper's own controls.
    const newRound = page.getByRole("button", { name: TEXT.newRound });
    await tabTo(page, newRound);
    expect(await showsFocus(newRound)).toBe(true);
  });
});

test.describe("T-14: the focus after a move in the game (W-46)", () => {
  test("a pointer move: the focus is the Wrapper's result heading, and stays", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won",
      expect: pickCheck,
    });
    await callTails(page);
    await focusStaysOnResult(page);
  });
});

test.describe("T-14: the audit of a round's states", () => {
  test("idle", async ({ page, fakePlayApi }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("starting", async ({ page, fakePlayApi }) => {
    scriptStartingRound(fakePlayApi);
    await launch(page, fakePlayApi);
    await page.getByRole("button", { name: TEXT.start }).click();
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the round ready, with the game frame", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    await expect(
      gameFrame(page).getByRole("button", { name: "Tails" }),
    ).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("resolving, after the move", async ({ page, fakePlayApi }) => {
    await toReady(page, fakePlayApi);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-resolving",
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.resolving);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the configuration error", async ({ page, context, fakePlayApi }) => {
    // A document the Wrapper refuses, served over the round's (W-44).
    await serveEnvironmentConfig(context, { environment: "nowhere" });
    await launch(page, fakePlayApi);
    await expect(alertPanel(page)).toContainText(TEXT.configuration);
    // Refused before any session: nothing reached the Play API.
    expect(fakePlayApi.served).toHaveLength(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a browser without Web Locks", async ({ page, fakePlayApi }) => {
    // The page has no Web Locks API: `navigator.locks` is gone.
    await page.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, "locks");
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.unsupported);
    // No lock, no session: nothing is read, started, or signed (W-14).
    expect(servedFor(fakePlayApi, "getSnapshot")).toHaveLength(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
