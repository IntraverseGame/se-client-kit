// The page controller aborts a read that a newer one replaces (V-5), shows
// nothing for an `aborted` answer, and still drops a late answer of a replaced
// read.

import { describe, expect, it, vi } from "vitest";

import { ROUND_PATH, setup } from "./fixtures/page-controller.ts";
import { evidence, ROUND_ID } from "./fixtures/page.ts";
import type { VerifyApiResult } from "./verify-api.ts";

const found: VerifyApiResult = { kind: "found", evidence: evidence() };

type Pending = {
  readonly signal: AbortSignal;
  readonly answer: (result: VerifyApiResult) => void;
};

/** A `readRound` that stays pending until the test answers it. */
const hold = (s: ReturnType<typeof setup>): Pending[] => {
  const pending: Pending[] = [];
  s.readRound.mockImplementation(
    (_roundId, signal) =>
      new Promise<VerifyApiResult>(resolve => {
        pending.push({ signal: signal as AbortSignal, answer: resolve });
      }),
  );
  return pending;
};

const reads = async (s: ReturnType<typeof setup>, count: number) => {
  await vi.waitFor(() => {
    expect(s.readRound).toHaveBeenCalledTimes(count);
  });
};

describe("a read replaced by a newer one (V-5)", () => {
  it("gives each read a signal that stands until it is replaced", async () => {
    const s = setup({ path: ROUND_PATH });
    const pending = hold(s);
    const started = s.page.start();
    await reads(s, 1);
    expect(pending[0]?.signal.aborted).toBe(false);
    const retried = s.page.retry();
    await reads(s, 2);
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal.aborted).toBe(false);
    pending[0]?.answer({ kind: "aborted" });
    pending[1]?.answer({ kind: "not-found" });
    await Promise.all([started, retried]);
  });

  it("shows nothing for the aborted read, and the newer read's answer stands", async () => {
    const s = setup({ path: ROUND_PATH });
    const pending = hold(s);
    const started = s.page.start();
    await reads(s, 1);
    const retried = s.page.retry();
    await reads(s, 2);
    pending[0]?.answer({ kind: "aborted" });
    await started;
    expect(s.view.last()).toEqual({ kind: "loading", roundId: ROUND_ID });
    pending[1]?.answer({ kind: "not-found" });
    await retried;
    expect(s.view.last()).toEqual({ kind: "not-found", roundId: ROUND_ID });
    expect(s.view.shown.map(x => x.state.kind)).not.toContain("api-error");
    expect(s.view.shown.map(x => x.state.kind)).not.toContain("unreachable");
  });

  it("drops an answer that arrives from a replaced read anyway", async () => {
    const s = setup({ path: ROUND_PATH });
    const pending = hold(s);
    const started = s.page.start();
    await reads(s, 1);
    const retried = s.page.retry();
    await reads(s, 2);
    pending[1]?.answer({ kind: "not-found" });
    await retried;
    pending[0]?.answer(found);
    await started;
    expect(s.view.last()).toEqual({ kind: "not-found", roundId: ROUND_ID });
    expect(s.verify).not.toHaveBeenCalled();
  });

  it("aborts the read when the address changes to the form", async () => {
    const s = setup({ path: ROUND_PATH });
    const pending = hold(s);
    const started = s.page.start();
    await reads(s, 1);
    await s.page.submit("not an id");
    expect(pending[0]?.signal.aborted).toBe(true);
    pending[0]?.answer({ kind: "aborted" });
    await started;
    expect(s.view.last()).toMatchObject({ kind: "form", error: true });
  });

  it("does not abort a read that has finished when nothing replaces it", async () => {
    const s = setup({ path: ROUND_PATH });
    const pending = hold(s);
    const started = s.page.start();
    await reads(s, 1);
    pending[0]?.answer(found);
    await started;
    expect(pending[0]?.signal.aborted).toBe(false);
    expect(s.view.last()?.kind).toBe("report");
  });
});
