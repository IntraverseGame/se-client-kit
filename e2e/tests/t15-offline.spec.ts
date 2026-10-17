// T-15 (AC5, W-43): the network is cut while the round is `starting` and while
// it is `resolving`; the connection-problem state appears (with the offline
// notice when the browser reports it), the round is not lost, and after the
// connection returns the Snapshot is read first and the round goes on. The
// cut during a signed action needs a round W-26 passes, which the fake's
// vectors cannot issue for the session's key: that part stays pending.

import { expect, test } from "./harness/fixtures.ts";
import {
  alertPanel,
  launch,
  launchAndStart,
  scriptStartingRound,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

test.describe("T-15: offline", () => {
  test("during starting: the connection problem shows and the round is kept", async ({
    page,
    fakePlayApi,
    network,
  }) => {
    scriptStartingRound(fakePlayApi);
    await launchAndStart(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    await network.goOffline();
    await expect(alertPanel(page)).toContainText(TEXT.connection);
    await expect(alertPanel(page)).toContainText(TEXT.offline);
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    const reads = servedFor(fakePlayApi, "getSnapshot").length;
    await network.goOnline();
    await expect(alertPanel(page)).not.toContainText(TEXT.connection);
    expect(servedFor(fakePlayApi, "getSnapshot").length).toBeGreaterThan(reads);
    await expect(statusHeading(page)).toHaveText(TEXT.starting);
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
  });

  test("during resolving: the Play API is lost and comes back", async ({
    page,
    fakePlayApi,
    network,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-resolving",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.resolving);
    network.cutPlayApi();
    await expect(alertPanel(page)).toContainText(TEXT.connection);
    await expect(statusHeading(page)).toHaveText(TEXT.resolving);
    network.restorePlayApi();
    await expect(alertPanel(page)).not.toContainText(TEXT.connection);
    await expect(statusHeading(page)).toHaveText(TEXT.resolving);
  });
});
