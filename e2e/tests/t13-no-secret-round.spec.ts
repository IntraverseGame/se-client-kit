// T-13 over a played round (AC4, W-3, W-4, W-11, W-12): the session's key is
// the scripted one (the signed-action vector's test key, round-play.ts), the
// round passes W-26, the player's move is signed and sent, the result shows,
// and the page reloads. The scan treats the scripted key as the action key it
// is (every 32-byte draw is a secret): the recorded draws hold it, compared
// with the vector's key at run time, so the scan looks for it, and finds it,
// the launch code, and the play tokens in no channel it reads: a signed move
// carries a signature and the typed data, never the key.

import { KEY_DRAW_BYTES } from "./harness/random-stub.ts";
import { callTails, expect, test, toReady } from "./harness/round-play.ts";
import { isScriptedKey, pickCheck } from "./harness/round-vector.ts";
import { coverHeading, statusHeading, TEXT } from "./harness/wrapper-page.ts";

test.describe("T-13: no secret, over a played round", () => {
  test("after a signed move, the result, and a reload", async ({
    page,
    fakePlayApi,
    secretScan,
    randomDraws,
  }) => {
    await toReady(page, fakePlayApi, secretScan);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won",
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.won);
    await randomDraws.settled();
    expect(
      randomDraws.draws().some(draw => draw.length === KEY_DRAW_BYTES),
    ).toBe(true);
    // The scan's secrets are the recorded draws: the scripted key is one of
    // them, so the scan looks for the session's key (a boolean, never the key).
    expect(randomDraws.draws().some(draw => isScriptedKey(draw))).toBe(true);
    await page.reload();
    await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
    await secretScan.expectClean();
  });
});
