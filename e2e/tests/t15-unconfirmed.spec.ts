// T-15, a move not confirmed (AC5, W-16, W-35, W-46): the player's move is
// lost offline, and when the connection returns its one resend is lost too.
// The round is still `active`, the move neither applied nor refused: the
// Wrapper shows "your move hasn't been confirmed", that the round ends by its
// time limit if it never arrives, the round id, and "check again", with the
// game still waiting. "Check again" only reads the round, and so does the
// background read every 30 s: no move is sent again, and a read that shows the
// round won settles it. Each state shown passes the accessibility audit. What
// the page sent is read from the harness's `sent` (every project); the fake
// refuses any move that is not the first attempt's body. The Wrapper's timers
// run on the page's clock.

import { isDeepStrictEqual } from "node:util";

import { auditAccessibility } from "./harness/accessibility.ts";
import type { BodyCheck } from "./harness/fake-play-wire.ts";
import {
  advanceUntil,
  callTails,
  expect,
  gameFrame,
  shows,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import {
  alertPanel,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** A move whose body is `first`'s, field for field, or a refusal. */
const sameMoveAs =
  (first: unknown): BodyCheck =>
  body =>
    isDeepStrictEqual(body, first)
      ? undefined
      : "a move that is not the first attempt's signed move";

test.describe("T-15: a move not confirmed (W-16)", () => {
  test("its one resend lost too: the state shows, check again and the background read only read, and a result settles it", async ({
    page,
    fakePlayApi,
    network,
  }) => {
    await toReady(page, fakePlayApi);
    await network.goOffline();
    await callTails(page);
    await advanceUntil(page, shows(alertPanel(page), TEXT.connection));
    await expect
      .poll(() => network.sent("continueRound").length)
      .toBeGreaterThan(0);
    const attempts = network.sent("continueRound");
    const [first] = attempts;
    expect(pickCheck(first)).toBeUndefined();
    // Every attempt of the resend gets no answer either.
    fakePlayApi.answerEvery("continueRound", {
      kind: "network-failure",
      expect: sameMoveAs(first),
    });
    await network.goOnline();
    await advanceUntil(
      page,
      async () =>
        (await statusHeading(page).textContent()) === TEXT.moveUnconfirmed,
    );
    const sent = network.sent("continueRound").length;
    expect(sent).toBe(2 * attempts.length);
    const status = page.locator(".se-status");
    await expect(status).toContainText(TEXT.unconfirmedDetail);
    await expect(status).toContainText(ROUND.roundId);
    const checkAgain = page.getByRole("button", { name: TEXT.checkAgain });
    await expect(checkAgain).toBeVisible();
    await expect(alertPanel(page)).not.toContainText(TEXT.connection);
    // The game stays waiting for its move.
    await expect(gameFrame(page).locator("body")).toContainText(
      "Waiting for the Wrapper",
    );
    expect(await auditAccessibility(page)).toEqual([]);

    // "Check again" reads the round once and sends no move.
    const reads = servedFor(fakePlayApi, "getSnapshot").length;
    await checkAgain.click();
    await expect
      .poll(() => servedFor(fakePlayApi, "getSnapshot").length)
      .toBe(reads + 1);
    await expect(statusHeading(page)).toHaveText(TEXT.moveUnconfirmed);
    expect(network.sent("continueRound")).toHaveLength(sent);

    // The background read, 30 s later, finds the round won: it settles.
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer("coinflip-won"));
    await page.clock.runFor(30_500);
    await advanceUntil(
      page,
      async () => (await statusHeading(page).textContent()) === TEXT.won,
    );
    await expect(status).not.toContainText(TEXT.unconfirmedDetail);
    expect(network.sent("continueRound")).toHaveLength(sent);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
