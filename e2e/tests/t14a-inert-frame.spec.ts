// T-14a and T-27 (W-46, W-58): the game frame's input, in every browser
// project. `inert` on the game's iframe element also blocks the player's input
// to the frame's document, a document on another site (W-37): with the round
// ready, a click on the game's control and the Tab key reach nothing while the
// frame is inert, and reach the game once it is not. The frame takes the focus
// once when the round the player started becomes ready, from the status
// heading the removed start control left it on, whether that round was started
// from `idle` or from a result.

import type { Locator, Page } from "@playwright/test";

import {
  advanceUntil,
  expect,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck, ROUND_VECTOR, startCheck } from "./harness/round-vector.ts";
import {
  isPlayable,
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** Sets or removes `inert` on the game's iframe element, as W-58 does. */
const setInert = (page: Page, inert: boolean): Promise<void> =>
  page.evaluate(on => {
    document.querySelector("iframe")?.toggleAttribute("inert", on);
  }, inert);

/** The centre of `control`, in the Wrapper page's coordinates. */
const centreOf = async (
  control: Locator,
): Promise<readonly [number, number]> => {
  const box = (await control.boundingBox()) ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  return [box.x + box.width / 2, box.y + box.height / 2];
};

/** Whether hit testing at `point` finds the game's iframe element. */
const hitsFrame = (
  page: Page,
  point: readonly [number, number],
): Promise<boolean> =>
  page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y) instanceof HTMLIFrameElement,
    point,
  );

/** The tag of the element that holds the focus in the Wrapper's page. */
const focusedTag = (page: Page): Promise<string> =>
  page.evaluate(() => document.activeElement?.tagName ?? "");

test.describe("T-14a: the inert game frame (W-58)", () => {
  test("the frame takes the focus once when the round the player started is ready", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    await expect.poll(() => focusedTag(page)).toBe("IFRAME");
  });

  test("the frame takes the focus once when the round started from a result is ready", async ({
    page,
    fakePlayApi,
  }) => {
    // The page opens on a result the shell does not hold; the started round is
    // later than it, so the Wrapper shows it (W-29).
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-lost"));
    fakePlayApi.answer("startRound", {
      kind: "snapshot-version",
      vector: "coinflip-starting",
      version: 5,
      expect: startCheck,
    });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot-version",
      vector: ROUND_VECTOR,
      version: 6,
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.lost);
    await page.getByRole("button", { name: TEXT.playAgain }).click();
    await advanceUntil(page, () => isPlayable(page));
    await expect.poll(() => focusedTag(page)).toBe("IFRAME");
    // Once: a later update leaves a focus moved elsewhere alone. An `active`
    // round is not polled (W-35), so the update is the connectivity's, which
    // the event runs before `evaluate` returns.
    await statusHeading(page).focus();
    await page.evaluate(() => globalThis.dispatchEvent(new Event("online")));
    expect(await focusedTag(page)).not.toBe("IFRAME");
  });

  test("inert blocks a click and the Tab key into the frame's document; playable lets them in", async ({
    page,
    fakePlayApi,
  }) => {
    const game = await toReady(page, fakePlayApi);
    const tails = game.getByRole("button", { name: "Tails" });
    await expect(tails).toBeVisible();
    const [x, y] = await centreOf(tails);
    expect(await hitsFrame(page, [x, y])).toBe(true);

    await setInert(page, true);
    // The browser takes the inert frame out of hit testing: the click reaches
    // nothing in the game, whose control takes no focus.
    expect(await hitsFrame(page, [x, y])).toBe(false);
    await page.mouse.click(x, y);
    await expect(tails).not.toBeFocused();
    // No tab stop in an inert frame: Tab from the status heading never enters.
    await statusHeading(page).focus();
    for (let step = 0; step < 12; step += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one key at a time, in order
      await page.keyboard.press("Tab");
      // oxlint-disable-next-line no-await-in-loop -- read after each key
      expect(await focusedTag(page)).not.toBe("IFRAME");
    }
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(0);

    // The control: the same click on the playable frame plays the move.
    await setInert(page, false);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won-payout",
      expect: pickCheck,
    });
    await page.mouse.click(x, y);
    await expect(statusHeading(page)).toHaveText(TEXT.won);
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
  });
});
