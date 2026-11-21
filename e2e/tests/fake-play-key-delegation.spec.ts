// T-43, the fake Play API's side: it decodes a start that carries the vendored
// accepted vector's `keyDelegation` as the document does (an unknown or a
// missing field in it, or a value that is not an object, is a 400
// `INVALID_ARGUMENT`; a `null` is the same as leaving it out), and it can
// script each code the backend answers a refused delegation with, and a 409
// `CONFLICT`. The calls are made by a page with `fetch`, as the Wrapper makes
// them.

import { expect, test } from "./harness/fixtures.ts";
import {
  acceptedKeyDelegation,
  refusalCodes,
} from "./harness/key-delegation-vectors.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { call, openSession } from "./harness/play-calls.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

const START = {
  idempotencyKey: "0192e4b0-0000-7000-8000-0000000000d1",
  bet: { value: "100", unit: "USDT" },
  actionKey: `0x${"a".repeat(40)}`,
};

test.describe("the fake Play API and a delegated start (T-43)", () => {
  test("decodes the vendored keyDelegation, or a null one, as the document does", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    const keyDelegation = acceptedKeyDelegation();
    fakePlayApi.answerEvery("startRound", {
      kind: "snapshot",
      vector: "coinflip-starting",
    });
    const delegated = await call(page, "/play/v1/rounds:start", {
      token,
      body: { ...START, keyDelegation },
    });
    expect(delegated.status).toBe(200);
    expect(fakePlayApi.served.at(-1)?.body).toEqual({
      ...START,
      keyDelegation,
    });
    const nulled = await call(page, "/play/v1/rounds:start", {
      token,
      body: { ...START, keyDelegation: null },
    });
    expect(nulled.status).toBe(200);
  });

  test("refuses a keyDelegation the document does not accept", async ({
    page,
    fakePlayApi,
  }) => {
    const token = await openSession(page, fakePlayApi);
    const keyDelegation = acceptedKeyDelegation();
    const { signature: _signature, ...unsigned } = keyDelegation;
    const refused = await Promise.all(
      [
        { ...keyDelegation, extra: true },
        unsigned,
        keyDelegation.signature,
        [keyDelegation],
      ].map(value =>
        call(page, "/play/v1/rounds:start", {
          token,
          body: { ...START, keyDelegation: value },
        }),
      ),
    );
    expect(refused.map(({ status }) => status)).toEqual([400, 400, 400, 400]);
    for (const { body } of refused) {
      expect(body).toMatchObject({ code: "INVALID_ARGUMENT" });
    }
    // A 400 the start lists is the document's answer, not an unscripted call.
    expect(fakePlayApi.takeUnexpected()).toEqual([]);
  });

  test("reads the three codes from the refused vectors", () => {
    expect(refusalCodes().toSorted()).toEqual([
      "KEY_DELEGATION_EXPIRED",
      "KEY_DELEGATION_INVALID",
      "KEY_DELEGATION_NOTICE_UNKNOWN",
    ]);
  });

  for (const { code, status } of [
    ...refusalCodes().map(refused => ({ code: refused, status: 422 })),
    { code: "CONFLICT" as const, status: 409 },
  ]) {
    test(`scripts a ${String(status)} ${code} to a delegated start`, async ({
      page,
      fakePlayApi,
    }) => {
      const token = await openSession(page, fakePlayApi);
      fakePlayApi.answer("startRound", { kind: "own-problem", code, status });
      const answered = await call(page, "/play/v1/rounds:start", {
        token,
        body: { ...START, keyDelegation: acceptedKeyDelegation() },
      });
      expect(answered.status).toBe(status);
      expect(answered.contentType).toBe("application/problem+json");
      expect(answered.body).toMatchObject({ code, status, retryable: false });
    });
  }
});
