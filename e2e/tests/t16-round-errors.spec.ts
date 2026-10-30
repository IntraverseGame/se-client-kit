// T-16, the rest (AC5, W-7, W-19, W-28, W-42, W-44): the answers a round W-26
// passes can get. A move refused `STALE_ACTION` shows the out-of-sync state; a
// session-ending code to the move ends the session, and nothing more is sent;
// a Snapshot of the round that fails validation shows the rejected state and
// is not given to the game. Each state passes the accessibility audit.

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  advanceUntil,
  callTails,
  expect,
  shows,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck, startCheck } from "./harness/round-vector.ts";
import {
  alertPanel,
  coverHeading,
  launchAndStart,
  servedFor,
  TEXT,
} from "./harness/wrapper-page.ts";

test.describe("T-16: the errors of a round in play", () => {
  test("a move refused STALE_ACTION shows the round out of sync", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    fakePlayApi.answer("continueRound", {
      kind: "own-problem",
      code: "STALE_ACTION",
      status: 409,
      expect: pickCheck,
    });
    await callTails(page);
    await expect(alertPanel(page)).toContainText(TEXT.outOfSync);
    await expect(page.locator("iframe")).toHaveAttribute("inert", "");
    await expect(page.locator('.se-overlay[data-form="cover"]')).toBeVisible();
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  for (const code of [
    "SESSION_EXPIRED",
    "SESSION_REVOKED",
    "UNAUTHENTICATED",
  ] as const) {
    test(`${code} to the move ends the session, and nothing more is sent`, async ({
      page,
      fakePlayApi,
    }) => {
      await toReady(page, fakePlayApi);
      fakePlayApi.answer("continueRound", {
        kind: "own-problem",
        code,
        status: 401,
        expect: pickCheck,
      });
      await callTails(page);
      await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
      // The move was the session's last call: no refresh, read, or resend.
      expect(fakePlayApi.served.at(-1)?.operationId).toBe("continueRound");
      expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
      expect(await auditAccessibility(page)).toEqual([]);
    });
  }

  test("a Snapshot of the round that fails validation shows the rejected state", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-idle"), {
      kind: "invalid-snapshot",
      vector: "required-step-missing",
    });
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer("coinflip-starting", startCheck),
    );
    await launchAndStart(page, fakePlayApi);
    // The `starting` poll, on the page's clock, reads the rejected Snapshot.
    await advanceUntil(page, shows(alertPanel(page), TEXT.rejected));
    await expect(page.locator("iframe")).toHaveAttribute("inert", "");
    await expect(page.locator('.se-overlay[data-form="cover"]')).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
