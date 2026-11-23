// VT-16: check 9 in a round's run and verdict (V-22). The vendored
// `valid/coinflip-active-key-delegation` vector's round, written as the verify
// API's body, carries the delegation: check 9 runs after checks 1 to 7, a
// mismatch makes the round V-7's, it does not wait for the round's end, and it
// runs for a round the page cannot otherwise recompute. A round without a
// delegation has no check 9.

import { describe, expect, it } from "vitest";

import type { CheckId } from "./check-result.ts";
import {
  at,
  chainDeps,
  configFor,
  evidenceOf,
  ROUND_ID,
  RPC_URLS,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";
import type { RoundReport } from "./round-report.ts";
import { verifyRound } from "./verify-round.ts";

const HASH = `0x${"ab".repeat(32)}`;
const config = configFor(signatureVector("create-round-auth-accept").pinned);

/** The delegated round as `status`, without reveals. */
const delegated = (status: string): Record<string, unknown> => {
  const snapshot = validSnapshot("coinflip-active-key-delegation");
  snapshot["status"] = status;
  return snapshot;
};

const run = async (snapshot: unknown): Promise<RoundReport> =>
  verifyRound(
    chainDeps(Object.fromEntries(RPC_URLS.map(url => [url, { hash: HASH }]))),
    config,
    await evidenceOf(snapshot),
    ROUND_ID,
  );

const ids = (report: RoundReport): readonly CheckId[] =>
  report.checks.map(c => c.id);
const check9 = (report: RoundReport) => report.checks.find(c => c.id === 9);

describe("check 9 in a round's run (V-22)", () => {
  it("runs after checks 1 to 7, and the round matches", async () => {
    const report = await run(delegated("canceled"));
    expect(ids(report)).toEqual([1, 2, 3, 4, 5, 6, 7, 9]);
    expect(check9(report)?.status).toBe("matches");
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it("has no check 9 for a round without a delegation", async () => {
    const snapshot = validSnapshot("coinflip-active-ready-hash");
    snapshot["status"] = "canceled";
    const report = await run(snapshot);
    expect(ids(report)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it("makes the round V-7's when it fails", async () => {
    const snapshot = delegated("canceled");
    at(snapshot, "proofs.keyDelegation")["acceptedAt"] = 1_795_000_000;
    const report = await run(snapshot);
    expect(check9(report)?.status).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [9] });
  });

  it("does not wait for the end of a round that has not ended", async () => {
    const snapshot = delegated("active");
    at(snapshot, "proofs.keyDelegation")["wallet"] = `0x${"99".repeat(20)}`;
    const report = await run(snapshot);
    expect(check9(report)?.status).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [9] });
  });

  it("matches on a round that has not ended, which stays V-8's", async () => {
    const report = await run(delegated("active"));
    expect(check9(report)?.status).toBe("matches");
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "not-ended",
    });
  });

  it("runs for a round of a shape the page does not recompute", async () => {
    const snapshot = delegated("canceled");
    at(snapshot, "config")["steps"] = [
      { index: 0, optionCount: 3, multiplier: 1.45 },
    ];
    const report = await run(snapshot);
    expect(check9(report)?.status).toBe("matches");
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "unsupported-shape",
    });
  });

  it("waits for item 3 on a round not bound yet, checking the rest", async () => {
    const snapshot = delegated("starting");
    const proofs = at(snapshot, "proofs");
    Reflect.deleteProperty(proofs, "createRoundAuth");
    const report = await run(snapshot);
    expect(check9(report)?.status).toBe("matches");
    expect(check9(report)?.delegation?.unchecked).toHaveLength(1);
  });
});
