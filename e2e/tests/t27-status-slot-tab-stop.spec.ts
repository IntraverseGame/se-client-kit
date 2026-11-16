// T-27 and T-34 (W-57 "Overflow stays in the bar", RFC-005): the status slot
// is a tab stop exactly while its text overflows, with no change of the bar's
// height, in the real layout of every browser project. In a box of 320 CSS
// pixels, the narrowest the Wrapper supports, a loss's one-row result (its
// heading and the round receipt) fits: no tab stop. At three times the text
// size the receipt alone (a chip that never wraps) is wider than the slot, so
// it overflows for sure: a tab stop, kept when a typed error joins it.

import type { Frame } from "@playwright/test";

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import { embedWrapper, serveListing } from "./harness/operator-page.ts";
import {
  advanceUntil,
  expect,
  scriptRound,
  test,
} from "./harness/round-play.ts";
import { pickCheck, ROUND_PINS } from "./harness/round-vector.ts";
import { TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

/** Three times the text size, through the CSSOM (the page's CSP allows it). */
const tripleText = (): void => {
  document.documentElement.style.setProperty("font-size", "300%");
};

/** Whether the status slot's text overflows it, in one synchronous read. */
const overflows = (slot: Element): boolean =>
  slot.scrollHeight > slot.clientHeight || slot.scrollWidth > slot.clientWidth;

const heading = (frame: Frame): ReturnType<Frame["locator"]> =>
  frame.locator(".se-status h1");

test("the status slot takes its tab stop while it overflows, and the bar's height stays", async ({
  context,
  page,
  fakePlayApi,
  playApiBaseUrl,
}) => {
  await serveListing(
    context,
    roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
  );
  scriptRound(fakePlayApi);
  const frame = await embedWrapper(page, fakePlayApi.launchUrl(WRAPPER_PAGE), {
    box: { width: 320, height: 900 },
  });
  await expect(heading(frame)).toHaveText(TEXT.idle);
  await frame.getByRole("button", { name: TEXT.placeBet }).click();
  const game = frame.locator("iframe:not([inert])");
  await advanceUntil(page, () => game.isVisible());
  fakePlayApi.answer("continueRound", {
    kind: "snapshot",
    vector: "coinflip-lost",
    expect: pickCheck,
  });
  await frame
    .frameLocator("iframe")
    .getByRole("button", { name: "Tails" })
    .click();
  await expect(heading(frame)).toHaveText(TEXT.lost);
  const slot = frame.locator(".se-status-slot");
  // The one-row result fits: no tab stop.
  expect(await slot.evaluate(overflows)).toBe(false);
  await expect(slot).not.toHaveAttribute("tabindex");
  // Three times the text size: the receipt is wider than the slot.
  await frame.evaluate(tripleText);
  await expect(slot).toHaveAttribute("tabindex", "0");
  expect(await slot.evaluate(overflows)).toBe(true);
  const bar = frame.locator(".se-bar");
  const before = await bar.boundingBox();
  // The next start is refused: the error joins the result.
  fakePlayApi.answer("startRound", {
    kind: "problem",
    vector: "problem-insufficient-funds",
  });
  await frame.getByRole("button", { name: TEXT.playAgain }).click();
  await expect(frame.locator(".se-alert")).toContainText(
    "Your balance is too low for this bet.",
  );
  expect(await slot.evaluate(overflows)).toBe(true);
  await expect(slot).toHaveAttribute("tabindex", "0");
  expect((await bar.boundingBox())?.height).toBe(before?.height);
});
