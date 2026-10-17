// The fake Play API's own tests, part two: a scripted network failure or a
// call that never answers, the record of calls it had no answer for, and the
// refusal of a script the vendored document does not allow.

import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import {
  abortHanging,
  abortableRedeem,
  call,
  openSession,
  redeemOutcome,
} from "./harness/play-calls.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

test.describe("the fake Play API's script", () => {
  test("fails a call as a network failure, or never answers it", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer(
      "redeemLaunchCode",
      { kind: "network-failure" },
      { kind: "hang" },
    );
    expect(await redeemOutcome(page)).toBe("network failure");
    const hanging = abortableRedeem(page);
    await expect.poll(() => fakePlayApi.served.length).toBe(2);
    await abortHanging(page);
    expect(await hanging).toBe("aborted");
  });

  test("records a call it has no answer for, and an unknown route", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    expect(
      (await call(page, "/play/v1/snapshot", { method: "GET", token })).status,
    ).toBe(500);
    expect(
      (await call(page, "/play/v1/rounds:pause", { token, body: {} })).status,
    ).toBe(404);
    expect(fakePlayApi.takeUnexpected()).toEqual([
      "getSnapshot: no answer scripted",
      "POST /play/v1/rounds:pause: no such route",
    ]);
  });

  test("refuses a script the document does not allow", ({ fakePlayApi }) => {
    expect(() => {
      fakePlayApi.answer("getSnapshot", {
        kind: "snapshot",
        vector: "problem-round-active",
      });
    }).toThrow(/is a PlayProblem, not the Snapshot/u);
    expect(() => {
      fakePlayApi.answer("getSnapshot", {
        kind: "snapshot",
        vector: "no-such-vector",
      });
    }).toThrow(/no valid\/ Snapshot vector/u);
    // `refreshPlayToken` lists no 409.
    expect(() => {
      fakePlayApi.answer("refreshPlayToken", {
        kind: "problem",
        vector: "problem-round-active",
      });
    }).toThrow(/which refreshPlayToken does not list/u);
  });
});
