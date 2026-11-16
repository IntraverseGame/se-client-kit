// T-30's browser row and T-34 (W-59, W-39, W-57; decided by the human,
// 2026-11-13): a result is one row, "✓ You won €1.94" and the round receipt
// at the end of the status line, its label the shortened round id. In boxes of
// 320, 400, 900, and 1280 CSS pixels the result's status slot fits, with no
// overflow, and the receipt sits on the heading's row. Its popover (in the
// top layer) holds the full round id and the verify link with
// `rel="noopener noreferrer"` and the round's URL; Escape closes it and gives
// the focus back to the chip. Every browser project.

import type { Frame } from "@playwright/test";

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import { embedWrapper, serveListing } from "./harness/operator-page.ts";
import {
  advanceUntil,
  expect,
  scriptRound,
  test,
} from "./harness/round-play.ts";
import { pickCheck, ROUND, ROUND_PINS } from "./harness/round-vector.ts";
import { openReceipt, TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

const WIDTHS = [320, 400, 900, 1280] as const;

type Row = {
  readonly fits: boolean;
  /** The vertical centres of the status heading and the receipt. */
  readonly centres: readonly number[];
};

/** The result's status slot, read inside the Wrapper's frame. */
const rowOf = (): Row => {
  const slot = document.querySelector(".se-status-slot");
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `rowOf`
  const centre = (selector: string): number => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box === undefined ? -1 : Math.round(box.top + box.height / 2);
  };
  return {
    fits:
      slot !== null &&
      slot.scrollHeight <= slot.clientHeight &&
      slot.scrollWidth <= slot.clientWidth,
    centres: [centre(".se-status h1"), centre(".se-receipt")],
  };
};

const heading = (frame: Frame): ReturnType<Frame["locator"]> =>
  frame.locator(".se-status h1");

test.beforeEach(async ({ context, playApiBaseUrl }) => {
  await serveListing(
    context,
    roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
  );
});

for (const width of WIDTHS) {
  test(`a win at ${String(width)} CSS pixels is one row that fits, its receipt one click from the verify link`, async ({
    page,
    fakePlayApi,
  }) => {
    scriptRound(fakePlayApi);
    const frame = await embedWrapper(
      page,
      fakePlayApi.launchUrl(WRAPPER_PAGE),
      { box: { width, height: 900 } },
    );
    await expect(heading(frame)).toHaveText(TEXT.idle);
    await frame.getByRole("button", { name: TEXT.placeBet }).click();
    const game = frame.locator("iframe:not([inert])");
    await advanceUntil(page, () => game.isVisible());
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won-payout",
      expect: pickCheck,
    });
    await frame
      .frameLocator("iframe")
      .getByRole("button", { name: "Tails" })
      .click();
    await expect(heading(frame)).toHaveText(TEXT.won);
    const chip = frame.locator(".se-receipt");
    await expect(chip).toHaveText(`…${ROUND.roundId.slice(-8)}`);
    await expect(chip).toHaveAccessibleName(new RegExp(ROUND.roundId, "u"));
    const row = await frame.evaluate(rowOf);
    expect(row.fits).toBe(true);
    const [headingCentre = 0, chipCentre = 0] = row.centres;
    expect(Math.abs(headingCentre - chipCentre)).toBeLessThanOrEqual(8);

    await openReceipt(frame);
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    await expect(frame.locator(".se-receipt__id")).toHaveText(ROUND.roundId);
    const link = frame.getByRole("link", { name: TEXT.verify });
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`/rounds/${ROUND.roundId}$`, "u"),
    );
    await page.keyboard.press("Escape");
    await expect(chip).toHaveAttribute("aria-expanded", "false");
    await expect(chip).toBeFocused();
  });
}
