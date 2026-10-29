// The fake Play API's own tests, part one: the session (redeem, refresh, the
// play token rule), strict request bodies, and bodies from the Snapshot
// vectors. The calls are made by a page with `fetch`, as the Wrapper makes
// them. Part two (scripted failures and refusals) is fake-play-script.spec.ts.

import { expect, test } from "./harness/fixtures.ts";
import { GAME_ORIGIN, PAGES_ORIGIN } from "./harness/origins.ts";
import { ACTION, call, openSession, tokenOf } from "./harness/play-calls.ts";
import { validVector } from "./harness/vectors.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

test.describe("the fake Play API", () => {
  test("builds the launch URL with the whole fragment as the launch code", ({
    fakePlayApi,
  }) => {
    const url = fakePlayApi.launchUrl("https://wrapper.e2e.test/");
    expect(url).toBe(`https://wrapper.e2e.test/#${fakePlayApi.launchCode}`);
    expect(new URL(url).hash).toMatch(/^#lc_[\w-]{43}$/u);
  });

  test("redeems its launch code once, with a token response that is not stored", async ({
    page,
    fakePlayApi,
  }) => {
    const first = await call(page, "/play/v1/sessions:redeem", {
      body: { launchCode: fakePlayApi.launchCode },
    });
    expect(first).toMatchObject({ status: 200, cacheControl: "no-store" });
    expect(first.body).toEqual({
      sessionId: expect.stringMatching(/^ses_[\da-f]{32}$/u),
      playToken: expect.stringMatching(/^pt_[\w-]{43}$/u),
      tokenExpiresAt: "2026-10-16T12:15:00.000Z",
      sessionExpiresAt: "2026-10-16T14:00:00.000Z",
      gameOrigin: GAME_ORIGIN,
      gamePath: "/",
    });
    const again = await call(page, "/play/v1/sessions:redeem", {
      body: { launchCode: fakePlayApi.launchCode },
    });
    expect(again.status).toBe(401);
    expect(again.contentType).toBe("application/problem+json");
    expect(again.body).toMatchObject({
      code: "UNAUTHENTICATED",
      retryable: false,
    });
  });

  test("redeems the code once more for a cloned tab, for the same session with a new token", async ({
    page,
    fakePlayApi,
  }) => {
    const redeem = (): ReturnType<typeof call> =>
      call(page, "/play/v1/sessions:redeem", {
        body: { launchCode: fakePlayApi.launchCode },
      });
    const first = await redeem();
    fakePlayApi.redeemAgain();
    const second = await redeem();
    const third = await redeem();
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      sessionId: (first.body as { readonly sessionId: string }).sessionId,
    });
    expect(tokenOf(second)).not.toBe(tokenOf(first));
    expect(third.status).toBe(401);
  });

  test("requires the play token on every other route", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    const missing = await call(page, "/play/v1/snapshot", { method: "GET" });
    expect(missing.status).toBe(401);
    const unknown = await call(page, "/play/v1/snapshot", {
      method: "GET",
      token: `pt_${"x".repeat(43)}`,
    });
    expect(unknown.status).toBe(401);
  });

  test("answers a Snapshot operation with the scripted vector, as vendored", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    fakePlayApi.answer("cancelRound", {
      kind: "snapshot",
      vector: "coinflip-canceled",
    });
    const canceled = await call(page, "/play/v1/rounds:cancel", {
      token,
      body: ACTION,
    });
    expect(canceled.status).toBe(200);
    expect(canceled.body).toEqual(
      validVector("coinflip-canceled", "Snapshot").input,
    );
    expect(fakePlayApi.served.at(-1)).toMatchObject({
      operationId: "cancelRound",
      authorized: true,
      body: ACTION,
    });
  });

  test("sends a problem vector with its own status", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    fakePlayApi.answer("startRound", {
      kind: "problem",
      vector: "problem-round-active",
    });
    const problem = await call(page, "/play/v1/rounds:start", {
      token,
      body: {
        idempotencyKey: "e2e-start",
        bet: { value: "100", unit: "USDT" },
        actionKey: `0x${"a".repeat(40)}`,
      },
    });
    const vector = validVector("problem-round-active", "PlayProblem").input;
    expect(problem.status).toBe(vector["status"]);
    expect(problem.contentType).toBe("application/problem+json");
    expect(problem.body).toEqual(vector);
  });

  test("decodes request bodies strictly", async ({ page, fakePlayApi }) => {
    const unknownField = await call(page, "/play/v1/sessions:redeem", {
      body: { launchCode: fakePlayApi.launchCode, extra: true },
    });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body).toMatchObject({ code: "INVALID_ARGUMENT" });
    const token = await openSession(page, fakePlayApi);
    const bodyOnRefresh = await call(page, "/play/v1/sessions:refresh", {
      token,
      body: {},
    });
    // The refresh lists no 400: the fake does not invent one, it fails the
    // call as an unscripted one (500, which every operation lists).
    expect(bodyOnRefresh.status).toBe(500);
    expect(fakePlayApi.takeUnexpected()).toEqual([
      "refreshPlayToken: a body the document does not accept, and it lists no 400",
    ]);
  });

  test("refreshes the token and revokes the older ones", async ({
    page,
    fakePlayApi,
  }) => {
    const first = await openSession(page, fakePlayApi);
    const second = tokenOf(
      await call(page, "/play/v1/sessions:refresh", { token: first }),
    );
    const third = tokenOf(
      await call(page, "/play/v1/sessions:refresh", { token: second }),
    );
    expect(new Set([first, second, third]).size).toBe(3);
    expect(
      (await call(page, "/play/v1/sessions:refresh", { token: first })).status,
    ).toBe(401);
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    expect(
      (await call(page, "/play/v1/snapshot", { method: "GET", token: second }))
        .status,
    ).toBe(200);
    expect(fakePlayApi.secrets().map(secret => secret.label)).toEqual([
      "launch code",
      "play token 0",
      "play token 1",
      "play token 2",
    ]);
  });
});
