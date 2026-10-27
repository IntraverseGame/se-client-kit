// T-12 (AC1, W-24, W-31): a cash-out, and a round won on its last row, in the
// Wrapper's release bundle against the fake Play API.
//
// The cash-out, on the vendored Cash or Crash `[3,3,4]` round
// (round-vector.ts, CASH_OR_CRASH): the start is answered with the round
// `active` at step 0 with `T_0` settled; it passes the `CreateRoundAuth` checks
// and the tip check against the fake RPC endpoints and is shown ready with the
// game. The player picks row 1 tile 3 (`pick row 0 tile 2`), signed with
// `typed-data/cashorcrash-pick`'s bytes, and the pick survives; the Wrapper's
// cash-out control then signs `typed-data/cashorcrash-cash-out`'s bytes with
// `signed-action/cashorcrash-cash-out`'s exact signature. The round ends `won`
// with the Snapshot's payout as `formatted` (W-31), its round id, and the
// verify link, and no tile or cash-out is offered after the close.
//
// The last surviving move, on the vendored round played through its last row
// (round-vector.ts, LAST_ROW): three picks, each signed with the bytes of
// `typed-data/cashorcrash-last-row-pick-row0` to `-row2` and answered with the
// round's next Snapshot; the last answer is `won`, with the Snapshot's own
// payout, and nothing is signed or sent after it: no cash-out is offered or
// called. Both results pass the accessibility audit.

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  advanceUntil,
  expect,
  gameFrame,
  snapshotAnswer,
  test,
} from "./harness/round-play.ts";
import {
  CASH_OR_CRASH,
  CASH_OR_CRASH_ROUND_ID,
  cashOrCrashPickCheck,
  cashOutCheck,
  LAST_ROW,
  LAST_ROW_ROUND_ID,
  lastRowPickCheck,
  startCheck,
} from "./harness/round-vector.ts";
import { validVector } from "./harness/vectors.ts";
import {
  launchAndStart,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

type Payout = { readonly value: string; readonly formatted: string };

/** The `won` answer's own `payout`, read at run time. */
const payoutOf = (vector: string): Payout => {
  const { payout } = validVector(vector, "Snapshot").input as {
    readonly payout?: {
      readonly value?: unknown;
      readonly formatted?: unknown;
    };
  };
  if (
    typeof payout?.value !== "string" ||
    typeof payout.formatted !== "string"
  ) {
    throw new TypeError(`${vector} carries no payout`);
  }
  return { value: payout.value, formatted: payout.formatted };
};

/** No tile takes a pick and no cash-out is offered after the close. */
const expectClosed = async (page: Page): Promise<void> => {
  await expect(page.getByRole("button", { name: TEXT.cashOut })).toHaveCount(0);
  const tiles = gameFrame(page).getByRole("button", { name: /^Tile /u });
  for (const each of await tiles.all()) {
    // oxlint-disable-next-line no-await-in-loop -- each tile is read in turn
    await expect(each).toHaveAttribute("aria-disabled", "true");
  }
};

test.describe("T-12: a cash-out and a last-row win", () => {
  test("picks a tile that survives, cashes out, and shows the result with its payout, round id, and verify link", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-idle"));
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer(CASH_OR_CRASH.step0, startCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(CASH_OR_CRASH.step0));
    await launchAndStart(page, fakePlayApi);
    await advanceUntil(page, () => page.locator("iframe").isVisible());
    await expect(statusHeading(page)).toHaveText(TEXT.active);

    // The first row's third tile: the vector's pick, which survives.
    fakePlayApi.answer(
      "continueRound",
      snapshotAnswer(CASH_OR_CRASH.step1, cashOrCrashPickCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(CASH_OR_CRASH.step1));
    const row = gameFrame(page).getByRole("group", { name: "Row 1" });
    const tile = row.getByRole("button", { name: "Tile 3" });
    await expect(tile).toHaveAttribute("aria-disabled", "false");
    await tile.click();

    // The cash-out ends the round `won`.
    const cashOut = page.getByRole("button", { name: TEXT.cashOut });
    await expect(cashOut).toBeEnabled();
    fakePlayApi.answer(
      "cashOutRound",
      snapshotAnswer(CASH_OR_CRASH.won, cashOutCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(CASH_OR_CRASH.won));
    await cashOut.click();

    await expect(statusHeading(page)).toHaveText(TEXT.won);
    await expect(page.locator(".se-status")).toContainText(
      `${TEXT.payout} ${payoutOf(CASH_OR_CRASH.won).formatted}`,
    );
    await expect(page.getByText(CASH_OR_CRASH_ROUND_ID)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    // Nothing is offered after the close: no cash-out, and no tile takes a pick.
    await expectClosed(page);
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "cashOutRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });
  test("picks a surviving tile on every row, ends won on the last with its payout, and signs nothing after it", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-idle"));
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer(LAST_ROW.step0, startCheck),
    );
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(LAST_ROW.step0));
    await launchAndStart(page, fakePlayApi);
    await advanceUntil(page, () => page.locator("iframe").isVisible());
    await expect(statusHeading(page)).toHaveText(TEXT.active);

    // The vectors' picks, one per row, each answered with the round's next
    // Snapshot; the last row's pick survives and ends the round `won`.
    const picks = [
      { row: 0, tile: 0, answer: LAST_ROW.step1 },
      { row: 1, tile: 2, answer: LAST_ROW.step2 },
      { row: 2, tile: 1, answer: LAST_ROW.won },
    ] as const;
    for (const { row, tile, answer } of picks) {
      fakePlayApi.answer(
        "continueRound",
        snapshotAnswer(answer, lastRowPickCheck(row)),
      );
      fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(answer));
      const button = gameFrame(page)
        .getByRole("group", { name: `Row ${String(row + 1)}` })
        .getByRole("button", { name: `Tile ${String(tile + 1)}` });
      // oxlint-disable-next-line no-await-in-loop -- each pick waits for the one before it
      await expect(button).toHaveAttribute("aria-disabled", "false");
      // oxlint-disable-next-line no-await-in-loop -- each pick waits for the one before it
      await button.click();
      // oxlint-disable-next-line no-await-in-loop -- each pick waits for the one before it
      await expect
        .poll(() => servedFor(fakePlayApi, "continueRound").length)
        .toBe(row + 1);
    }

    await expect(statusHeading(page)).toHaveText(TEXT.won);
    // The payout is the Snapshot's own, never one computed from a multiplier.
    const payout = payoutOf(LAST_ROW.won);
    expect(payout).toEqual({ value: "289", formatted: "€2.89" });
    await expect(page.locator(".se-status")).toContainText(
      `${TEXT.payout} ${payout.formatted}`,
    );
    await expect(page.getByText(LAST_ROW_ROUND_ID)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    await expectClosed(page);
    // Nothing is signed after the last pick: three picks, no cash-out, and only
    // reads after the third pick was served.
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(3);
    expect(servedFor(fakePlayApi, "cashOutRound")).toHaveLength(0);
    const lastPick = fakePlayApi.served.findLastIndex(
      entry => entry.operationId === "continueRound",
    );
    expect(
      fakePlayApi.served
        .slice(lastPick + 1)
        .filter(entry => entry.operationId !== "getSnapshot"),
    ).toEqual([]);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
