// The fake Play API's own tests, part two: a scripted network failure or a
// call that never answers, the record of calls it had no answer for, the
// refusal of a script the vendored document does not allow, an answer's check
// of the request body (`expect`), a problem it writes itself (`own-problem`),
// and the one `invalid/` answer (`invalid-snapshot`).

import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import {
  abortHanging,
  abortableRedeem,
  call,
  openSession,
  redeemOutcome,
} from "./harness/play-calls.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import { invalidVector, typedDataBase64 } from "./harness/vectors.ts";

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

  test("an answer's check refuses a body: recorded, and answered 400, not with the answer", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    const body = {
      idempotencyKey: "0192e4b0-0000-7000-8000-000000000001",
      roundId: ROUND.roundId,
      typedData: typedDataBase64("coinflip-pick"),
      signature: `0x${"12".repeat(65)}`,
    };
    fakePlayApi.answer(
      "continueRound",
      { kind: "snapshot", vector: "coinflip-won", expect: () => "not the one" },
      { kind: "snapshot", vector: "coinflip-won", expect: pickCheck },
    );
    const refused = await call(page, "/play/v1/rounds:continue", {
      token,
      body,
    });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(fakePlayApi.takeUnexpected()).toEqual([
      "continueRound: not the one",
    ]);
    const accepted = await call(page, "/play/v1/rounds:continue", {
      token,
      body,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: "won" });
  });

  test("writes a problem no vector holds, with a listed status only", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    fakePlayApi.answer("getSnapshot", {
      kind: "own-problem",
      code: "SESSION_EXPIRED",
      status: 401,
    });
    const answered = await call(page, "/play/v1/snapshot", {
      method: "GET",
      token,
    });
    expect(answered.status).toBe(401);
    expect(answered.body).toMatchObject({
      code: "SESSION_EXPIRED",
      status: 401,
    });
    // `getSnapshot` lists no 409.
    expect(() => {
      fakePlayApi.answer("getSnapshot", {
        kind: "own-problem",
        code: "STALE_ACTION",
        status: 409,
      });
    }).toThrow(/which getSnapshot does not list/u);
  });

  test("serves an invalid/ Snapshot only by name, as vendored", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    fakePlayApi.answer("getSnapshot", {
      kind: "invalid-snapshot",
      vector: "required-step-missing",
    });
    const answered = await call(page, "/play/v1/snapshot", {
      method: "GET",
      token,
    });
    expect(answered.status).toBe(200);
    expect(answered.body).toEqual(invalidVector("required-step-missing"));
    expect(() => {
      fakePlayApi.answer("getSnapshot", {
        kind: "invalid-snapshot",
        vector: "coinflip-idle",
      });
    }).toThrow(/no invalid\/ Snapshot vector/u);
  });
});
