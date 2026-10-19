// T-11 (AC1, W-23, W-31, W-39, W-40): a loss, as T-10's win: the round passes
// W-26, the move is signed with the vendored bytes, and the result is a loss
// with its round id and verify link, the next bet beside it, and passes the
// accessibility audit. Starting the next round from that result sends a second
// `startRound` with the chosen bet; refused with a typed error, the loss's
// round id and verify link stay (W-40).

import { auditAccessibility } from "./harness/accessibility.ts";
import { callTails, expect, test, toReady } from "./harness/round-play.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import {
  alertPanel,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** The `bet` of a served `startRound` body. */
const betOf = (body: unknown): unknown =>
  typeof body === "object" && body !== null && "bet" in body
    ? body.bet
    : undefined;

test.describe("T-11: a loss", () => {
  test("is played and shows the loss with its round id and verify link", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-lost",
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.lost);
    await expect(
      statusHeading(page).getByRole("img", { name: "Loss" }),
    ).toHaveCount(1);
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toBeVisible();
    // The next bet is offered beside the result (W-31, W-40).
    await expect(page.getByRole("button", { name: TEXT.start })).toBeVisible();
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("starts the next round from the loss with the chosen bet; a refused start keeps the round id and verify link", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-lost",
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.lost);
    fakePlayApi.answer("startRound", {
      kind: "problem",
      vector: "problem-insufficient-funds",
    });
    // The loss's own `bet`: €1.00 (the default), €5.00, €10.00.
    await page.getByRole("radio", { name: "€5.00" }).check();
    await page.getByRole("button", { name: TEXT.start }).click();
    await expect(alertPanel(page)).toContainText(
      "Your balance is too low for this bet.",
    );
    const starts = servedFor(fakePlayApi, "startRound");
    expect(starts).toHaveLength(2);
    expect(betOf(starts[1]?.body)).toMatchObject({ value: "500", unit: "EUR" });
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
