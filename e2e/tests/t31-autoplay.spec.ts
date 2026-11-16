// T-31's browser row (W-61, RFC-005 section 6): autoplay of a book round, in
// the Wrapper's release bundle against the fake Play API, with the
// environment configuration's `autoplay` field. The player picks a count of 2
// from the start control's segment; the run's first start goes at once; while
// it runs the segment shows the count left and the status line "Autoplay · 1
// left", and the menu offers no lobby or deposit (W-49f). After the round's
// result the player stops the run: no second start is sent, even once the
// interval has passed, and the menu's links come back.

import {
  roundEnvironmentConfig,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import {
  advanceUntil,
  expect,
  shows,
  snapshotAnswer,
  test,
} from "./harness/round-play.ts";
import { ROUND_PINS, startCheck } from "./harness/round-vector.ts";
import {
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

const IDLE = "book-lifecycle-idle";
const FUNDED = "book-lifecycle-starting-funded";
const BOUND = "book-lifecycle-starting-bound";
const WON = "book-lifecycle-won";

/** The run's least interval between a result and the next start. */
const INTERVAL_MS = 2000;

test.describe("T-31: autoplay of book rounds", () => {
  test("runs a small count, shows it, offers no links while it runs, and stops on the player's stop", async ({
    context,
    page,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    // The round's configuration, with autoplay turned on (a later route wins).
    await serveEnvironmentConfig(context, {
      ...roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
      autoplay: { counts: [2, 5], minIntervalMs: INTERVAL_MS },
    });
    fakePlayApi.answer("getSnapshot", snapshotAnswer(IDLE));
    fakePlayApi.answer("startRound", snapshotAnswer(FUNDED, startCheck));
    fakePlayApi.answer("getSnapshot", snapshotAnswer(BOUND));
    fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(WON));

    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    const menuLinks = page.locator(".se-menu .se-links a");
    await expect(menuLinks).not.toHaveCount(0);

    await page.getByRole("button", { name: "Autoplay", exact: true }).click();
    await page.getByRole("button", { name: "2 rounds" }).click();
    const stop = page.locator(".se-autoplay--running");
    await expect(stop).toHaveText("1");
    await expect(stop).toHaveAccessibleName(/Stop autoplay/u);
    await expect(page.locator(".se-status")).toContainText("Autoplay · 1 left");
    // The run counts as a call in flight: no lobby, no deposit (W-49f).
    await expect(menuLinks).toHaveCount(0);

    // The round's `starting` polls run on the page's clock.
    await advanceUntil(page, shows(statusHeading(page), TEXT.won));
    await expect(menuLinks).toHaveCount(0);
    await stop.click();
    await expect(stop).toHaveCount(0);
    // The interval passes: the stopped run sends no second start.
    await page.clock.runFor(INTERVAL_MS * 2);
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    await expect(menuLinks).not.toHaveCount(0);
  });
});
