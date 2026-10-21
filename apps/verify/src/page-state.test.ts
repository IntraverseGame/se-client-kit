// The page's controller (V-3 to V-11): which state each answer gives, that an
// invalid configuration or round id makes no request, that focus moves only
// after the player's own action (V-14), and that a stale read never shows.

import { describe, expect, it, vi } from "vitest";

import { ROUND_PATH, setup } from "./fixtures/page-controller.ts";
import {
  configDocument,
  evidence,
  ORIGIN,
  report,
  ROUND_ID,
} from "./fixtures/page.ts";
import type { VerifyApiResult } from "./verify-api.ts";

const EVIDENCE = evidence();
const found: VerifyApiResult = { kind: "found", evidence: EVIDENCE };
const noAnswer = (): void => {
  // Not answered yet.
};

describe("no round id (V-4)", () => {
  it("shows the empty form at the base path, without focus", async () => {
    const s = setup({ path: "/verify/" });
    await s.page.start();
    expect(s.view.shown.at(-1)).toEqual({
      state: { kind: "form", text: "", error: false },
      focus: false,
    });
  });

  it("shows the form at /rounds/ with no id", async () => {
    const s = setup({ path: "/verify/rounds/" });
    await s.page.start();
    expect(s.view.last()).toEqual({ kind: "form", text: "", error: false });
  });

  it("shows a path's id that is not a round id in the field, with the error, and asks nothing", async () => {
    const s = setup({ path: "/verify/rounds/not-an-id" });
    await s.page.start();
    expect(s.view.last()).toEqual({
      kind: "form",
      text: "not-an-id",
      error: true,
    });
    expect(s.readRound).not.toHaveBeenCalled();
  });

  it("keeps a refused input in the form with its error, and asks nothing", async () => {
    const s = setup();
    await s.page.start();
    await s.page.submit("01927c5e-8b3a-4f21-9c4d-5e6f7a8b9c0d");
    expect(s.view.last()).toEqual({
      kind: "form",
      text: "01927c5e-8b3a-4f21-9c4d-5e6f7a8b9c0d",
      error: true,
    });
    expect(s.readRound).not.toHaveBeenCalled();
    expect(s.pushed).toEqual([]);
  });

  it("normalizes a valid input, navigates to its URL, and reads it with focus", async () => {
    const s = setup({ answers: [found] });
    await s.page.start();
    await s.page.submit(`  ${ROUND_ID.toUpperCase()} \n`);
    expect(s.pushed).toEqual([`${ORIGIN}/verify/rounds/${ROUND_ID}`]);
    expect(s.readRound).toHaveBeenCalledWith(ROUND_ID, expect.anything());
    expect(s.view.shown.slice(-2)).toEqual([
      { state: { kind: "loading", roundId: ROUND_ID }, focus: true },
      {
        state: { kind: "report", report: report({ kind: "matches" }) },
        focus: true,
      },
    ]);
  });

  it("adds no history entry for the round already in the address", async () => {
    const s = setup({
      path: ROUND_PATH,
      answers: [{ kind: "not-found" }, found],
    });
    await s.page.start();
    await s.page.submit(ROUND_ID);
    expect(s.pushed).toEqual([]);
    expect(s.readRound).toHaveBeenCalledTimes(2);
  });

  it("loads the page when verifyBaseUrl is on another origin", async () => {
    const s = setup({
      document: configDocument({
        verifyBaseUrl: "https://verify.example/verify",
      }),
      path: "/",
    });
    await s.page.start();
    await s.page.submit(ROUND_ID);
    expect(s.assigned).toEqual([
      `https://verify.example/verify/rounds/${ROUND_ID}`,
    ]);
    expect(s.readRound).not.toHaveBeenCalled();
  });
});

describe("a round's URL (V-5 to V-11)", () => {
  it("shows loading, then the report, without moving focus on its own", async () => {
    const s = setup({ path: ROUND_PATH, answers: [found] });
    await s.page.start();
    expect(s.view.shown.map(x => [x.state.kind, x.focus])).toEqual([
      ["starting", false],
      ["loading", false],
      ["report", false],
    ]);
    expect(s.verify).toHaveBeenCalledWith(
      expect.objectContaining({ verifyApiBaseUrl: `${ORIGIN}/verify/v1` }),
      EVIDENCE,
      ROUND_ID,
      expect.any(AbortSignal),
    );
  });

  it.each([
    [{ kind: "not-found" }, { kind: "not-found", roundId: ROUND_ID }],
    [{ kind: "error" }, { kind: "api-error", roundId: ROUND_ID }],
    [
      { kind: "unreachable" },
      { kind: "unreachable", roundId: ROUND_ID, offline: false },
    ],
  ] as const)("maps %o to its state", async (answer, state) => {
    const s = setup({ path: ROUND_PATH, answers: [answer] });
    await s.page.start();
    expect(s.view.last()).toEqual(state);
    expect(s.verify).not.toHaveBeenCalled();
  });

  it("shows an API error when the checks throw, never staying on loading", async () => {
    const s = setup({
      path: ROUND_PATH,
      answers: [found],
      verifyThrows: true,
    });
    await expect(s.page.start()).resolves.toBeUndefined();
    expect(s.view.last()).toEqual({ kind: "api-error", roundId: ROUND_ID });
  });

  it("shows an API error when the API port throws", async () => {
    const s = setup({ path: ROUND_PATH });
    s.readRound.mockRejectedValueOnce(new Error("boom"));
    await s.page.start();
    expect(s.view.last()).toEqual({ kind: "api-error", roundId: ROUND_ID });
  });

  it("says the browser is offline when it reports so (V-11)", async () => {
    const s = setup({
      path: ROUND_PATH,
      answers: [{ kind: "unreachable" }],
      offline: true,
    });
    await s.page.start();
    expect(s.view.last()).toEqual({
      kind: "unreachable",
      roundId: ROUND_ID,
      offline: true,
    });
  });

  it("tries again on the same round, with focus", async () => {
    const s = setup({
      path: ROUND_PATH,
      answers: [{ kind: "error" }, found],
    });
    await s.page.start();
    await s.page.retry();
    expect(s.readRound).toHaveBeenCalledTimes(2);
    expect(s.view.shown.slice(-2).map(x => [x.state.kind, x.focus])).toEqual([
      ["loading", true],
      ["report", true],
    ]);
  });

  it("does nothing on retry from the form", async () => {
    const s = setup();
    await s.page.start();
    await s.page.retry();
    expect(s.readRound).not.toHaveBeenCalled();
  });

  it("drops a read that a newer one replaced", async () => {
    const s = setup({ path: ROUND_PATH });
    let first: (r: VerifyApiResult) => void = noAnswer;
    s.readRound
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            first = resolve;
          }),
      )
      .mockImplementationOnce(() => Promise.resolve({ kind: "not-found" }));
    const started = s.page.start();
    await vi.waitFor(() => {
      expect(s.readRound).toHaveBeenCalledTimes(1);
    });
    await s.page.retry();
    first(found);
    await started;
    expect(s.view.last()).toEqual({ kind: "not-found", roundId: ROUND_ID });
    expect(s.verify).not.toHaveBeenCalled();
  });

  it("follows the address on back and forward, without focus", async () => {
    const s = setup({ path: ROUND_PATH, answers: [found] });
    await s.page.start();
    s.pushed.length = 0;
    await s.page.submit("not an id");
    expect(s.view.last()).toMatchObject({ kind: "form", error: true });
    await s.page.route();
    expect(s.view.shown.at(-1)?.focus).toBe(false);
  });
});
