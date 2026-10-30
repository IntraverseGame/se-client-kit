// The session's open on the release bundle (W-1, W-1a, W-2, W-3, T-4a's browser
// half): the launch code is read from the fragment and removed from the URL,
// redeemed once, and the Snapshot is read with the play token; a launch with no
// code, a reload (the URL no longer holds it), and a second launch of the used
// code show the session-ended state, and a redeem is never retried; going back
// does not return to the launch URL.

import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import {
  coverHeading,
  launch,
  servedFor,
  statusHeading,
  TEXT,
  WRAPPER_PAGE,
} from "./harness/wrapper-page.ts";

test.describe("the session's open", () => {
  test("redeems the fragment's code once, and reads with the play token", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    expect(page.url()).toBe(WRAPPER_PAGE);
    const redeems = servedFor(fakePlayApi, "redeemLaunchCode");
    expect(redeems).toHaveLength(1);
    expect(redeems[0]?.body).toEqual({ launchCode: fakePlayApi.launchCode });
    const reads = servedFor(fakePlayApi, "getSnapshot");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(read => read.authorized)).toBe(true);
  });

  test("with no code in the fragment, sends nothing and shows the session ended", async ({
    page,
    fakePlayApi,
  }) => {
    await page.goto(`${WRAPPER_PAGE}?launchCode=${fakePlayApi.launchCode}`);
    await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
    expect(fakePlayApi.served).toEqual([]);
  });

  test("a reload has no code: the session ended, and nothing is redeemed again", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await page.reload();
    await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);
  });

  test("a second launch of the used code is refused once, never retried", async ({
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
    const again = await context.newPage();
    await launch(again, fakePlayApi);
    await expect(coverHeading(again)).toHaveText(TEXT.sessionEnded);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(2);
  });

  test("a redeem answered UNAVAILABLE is not repeated", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("redeemLaunchCode", {
      kind: "problem",
      vector: "problem-redeem-unavailable",
    });
    await launch(page, fakePlayApi);
    await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);
  });

  test("going back after the launch does not return to the launch URL", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await page.goBack();
    expect(page.url()).toBe(`${PAGES_ORIGIN}/blank.html`);
    expect(page.url()).not.toContain("#");
    expect(page.url()).not.toContain(fakePlayApi.launchCode);
  });
});
