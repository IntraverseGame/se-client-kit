// T-11 (AC1, W-23, W-31, W-39): a loss, as T-10's win: the round passes W-26,
// the move is signed with the vendored bytes, and the result is a loss with
// its round id and verify link, and passes the accessibility audit.

import { auditAccessibility } from "./harness/accessibility.ts";
import { callTails, expect, test, toReady } from "./harness/round-play.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import { servedFor, statusHeading, TEXT } from "./harness/wrapper-page.ts";

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
    await expect(
      page.getByRole("button", { name: TEXT.newRound }),
    ).toBeVisible();
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
