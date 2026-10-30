// T-11 against the preview stack (AC1, W-23, W-31, W-39, W-40; RFC-002): the
// same loop, until a loss is seen, at most 40. On the loss: no payout line when
// `payout.value` is 0 (W-34, compared as a `bigint`) and the payout line when it
// is above 0; the round id and the verify link stay; the next round can start
// from the loss's result (the loop's next iteration is that proof, and the next
// bet is offered beside the result). The typed-refusal case stays fake-only: it
// needs a scripted error.

import { expect } from "../harness/worker-browser.ts";
import { TEXT } from "../harness/wrapper-page.ts";
import {
  expectAccessibleResult,
  playCoinFlipRound,
} from "../preview-support/preview-rounds.ts";
import { test } from "../preview-support/preview-test.ts";
import { playUntil } from "../preview-support/round-loop.ts";

test.describe("T-11 (preview): a loss", () => {
  test("plays Coin Flip until a loss, checking every round", async ({
    page,
    session,
    secretScan,
  }) => {
    await session.launch(page, "coin-flip");
    await playUntil("lost", () => playCoinFlipRound(page, session));
    // The next bet is offered beside the loss's result (W-31, W-40).
    await expect(
      page.getByRole("button", { name: TEXT.playAgain }),
    ).toBeVisible();
    await expectAccessibleResult(page);
    await secretScan.expectClean();
  });
});
