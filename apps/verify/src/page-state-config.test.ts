// The controller's configuration step (V-3): an invalid configuration makes
// no round request and offers no retry; a configuration that could not be
// fetched or read offers one, and the retry starts again, with focus.

import { describe, expect, it } from "vitest";

import {
  flakyConfigFetch,
  ROUND_PATH,
  setup,
} from "./fixtures/page-controller.ts";
import {
  configDocument,
  CONFIG_URL,
  evidence,
  ROUND_ID,
} from "./fixtures/page.ts";
import type { VerifyApiResult } from "./verify-api.ts";

const found: VerifyApiResult = { kind: "found", evidence: evidence() };

describe("configuration (V-3)", () => {
  it("shows starting, then the configuration error, and asks for nothing else", async () => {
    const s = setup({
      document: configDocument({ verifyApiBaseUrl: undefined }),
    });
    await s.page.start();
    expect(s.view.shown.map(x => x.state.kind)).toEqual([
      "starting",
      "config-error",
    ]);
    expect(s.view.last()).toEqual({ kind: "config-error", retryable: false });
    expect(s.urls).toEqual([CONFIG_URL]);
    expect(s.readRound).not.toHaveBeenCalled();
  });

  it.each([
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
    [
      "an unreadable answer",
      () => Promise.resolve(new Response("", { status: 500 })),
    ],
  ] as const)(
    "offers a retry after %s, and it starts again",
    async (_n, fail) => {
      const flaky = flakyConfigFetch(fail);
      const s = setup({
        fetch: flaky.fetch,
        path: ROUND_PATH,
        answers: [found],
      });
      await s.page.start();
      expect(s.view.last()).toEqual({ kind: "config-error", retryable: true });
      flaky.recover();
      await s.page.retry();
      expect(s.view.shown.map(x => [x.state.kind, x.focus])).toEqual([
        ["starting", false],
        ["config-error", false],
        ["starting", true],
        ["loading", true],
        ["report", true],
      ]);
    },
  );

  it("does nothing on retry after an invalid configuration", async () => {
    const s = setup({
      document: configDocument({ verifyApiBaseUrl: undefined }),
    });
    await s.page.start();
    await s.page.retry();
    expect(s.view.shown).toHaveLength(2);
    expect(s.urls).toEqual([CONFIG_URL]);
  });

  it("ignores a submit before the configuration is read", async () => {
    const s = setup({ document: "not a document" });
    await s.page.start();
    await s.page.submit(ROUND_ID);
    expect(s.readRound).not.toHaveBeenCalled();
    expect(s.pushed).toEqual([]);
  });
});
