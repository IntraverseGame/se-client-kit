// T-10 against the preview stack (AC1, W-22 to W-26, W-31, W-39; RFC-002): play
// Coin Flip rounds, each a full start, pick, and settle, until a win is seen, at
// most 40. For every round that ends: the Wrapper reached `active` (so the
// `CreateRoundAuth` and tip checks passed against the real environment document
// and chain), the final heading is `You won` or `You lost`, the shown round id
// is the settled Snapshot's, the verify link is present, and the verify API
// agrees on status and payout. On the win: the payout line shows the Snapshot's
// `formatted`. The result passes the accessibility audit, and the secret scan is
// clean at the end. Not run in this repository's CI: the backend's job runs it.

import {
  expectAccessibleResult,
  playCoinFlipRound,
} from "../preview-support/preview-rounds.ts";
import { test } from "../preview-support/preview-test.ts";
import { playUntil } from "../preview-support/round-loop.ts";

test.describe("T-10 (preview): a win", () => {
  test("plays Coin Flip until a win, checking every round", async ({
    page,
    session,
    secretScan,
  }) => {
    await session.launch(page, "coin-flip");
    await playUntil("won", () => playCoinFlipRound(page, session));
    await expectAccessibleResult(page);
    await secretScan.expectClean();
  });
});
