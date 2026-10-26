// T-12 against the preview stack (AC1, W-24; RFC-002, Q9): launch Cash or Crash
// `[3,3,4]`, pick the first tile of row 0, and start another round if it ends
// lost (at most 40 rounds); once a pick survives, cash out with the Wrapper's
// cash-out control. The round ends `won`, the payout line shows the settled
// Snapshot's `formatted`, the verify API agrees (200, status, payout), and no
// pick or cash-out is offered after the close. The last-surviving-move half of
// the fake row is not played against the stack. T-12 depends on the stack
// certifying Cash or Crash `[3,3,4]` (OQ-3): until it does, the row fails at the
// launch, which is the signal.

import { expect } from "../harness/worker-browser.ts";
import { statusHeading, TEXT } from "../harness/wrapper-page.ts";
import {
  expectAccessibleResult,
  expectNothingOffered,
  expectSettledRound,
  playCashOrCrashFirstPick,
  STACK_STEP_TIMEOUT_MS,
} from "../preview-support/preview-rounds.ts";
import { test } from "../preview-support/preview-test.ts";
import { playUntil } from "../preview-support/round-loop.ts";

test.describe("T-12 (preview): a cash-out", () => {
  test("picks the first tile until one survives, then cashes out", async ({
    page,
    session,
    secretScan,
  }) => {
    await session.launch(page, "cash-or-crash");
    // The loop's target "won" is a first pick that survives (the cash-out is
    // offered); a round whose first pick ends it is "lost".
    await playUntil("won", () => playCashOrCrashFirstPick(page, session));
    // The surviving round has not ended; the cash-out is the one that ends it.
    const endedBefore = session.settledCount();
    await page.getByRole("button", { name: TEXT.cashOut }).click();
    await expect(statusHeading(page)).toHaveText(TEXT.won, {
      timeout: STACK_STEP_TIMEOUT_MS,
    });
    await expectSettledRound(page, session, "won", endedBefore);
    await expectNothingOffered(page);
    const callsAtClose = session.roundCalls();
    await expectAccessibleResult(page);
    expect(session.roundCalls()).toBe(callsAtClose);
    await secretScan.expectClean();
  });
});
