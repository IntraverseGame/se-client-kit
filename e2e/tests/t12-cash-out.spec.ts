// T-12 (AC1, W-24, W-31): a cash-out, in the Wrapper's release bundle against
// the fake Play API, on the vendored Cash or Crash `[3,3,4]` round
// (round-vector.ts, CASH_OR_CRASH). The start is answered with the round
// `active` at step 0 with `T_0` settled; it passes the `CreateRoundAuth` checks
// and the tip check against the fake RPC endpoints and is shown ready with the
// game. The player picks row 1 tile 3 (`pick row 0 tile 2`), signed with
// `typed-data/cashorcrash-pick`'s bytes, and the pick survives; the Wrapper's
// cash-out control then signs `typed-data/cashorcrash-cash-out`'s bytes with
// `signed-action/cashorcrash-cash-out`'s exact signature. The round ends `won`
// with the Snapshot's payout as `formatted` (W-31), its round id, and the
// verify link, and no tile or cash-out is offered after the close. The result
// passes the accessibility audit. The last-surviving-move half of T-12 stays
// pending (pending.spec.ts): no vendored round ends on its last row.

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
  startCheck,
} from "./harness/round-vector.ts";
import { validVector } from "./harness/vectors.ts";
import {
  launchAndStart,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** The won answer's own `payout.formatted`, read at run time. */
const payoutFormatted = (): string => {
  const { payout } = validVector(CASH_OR_CRASH.won, "Snapshot").input as {
    readonly payout?: { readonly formatted?: unknown };
  };
  if (typeof payout?.formatted !== "string") {
    throw new TypeError(`${CASH_OR_CRASH.won} carries no payout`);
  }
  return payout.formatted;
};

test.describe("T-12: a cash-out", () => {
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
      `${TEXT.payout} ${payoutFormatted()}`,
    );
    await expect(page.getByText(CASH_OR_CRASH_ROUND_ID)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    // Nothing is offered after the close: no cash-out, and no tile takes a pick.
    await expect(page.getByRole("button", { name: TEXT.cashOut })).toHaveCount(
      0,
    );
    const tiles = gameFrame(page).getByRole("button", { name: /^Tile /u });
    for (const each of await tiles.all()) {
      // oxlint-disable-next-line no-await-in-loop -- each tile is read in turn
      await expect(each).toHaveAttribute("aria-disabled", "true");
    }
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "cashOutRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
