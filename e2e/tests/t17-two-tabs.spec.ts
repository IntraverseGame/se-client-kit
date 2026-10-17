// T-17 (W-14): two tabs of one session. A tab cloned with its session (the
// fake redeems the code once more, for the same session id) does not get the
// signer lock: it shows "open in another tab", offers no start, and reads,
// refreshes, and signs nothing.

import { expect, test } from "./harness/fixtures.ts";
import {
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

test.describe("T-17: two tabs", () => {
  test("the second tab of one session does not get the lock and does not sign", async ({
    page,
    context,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    const reads = servedFor(fakePlayApi, "getSnapshot").length;
    fakePlayApi.redeemAgain();
    const second = await context.newPage();
    await launch(second, fakePlayApi);
    await expect(statusHeading(second)).toHaveText(TEXT.otherTab);
    await expect(second.getByRole("button", { name: TEXT.start })).toHaveCount(
      0,
    );
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(2);
    expect(servedFor(fakePlayApi, "getSnapshot")).toHaveLength(reads);
    expect(servedFor(fakePlayApi, "startRound")).toEqual([]);
    expect(servedFor(fakePlayApi, "refreshPlayToken")).toEqual([]);
    // The first tab still holds the session.
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
  });
});
