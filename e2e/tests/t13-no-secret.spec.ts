// T-13 (AC4, W-3, W-4, W-11, W-12): no secret after a whole session on the
// release bundle, launched through the fragment: a redeem, the Snapshot reads,
// a start (the action key is drawn, from the seeded random source), polling,
// a reload, and the session's end. The scan finds no launch code, play token,
// or key in any channel it reads. The player-started evidence download (W-27)
// is not built yet, so it is not part of this run.

import { expect, test } from "./harness/fixtures.ts";
import { KEY_DRAW_BYTES } from "./harness/random-stub.ts";
import {
  launchAndStart,
  scriptStartingRound,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

test.describe("T-13: no secret", () => {
  test("after a whole session, a reload, and the session's end", async ({
    page,
    fakePlayApi,
    secretScan,
    randomDraws,
  }) => {
    scriptStartingRound(fakePlayApi);
    await launchAndStart(page, fakePlayApi, secretScan);
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    // The start presented the action key: it was drawn.
    await randomDraws.settled();
    expect(
      randomDraws.draws().some(draw => draw.length === KEY_DRAW_BYTES),
    ).toBe(true);
    const [start] = servedFor(fakePlayApi, "startRound");
    expect(start?.authorized).toBe(true);
    // A poll while `starting` (W-35).
    await expect
      .poll(() => servedFor(fakePlayApi, "getSnapshot").length)
      .toBeGreaterThan(1);
    await page.reload();
    await expect(statusHeading(page)).toHaveText(TEXT.sessionEnded);
    await secretScan.expectClean();
  });
});
