// The fake verify API's own tests (specs/verify-page.md, "The e2e fake of the
// verify API"): each answer it scripts, the canned rounds' shapes, and the fake
// RPC endpoints of check 6 as the page asks them. A page makes the calls with
// `fetch`, as the verify page does; the verify page itself is not loaded (its
// browser rows are verify-page.spec.ts).

import type { Page } from "@playwright/test";

import { ROUND_RPC_ENDPOINTS } from "./harness/environment-config.ts";
import { blockHash } from "./harness/fake-rpc.ts";
import { createFakeVerifyApi } from "./harness/fake-verify-api.ts";
import { PAGES_ORIGIN, WRAPPER_ORIGIN } from "./harness/origins.ts";
import { ROUND, ROUND_PINS } from "./harness/round-vector.ts";
import { expect, test } from "./harness/verify-page.ts";
import {
  matchingRound,
  notEndedRound,
  refusedRound,
  tamperedRound,
  unknownKernelRound,
  voidedRound,
  UNKNOWN_ROUND_ID,
  VERIFY_ROUND_ID,
} from "./harness/verify-rounds.ts";

test.use({ verifyApiBaseUrl: `${PAGES_ORIGIN}/verify/v1` });

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

type Read = {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
};

/** Reads `<base>/rounds/<roundId>` as the page does (a GET, no credentials). */
const read = (page: Page, roundId: string): Promise<Read> =>
  page.evaluate(
    async target => {
      const response = await fetch(target, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: await response.text(),
      };
    },
    `${PAGES_ORIGIN}/verify/v1/rounds/${encodeURIComponent(roundId)}`,
  );

test.describe("the fake verify API", () => {
  test("answers a scripted round with its body as JSON", async ({
    page,
    fakeVerifyApi,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    const result = await read(page, VERIFY_ROUND_ID);
    expect(result).toMatchObject({
      status: 200,
      contentType: "application/json",
    });
    expect(JSON.parse(result.body)).toMatchObject({
      roundId: VERIFY_ROUND_ID,
      status: "canceled",
    });
    expect(fakeVerifyApi.reads()).toEqual([
      { roundId: VERIFY_ROUND_ID, answered: "round" },
    ]);
  });

  test("answers not found for an id it has no answer for", async ({
    page,
    fakeVerifyApi,
  }) => {
    const result = await read(page, UNKNOWN_ROUND_ID);
    expect(result.status).toBe(404);
    expect(fakeVerifyApi.reads()).toEqual([
      { roundId: UNKNOWN_ROUND_ID, answered: "not-found" },
    ]);
  });

  test("answers a scripted error status and a body that is not JSON", async ({
    page,
    fakeVerifyApi,
  }) => {
    fakeVerifyApi.answer(
      VERIFY_ROUND_ID,
      { kind: "error", status: 503 },
      { kind: "unreadable" },
    );
    expect((await read(page, VERIFY_ROUND_ID)).status).toBe(503);
    const unreadable = await read(page, VERIFY_ROUND_ID);
    expect(unreadable.status).toBe(200);
    expect(() => JSON.parse(unreadable.body)).toThrow();
  });

  test("uses queued answers once, then the standing one", async ({
    page,
    fakeVerifyApi,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    fakeVerifyApi.answer(VERIFY_ROUND_ID, { kind: "error", status: 500 });
    expect((await read(page, VERIFY_ROUND_ID)).status).toBe(500);
    expect((await read(page, VERIFY_ROUND_ID)).status).toBe(200);
  });

  test("aborts the request when the API is unreachable", async ({
    page,
    fakeVerifyApi,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, { kind: "abort" });
    await expect(read(page, VERIFY_ROUND_ID)).rejects.toThrow();
    expect(fakeVerifyApi.reads()).toEqual([
      { roundId: VERIFY_ROUND_ID, answered: "abort" },
    ]);
  });

  test("records a call it does not know and refuses it", async ({
    context,
    page,
  }) => {
    // Its own fake, on another base: the fixture's fails a test that made an
    // unexpected call, and this test makes one on purpose.
    const fake = createFakeVerifyApi({
      baseUrl: `${PAGES_ORIGIN}/other/verify/v1`,
    });
    await fake.install(context);
    const statuses = await page.evaluate(async origin => {
      const base = `${origin}/other/verify/v1`;
      const post = await fetch(`${base}/rounds/x`, { method: "POST" });
      const extra = await fetch(`${base}/rounds/x/y`);
      const other = await fetch(`${base}/health`);
      return [post.status, extra.status, other.status];
    }, PAGES_ORIGIN);
    expect(statuses).toEqual([400, 400, 400]);
    expect(fake.unexpected()).toEqual([
      "POST /other/verify/v1/rounds/x",
      "GET /other/verify/v1/rounds/x/y",
      "GET /other/verify/v1/health",
    ]);
    expect(fake.reads()).toEqual([]);
  });
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The dotted paths whose leaf values differ between two JSON values. */
const changedPaths = (
  before: unknown,
  after: unknown,
  path = "",
): readonly string[] => {
  if (isObject(before) && isObject(after)) {
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap(key =>
      changedPaths(
        before[key],
        after[key],
        path === "" ? key : `${path}.${key}`,
      ),
    );
  }
  return Object.is(before, after) ? [] : [path];
};

test.describe("the canned rounds", () => {
  test("hold the vendored round, as the verify API document's fields", () => {
    const round = matchingRound();
    expect(round).toMatchObject({
      roundId: VERIFY_ROUND_ID,
      status: "canceled",
    });
    expect(notEndedRound()["status"]).toBe("active");
    expect(unknownKernelRound()["kernel"]).toMatchObject({ version: 2 });
    expect(voidedRound()).toMatchObject({
      status: "idle",
      voidReason: "ENTROPY_TIMEOUT",
    });
    expect(refusedRound()).toMatchObject({ status: "idle" });
    expect(refusedRound()).not.toHaveProperty("voidReason");
    expect(refusedRound()).toHaveProperty("rejectCode");
  });

  test("a tampered round changes one field of the matching round (check 5: its two reveals)", () => {
    for (const check of [2, 3, 4, 6] as const) {
      const changed = changedPaths(matchingRound(), tamperedRound(check));
      expect(changed, `check ${check}`).toHaveLength(1);
    }
    // The matching round has no reveal; check 5's copy adds both of them.
    expect(changedPaths(matchingRound(), tamperedRound(5))).toEqual(["reveal"]);
    expect(
      Object.keys(tamperedRound(5)["reveal"] as object).toSorted(),
    ).toEqual(["roundSecret", "seed"]);
    expect(matchingRound()).toEqual(matchingRound());
  });
});

/** One JSON-RPC call to a fake endpoint, as the page makes it. */
const ask = (
  page: Page,
  url: string,
  method: string,
  params: readonly unknown[],
): Promise<{ readonly result?: Record<string, string> | string }> =>
  page.evaluate(
    async ({ url: target, method: name, params: values }) => {
      const response = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: name,
          params: values,
        }),
      });
      return (await response.json()) as {
        readonly result?: Record<string, string> | string;
      };
    },
    { url, method, params },
  );

test.describe("the fake RPC endpoints of check 6", () => {
  // The endpoints answer the Wrapper's origin (their CORS headers): call from
  // a document there (the bundle's 404 page is one).
  test.beforeEach(async ({ page }) => {
    await page.goto(`${WRAPPER_ORIGIN}/no-such-page`);
  });

  const [first, second] = ROUND_RPC_ENDPOINTS.map(({ url }) => url) as [
    string,
    string,
  ];
  const quantity = `0x${ROUND.blockNumber.toString(16)}`;

  test("agree on the chain id and on block N's hash", async ({
    page,
    verifyRpc,
  }) => {
    await Promise.all(
      [first, second].map(async url => {
        expect(await ask(page, url, "eth_chainId", [])).toEqual({
          jsonrpc: "2.0",
          id: 1,
          result: `0x${ROUND_PINS.entropyChainId.toString(16)}`,
        });
        const block = await ask(page, url, "eth_getBlockByNumber", [
          quantity,
          false,
        ]);
        expect(block.result).toMatchObject({
          hash: blockHash(ROUND.blockNumber, "a"),
        });
      }),
    );
    expect(verifyRpc.calls()).toHaveLength(4);
  });

  test("disagree when one endpoint gives another hash", async ({
    page,
    verifyRpc,
  }) => {
    verifyRpc.behave("p2", "other-hash");
    const a = await ask(page, first, "eth_getBlockByNumber", [quantity, false]);
    const b = await ask(page, second, "eth_getBlockByNumber", [
      quantity,
      false,
    ]);
    expect(a.result).toMatchObject({ hash: blockHash(ROUND.blockNumber, "a") });
    expect(b.result).toMatchObject({ hash: blockHash(ROUND.blockNumber, "b") });
  });
});
