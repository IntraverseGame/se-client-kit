// T-27 (W-57 "The height", W-31): the cash-out control with the amount on it
// fits the bar's reserved rows on the real layout. In each of T-27's operator
// boxes the vendored Cash or Crash round is played to its step-1 Snapshot with
// `cashOutValue` (`valid/cashorcrash-active-cash-out-value`); the control reads
// "Cash out" with the amount, the controls and the round line fit their rows,
// and the document does not scroll. The rest of T-27 is
// t27-filling-the-box.spec.ts.

import type { Frame } from "@playwright/test";

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import { embedWrapper, serveListing } from "./harness/operator-page.ts";
import {
  advanceUntil,
  expect,
  snapshotAnswer,
  test,
} from "./harness/round-play.ts";
import {
  CASH_OR_CRASH,
  cashOrCrashPickCheck,
  ROUND_PINS,
  startCheck,
} from "./harness/round-vector.ts";
import { amountOf } from "./harness/vectors.ts";
import { TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

const BOXES = [
  { width: 1280, height: 720 },
  { width: 1142, height: 620 },
  { width: 800, height: 600 },
  { width: 400, height: 900 },
] as const;

const QUOTE = amountOf(CASH_OR_CRASH.step1, "cashOutValue");

type Fit = {
  readonly fits: boolean;
  readonly scrollsX: boolean;
  readonly scrollsY: boolean;
};

/** Whether the rows fit and the document scrolls, measured in its iframe. */
const measure = (): Fit => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `measure`
  const scrolls = (left: number, top: number): boolean => {
    globalThis.scrollTo(left, top);
    const moved = globalThis.scrollX > 0 || globalThis.scrollY > 0;
    globalThis.scrollTo(0, 0);
    return moved;
  };
  return {
    fits: [".se-controls", ".se-round"].every(selector => {
      const slot = document.querySelector(selector);
      return slot !== null && slot.scrollHeight <= slot.clientHeight;
    }),
    scrollsX: scrolls(50, 0),
    scrollsY: scrolls(0, 50),
  };
};

const fitOf = (frame: Frame): Promise<Fit> => frame.evaluate(measure);

test.beforeEach(async ({ context, playApiBaseUrl }) => {
  await serveListing(
    context,
    roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
  );
});

for (const box of BOXES) {
  const size = `${String(box.width)} by ${String(box.height)}`;

  test(`fits the amount on the cash-out control in a ${size} box`, async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-idle"));
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer(CASH_OR_CRASH.step0, startCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(CASH_OR_CRASH.step0));
    const frame = await embedWrapper(
      page,
      fakePlayApi.launchUrl(WRAPPER_PAGE),
      {
        box,
      },
    );
    const heading = frame.locator(".se-status h1");
    await expect(heading).toHaveText(TEXT.idle);
    await frame.getByRole("button", { name: TEXT.placeBet }).click();
    const game = frame.locator("iframe:not([inert])");
    await advanceUntil(page, () => game.isVisible());
    await expect(heading).toHaveText(TEXT.active);

    fakePlayApi.answer(
      "continueRound",
      snapshotAnswer(CASH_OR_CRASH.step1, cashOrCrashPickCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(CASH_OR_CRASH.step1));
    const tile = frame
      .frameLocator("iframe")
      .getByRole("group", { name: "Row 1" })
      .getByRole("button", { name: "Tile 3" });
    await expect(tile).toHaveAttribute("aria-disabled", "false");
    await tile.click();

    await expect(frame.getByRole("button", { name: TEXT.cashOut })).toHaveText(
      `${TEXT.cashOut} ${QUOTE.formatted}`,
    );
    expect(await fitOf(frame)).toEqual({
      fits: true,
      scrollsX: false,
      scrollsY: false,
    });
  });
}
