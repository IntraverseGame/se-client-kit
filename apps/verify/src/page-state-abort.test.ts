// The page controller aborts a read that a newer one replaces (V-5), shows
// nothing for an `aborted` answer, and still drops a late answer of a replaced
// read. The abort reaches the checks that follow a found round too (V-12): the
// chain requests in flight end, and an aborted check run shows nothing.

import { describe, expect, it, vi } from "vitest";

import { fake } from "./chain-read-fake.ts";
import { ROUND_PATH, setup } from "./fixtures/page-controller.ts";
import {
  configFetch,
  CONFIG_URL,
  configDocument,
  evidence,
  ORIGIN,
  recordingView,
  report,
  ROUND_ID,
  stillClock,
} from "./fixtures/page.ts";
import { createVerifyPage } from "./page-state.ts";
import type { RoundReport } from "./round-report.ts";
import type { VerifyApi, VerifyApiResult } from "./verify-api.ts";

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

type PendingChecks = {
  readonly signal: AbortSignal;
  readonly finish: (report: RoundReport) => void;
};

const aborted = (): DOMException =>
  new DOMException("The chain read was aborted.", "AbortError");

/** A `verify` that stays pending until the test finishes it or it aborts. */
const holdChecks = (s: ReturnType<typeof setup>): PendingChecks[] => {
  const pending: PendingChecks[] = [];
  s.verify.mockImplementation(
    (_config, _evidence, _asked, signal) =>
      new Promise<RoundReport>((resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(aborted());
        });
        pending.push({ signal, finish: resolve });
      }),
  );
  return pending;
};

const checks = async (s: ReturnType<typeof setup>, count: number) => {
  await vi.waitFor(() => {
    expect(s.verify).toHaveBeenCalledTimes(count);
  });
};

describe("the checks of a found round are aborted with their read (V-5, V-12)", () => {
  it("passes the read's signal to the checks, standing until replaced", async () => {
    const s = setup({ path: ROUND_PATH, answers: [found, found] });
    const pending = holdChecks(s);
    const started = s.page.start();
    await checks(s, 1);
    expect(pending[0]?.signal.aborted).toBe(false);
    const retried = s.page.retry();
    await checks(s, 2);
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal).not.toBe(pending[0]?.signal);
    expect(pending[1]?.signal.aborted).toBe(false);
    pending[1]?.finish(report({ kind: "matches" }));
    await Promise.all([started, retried]);
  });

  it("shows nothing for the aborted checks, and the newer read stands", async () => {
    const s = setup({ path: ROUND_PATH, answers: [found, found] });
    const pending = holdChecks(s);
    const started = s.page.start();
    await checks(s, 1);
    const retried = s.page.retry();
    await checks(s, 2);
    await started;
    expect(s.view.last()).toEqual({ kind: "loading", roundId: ROUND_ID });
    pending[1]?.finish(report({ kind: "matches" }));
    await retried;
    expect(s.view.last()?.kind).toBe("report");
    const kinds = s.view.shown.map(x => x.state.kind);
    expect(kinds).not.toContain("api-error");
    expect(kinds).not.toContain("unreachable");
    expect(kinds.filter(kind => kind === "report")).toHaveLength(1);
  });

  it("aborts the checks when the address changes to the form", async () => {
    const s = setup({ path: ROUND_PATH, answers: [found] });
    const pending = holdChecks(s);
    const started = s.page.start();
    await checks(s, 1);
    await s.page.submit("not an id");
    expect(pending[0]?.signal.aborted).toBe(true);
    await started;
    expect(s.view.last()).toMatchObject({ kind: "form", error: true });
    expect(s.view.shown.map(x => x.state.kind)).not.toContain("api-error");
  });

  it("does not abort checks that finished when nothing replaces them", async () => {
    const s = setup({ path: ROUND_PATH, answers: [found] });
    const pending = holdChecks(s);
    const started = s.page.start();
    await checks(s, 1);
    pending[0]?.finish(report({ kind: "matches" }));
    await started;
    expect(pending[0]?.signal.aborted).toBe(false);
    expect(s.view.last()?.kind).toBe("report");
  });
});

const parkedPage = () => {
  const rpc = fake({
    "https://rpc1.example/eth": { park: true },
    "https://rpc2.example/eth": { park: true },
  });
  const send = rpc.deps.fetch;
  const net = configFetch(configDocument());
  const view = recordingView();
  const readRound = vi.fn<VerifyApi["readRound"]>(() =>
    Promise.resolve<VerifyApiResult>({ kind: "found", evidence: evidence() }),
  );
  const page = createVerifyPage(
    {
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === CONFIG_URL
          ? net.fetch(input)
          : send(input, init)) as typeof fetch,
      clock: stillClock,
      origin: ORIGIN,
      configUrl: CONFIG_URL,
      location: {
        pathname: () => ROUND_PATH,
        push: () => {},
        assign: () => {},
      },
      isOffline: () => false,
      api: () => ({ readRound }),
    },
    view,
  );
  return { rpc, view, page };
};

const inFlight = async (
  rpc: ReturnType<typeof parkedPage>["rpc"],
  n: number,
) => {
  await vi.waitFor(() => {
    expect(rpc.requests.length).toBeGreaterThanOrEqual(n);
  });
};

describe("the chain requests of the default checks are aborted (V-5, V-12)", () => {
  it("aborts them when a newer read starts, and shows nothing for them", async () => {
    const { rpc, view, page } = parkedPage();
    const started = page.start();
    await inFlight(rpc, 4);
    const first = [...rpc.signals];
    expect(first.every(signal => signal?.aborted === false)).toBe(true);
    const retried = page.retry();
    await inFlight(rpc, 8);
    expect(first.every(signal => signal?.aborted === true)).toBe(true);
    expect(
      rpc.signals.slice(4).every(signal => signal?.aborted === false),
    ).toBe(true);
    await started;
    expect(view.last()).toEqual({ kind: "loading", roundId: ROUND_ID });
    await page.submit("not an id");
    await retried;
    expect(rpc.signals.every(signal => signal?.aborted === true)).toBe(true);
    const kinds = view.shown.map(x => x.state.kind);
    expect(kinds).not.toContain("report");
    expect(kinds).not.toContain("api-error");
    expect(kinds.at(-1)).toBe("form");
  });

  it("aborts them when the form replaces the read", async () => {
    const { rpc, view, page } = parkedPage();
    const started = page.start();
    await inFlight(rpc, 4);
    await page.submit("not an id");
    expect(rpc.signals.every(signal => signal?.aborted === true)).toBe(true);
    await started;
    expect(view.shown.map(x => x.state.kind)).toEqual([
      "starting",
      "loading",
      "form",
    ]);
  });
});
