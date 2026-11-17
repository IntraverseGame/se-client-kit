import type { Page } from "@playwright/test";

import { FAKE_TOKEN_LIFETIME_MS } from "./harness/fake-play-time.ts";
import type { FakePlayApi, Served } from "./harness/fake-play-types.ts";
import type { Answer } from "./harness/fake-play-wire.ts";
import { expect, test } from "./harness/fixtures.ts";
import { FAKE_NOW } from "./harness/origins.ts";
import {
  PLAY_ROUTES,
  type PlayOperationId,
} from "./harness/play-api-document.ts";
import {
  coverHeading,
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

type PageCall = {
  readonly path: string;
  readonly at: number;
};

const REFRESH_FRACTION = 1 / 3;
const REFRESH_MARGIN_MS = 60_000;
const RETURN_DEBOUNCE_MS = 1_000;
const DEVICE_LAG_MS = 2_833_000;
const OPENED_AT = FAKE_NOW.getTime() - DEVICE_LAG_MS;
const INSTALL_LEAD_MS = 60_000;
const SHORT_LIFETIME_MS = 2 * 60_000;
const STEP_MS = 2_000;
const AN_HOUR_MS = 60 * 60_000;
const REFRESH = PLAY_ROUTES.refreshPlayToken.path;
const READ = PLAY_ROUTES.getSnapshot.path;
const OPENING_CALLS: readonly PlayOperationId[] = [
  "redeemLaunchCode",
  "getSnapshot",
];

const UNANSWERED: readonly (readonly [string, Answer<"refreshPlayToken">])[] = [
  ["never answered", { kind: "hang" }],
  [
    "answered UNAVAILABLE (retryable)",
    { kind: "problem", vector: "problem-default-code-unavailable" },
  ],
];

const refreshPoint = (issuedAt: number, lifetimeMs: number): number =>
  Math.floor(
    issuedAt +
      lifetimeMs -
      Math.max(REFRESH_FRACTION * lifetimeMs, REFRESH_MARGIN_MS),
  );

const pageNow = (page: Page): Promise<number> =>
  page.evaluate(() => Date.now());

const jumpTo = async (page: Page, at: number): Promise<void> => {
  await page.clock.runFor(at - (await pageNow(page)));
};

const runInSteps = async (page: Page, ms: number): Promise<void> => {
  if (ms <= 0) return;
  const step = Math.min(STEP_MS, ms);
  await page.clock.runFor(step);
  await runInSteps(page, ms - step);
};

const stepTo = async (page: Page, at: number): Promise<void> => {
  await runInSteps(page, at - (await pageNow(page)));
};

const returnToPage = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(RETURN_DEBOUNCE_MS);
};

const recordPageCalls = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const calls: PageCall[] = [];
    const send = globalThis.fetch.bind(globalThis);
    Reflect.set(globalThis, "pageCalls", calls);
    Reflect.set(
      globalThis,
      "fetch",
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = input instanceof Request ? input.url : input;
        calls.push({
          path: new URL(url, location.href).pathname,
          at: Date.now(),
        });
        return send(input, init);
      },
    );
  });

const isPageCall = (value: unknown): value is PageCall =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "path") === "string" &&
  typeof Reflect.get(value, "at") === "number";

const pageCalls = async (page: Page): Promise<readonly PageCall[]> => {
  const calls: unknown = await page.evaluate(() =>
    Reflect.get(globalThis, "pageCalls"),
  );
  return Array.isArray(calls)
    ? calls.filter((call: unknown): call is PageCall => isPageCall(call))
    : [];
};

const refreshes = (fake: FakePlayApi): readonly Served[] =>
  servedFor(fake, "refreshPlayToken");

const operations = (
  fake: FakePlayApi,
): readonly (PlayOperationId | undefined)[] =>
  fake.served.map(entry => entry.operationId);

const openSession = async (page: Page, fake: FakePlayApi): Promise<void> => {
  fake.answerEvery("getSnapshot", {
    kind: "snapshot",
    vector: "coinflip-idle",
  });
  await page.clock.install({ time: OPENED_AT - INSTALL_LEAD_MS });
  await page.clock.pauseAt(OPENED_AT);
  await launch(page, fake);
  await expect(statusHeading(page)).toHaveText(TEXT.idle);
  await recordPageCalls(page);
};

const expectEndedAndSilent = async (
  page: Page,
  fake: FakePlayApi,
): Promise<readonly PageCall[]> => {
  await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
  await expect(page.getByRole("button", { name: TEXT.placeBet })).toHaveCount(
    0,
  );
  const calls = await pageCalls(page);
  const served = fake.served.length;
  await page.clock.runFor(AN_HOUR_MS);
  await returnToPage(page);
  await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
  expect(await pageCalls(page)).toEqual(calls);
  expect(fake.served).toHaveLength(served);
  return calls;
};

test.describe("T-36: the play token's lifecycle", () => {
  test("refreshes once at its point with the old token; later calls carry the new one, and the next refresh follows the new deadline", async ({
    page,
    fakePlayApi,
  }) => {
    await openSession(page, fakePlayApi);
    const firstAt = refreshPoint(OPENED_AT, FAKE_TOKEN_LIFETIME_MS);
    fakePlayApi.advanceServerTime(firstAt - OPENED_AT);
    fakePlayApi.setTokenLifetime(SHORT_LIFETIME_MS);
    await jumpTo(page, firstAt);
    expect(await pageCalls(page)).toEqual([{ path: REFRESH, at: firstAt }]);
    await expect
      .poll(() => operations(fakePlayApi))
      .toEqual([...OPENING_CALLS, "refreshPlayToken"]);
    expect(refreshes(fakePlayApi)[0]).toMatchObject({
      authorized: true,
      tokenIndex: 0,
    });

    const secondAt = refreshPoint(firstAt, SHORT_LIFETIME_MS);
    const returnedAt = firstAt + (secondAt - firstAt) / 2;
    await stepTo(page, returnedAt);
    await returnToPage(page);
    await expect
      .poll(() => operations(fakePlayApi))
      .toEqual([...OPENING_CALLS, "refreshPlayToken", "getSnapshot"]);
    expect(fakePlayApi.served.at(-1)).toMatchObject({
      authorized: true,
      tokenIndex: 1,
    });

    fakePlayApi.advanceServerTime(secondAt - firstAt);
    await stepTo(page, secondAt);
    expect(await pageCalls(page)).toEqual([
      { path: REFRESH, at: firstAt },
      { path: READ, at: returnedAt + RETURN_DEBOUNCE_MS },
      { path: REFRESH, at: secondAt },
    ]);
    await expect
      .poll(() => operations(fakePlayApi))
      .toEqual([
        ...OPENING_CALLS,
        "refreshPlayToken",
        "getSnapshot",
        "refreshPlayToken",
      ]);
    expect(refreshes(fakePlayApi)[1]).toMatchObject({
      authorized: true,
      tokenIndex: 1,
    });
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await expect(coverHeading(page)).toHaveCount(0);
  });

  for (const code of [
    "SESSION_REVOKED",
    "SESSION_EXPIRED",
    "UNAUTHENTICATED",
  ] as const) {
    test(`a refresh answered ${code} ends the session, and nothing is sent after`, async ({
      page,
      fakePlayApi,
    }) => {
      fakePlayApi.answer("refreshPlayToken", {
        kind: "own-problem",
        code,
        status: 401,
      });
      await openSession(page, fakePlayApi);
      const refreshAt = refreshPoint(OPENED_AT, FAKE_TOKEN_LIFETIME_MS);
      await jumpTo(page, refreshAt);
      expect(await expectEndedAndSilent(page, fakePlayApi)).toEqual([
        { path: REFRESH, at: refreshAt },
      ]);
      expect(operations(fakePlayApi)).toEqual([
        ...OPENING_CALLS,
        "refreshPlayToken",
      ]);
      expect(refreshes(fakePlayApi)[0]).toMatchObject({
        authorized: true,
        tokenIndex: 0,
      });
    });
  }

  for (const [failure, answer] of UNANSWERED) {
    test(`a refresh ${failure} until the deadline ends the session at the deadline, and nothing is sent after`, async ({
      page,
      fakePlayApi,
    }) => {
      fakePlayApi.answerEvery("refreshPlayToken", answer);
      await openSession(page, fakePlayApi);
      const refreshAt = refreshPoint(OPENED_AT, FAKE_TOKEN_LIFETIME_MS);
      const deadline = OPENED_AT + FAKE_TOKEN_LIFETIME_MS;
      await jumpTo(page, refreshAt);
      await stepTo(page, deadline - 1);
      await expect(statusHeading(page)).toHaveText(TEXT.idle);
      await expect(coverHeading(page)).toHaveCount(0);
      await jumpTo(page, deadline);
      const calls = await expectEndedAndSilent(page, fakePlayApi);
      expect(calls[0]).toEqual({ path: REFRESH, at: refreshAt });
      expect(calls.at(-1)?.at).toBeGreaterThan((refreshAt + deadline) / 2);
      expect(calls.filter(call => call.path !== REFRESH)).toEqual([]);
      expect(calls.filter(call => call.at >= deadline)).toEqual([]);
      expect(operations(fakePlayApi)).toEqual([
        ...OPENING_CALLS,
        ...calls.map((): PlayOperationId => "refreshPlayToken"),
      ]);
      expect(refreshes(fakePlayApi).map(call => call.tokenIndex)).toEqual(
        calls.map(() => 0),
      );
    });
  }
});
