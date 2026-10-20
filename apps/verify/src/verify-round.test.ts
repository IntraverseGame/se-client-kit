// VT-1b and the verdict (V-6 to V-8, V-12a): the verdict from the checks, and
// the checks of V-12 run end to end over vector rounds, with a fake JSON-RPC
// endpoint set for the chain read (check 6).

import { describe, expect, it } from "vitest";

import { type CheckId, type CheckResult, notChecked } from "./check-result.ts";
import {
  at,
  chainDeps,
  configFor,
  type EndpointReply,
  evidenceOf,
  ROUND_ID,
  RPC_URLS,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";
import { type RoundReport, verdictOf, verifyRound } from "./verify-round.ts";

const HASH_A = `0x${"ab".repeat(32)}`;
const HASH_B = `0x${"cd".repeat(32)}`;
const pinned = signatureVector("create-round-auth-accept").pinned;
const config = configFor(pinned);

const ok = (id: CheckId): CheckResult => ({
  id,
  title: `check ${String(id)}`,
  status: "matches",
  comparisons: [],
});
const failed = (id: CheckId): CheckResult => ({
  ...ok(id),
  status: "mismatch",
});
const unverified = (id: CheckId): CheckResult => ({
  ...ok(id),
  status: "unverified",
});
const ALL: readonly CheckId[] = [1, 2, 3, 4, 5, 6, 7];
const checksWith = (
  change: Partial<Record<CheckId, CheckResult>>,
): CheckResult[] => ALL.map(id => change[id] ?? ok(id));

/** A round with the ready evidence (`coinflip-active-ready-hash`), as `status`. */
const round = (status: string): Record<string, unknown> => {
  const snapshot = validSnapshot("coinflip-active-ready-hash");
  snapshot["status"] = status;
  return snapshot;
};

const agreeing = (hash: string): Record<string, EndpointReply> =>
  Object.fromEntries(RPC_URLS.map(url => [url, { hash }]));

const run = async (
  snapshot: unknown,
  replies: Record<string, EndpointReply> = agreeing(HASH_A),
): Promise<RoundReport> =>
  verifyRound(chainDeps(replies), config, await evidenceOf(snapshot), ROUND_ID);

const statusOf = (report: RoundReport, id: CheckId): string | undefined =>
  report.checks.find(c => c.id === id)?.status;

describe("verdictOf", () => {
  it("matches when every check passed", async () => {
    const evidence = await evidenceOf(round("won"));
    expect(verdictOf(evidence, checksWith({}))).toEqual({ kind: "matches" });
  });

  it("lists every failed check, in order, with an unverified check 6", async () => {
    const evidence = await evidenceOf(round("won"));
    const verdict = verdictOf(
      evidence,
      checksWith({ 7: failed(7), 2: failed(2), 6: unverified(6) }),
    );
    expect(verdict).toEqual({ kind: "mismatch", failed: [2, 6, 7] });
  });

  it("is chain-unverified when check 6 is the only failure", async () => {
    const evidence = await evidenceOf(round("lost"));
    expect(verdictOf(evidence, checksWith({ 6: unverified(6) }))).toEqual({
      kind: "chain-unverified",
    });
  });

  it("is not recomputable for a kernel version the page does not know", async () => {
    const snapshot = round("won");
    snapshot["kernelVersion"] = 2;
    const evidence = await evidenceOf(snapshot);
    expect(verdictOf(evidence, checksWith({}))).toEqual({
      kind: "not-recomputable",
      reason: "unknown-kernel",
    });
  });

  it("is not recomputable for a round that has not ended", async () => {
    const evidence = await evidenceOf(round("active"));
    expect(verdictOf(evidence, checksWith({}))).toEqual({
      kind: "not-recomputable",
      reason: "not-ended",
    });
  });

  it("is not recomputable for a round that is not one step of two options", async () => {
    const snapshot = round("won");
    at(snapshot, "config")["steps"] = [
      { index: 0, optionCount: 3, multiplier: 1.5 },
    ];
    const evidence = await evidenceOf(snapshot);
    expect(verdictOf(evidence, checksWith({}))).toEqual({
      kind: "not-recomputable",
      reason: "unsupported-shape",
    });
  });

  it.each(["voided", "refused"] as const)(
    "is not recomputable as %s, not as not ended, for an idle round that will not be played",
    async reason => {
      const evidence = await evidenceOf(round("idle"));
      expect(
        verdictOf({ ...evidence, closure: reason }, checksWith({})),
      ).toEqual({ kind: "not-recomputable", reason });
    },
  );

  it("still reports a failed check of a voided round before saying it was voided", async () => {
    const evidence = await evidenceOf(round("idle"));
    expect(
      verdictOf(
        { ...evidence, closure: "voided" },
        checksWith({ 3: failed(3) }),
      ),
    ).toEqual({ kind: "mismatch", failed: [3] });
  });

  it("treats a not-checked check as no failure", async () => {
    const evidence = await evidenceOf(round("canceled"));
    const checks = checksWith({ 5: notChecked(5, "n"), 7: notChecked(7, "n") });
    expect(verdictOf(evidence, checks)).toEqual({ kind: "matches" });
  });
});

describe("verifyRound", () => {
  it("runs checks 1 to 7, in order, for the asked id", async () => {
    const report = await run(round("canceled"));
    expect(report.roundId).toBe(ROUND_ID);
    expect(report.checks.map(c => c.id)).toEqual(ALL);
  });

  it("shows checks 5 and 7 as not checked for a canceled round without reveals", async () => {
    const report = await run(round("canceled"));
    expect(statusOf(report, 5)).toBe("not-checked");
    expect(statusOf(report, 7)).toBe("not-checked");
    expect(report.checks.find(c => c.id === 5)?.note).toMatch(/canceled/u);
    // The round still reaches V-6 on the checks that apply.
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it("runs no derivation for an unknown kernel version (V-12a)", async () => {
    const snapshot = round("won");
    snapshot["kernelVersion"] = 2;
    at(snapshot, "proofs.randomnessProof")["roundSecret"] = HASH_B;
    at(snapshot, "proofs.fairnessProof")["seed"] = HASH_B;
    const report = await run(snapshot);
    expect(statusOf(report, 5)).toBe("not-checked");
    expect(statusOf(report, 7)).toBe("not-checked");
    expect(report.checks.find(c => c.id === 5)?.comparisons).toEqual([]);
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "unknown-kernel",
    });
  });

  it("fails checks 5 and 7 for a won round without its round secret", async () => {
    const snapshot = round("won");
    at(snapshot, "proofs.fairnessProof")["seed"] = HASH_B;
    const report = await run(snapshot);
    expect(statusOf(report, 5)).toBe("mismatch");
    expect(statusOf(report, 7)).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [5, 7] });
  });

  it("lets checks wait for the end of a round that has not ended", async () => {
    const snapshot = round("active");
    delete at(snapshot, "proofs.fairnessProof")["readyHash"];
    const report = await run(snapshot, {
      [RPC_URLS[0] as string]: {},
      [RPC_URLS[1] as string]: {},
    });
    const four = report.checks.find(c => c.id === 4);
    expect(four?.status).toBe("not-checked");
    expect(four?.note).toMatch(/waits for the round's end/u);
    const six = report.checks.find(c => c.id === 6);
    expect(six?.status).toBe("not-checked");
    expect(six?.note).toMatch(/waits for the round's end/u);
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "not-ended",
    });
  });

  it.each([
    [
      "the endpoints disagree",
      {
        [RPC_URLS[0] as string]: { hash: HASH_A },
        [RPC_URLS[1] as string]: { hash: HASH_B },
      },
      /different hashes/u,
    ],
    [
      "an endpoint is on another chain",
      {
        [RPC_URLS[0] as string]: { hash: HASH_A, chainId: 5 },
        [RPC_URLS[1] as string]: { hash: HASH_A },
      },
      /another chain/u,
    ],
  ])(
    "A-2: does not wait when %s while the round runs",
    async (_n, replies, note) => {
      const report = await run(round("active"), replies);
      const six = report.checks.find(c => c.id === 6);
      expect(six?.status).toBe("unverified");
      expect(six?.note).toMatch(note);
      expect(report.verdict).toEqual({ kind: "chain-unverified" });
    },
  );

  it("keeps a present, differing value a mismatch while the round runs", async () => {
    const snapshot = round("active");
    at(snapshot, "proofs.fairnessProof")["readyHash"] = HASH_B;
    const report = await run(snapshot);
    expect(statusOf(report, 4)).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [4] });
  });

  it("shows check 6 as unverified when the endpoints disagree", async () => {
    const report = await run(round("canceled"), {
      [RPC_URLS[0] as string]: { hash: HASH_A },
      [RPC_URLS[1] as string]: { hash: HASH_B },
    });
    const six = report.checks.find(c => c.id === 6);
    expect(six?.status).toBe("unverified");
    expect(six?.note).toMatch(/different hashes/u);
    expect(six?.details).toEqual([
      { label: "p0: chain id", value: "1" },
      { label: "p0: block hash", value: HASH_A },
      { label: "p1: chain id", value: "1" },
      { label: "p1: block hash", value: HASH_B },
    ]);
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });

  it("lists an unverified check 6 beside another failure", async () => {
    const snapshot = round("won");
    at(snapshot, "proofs.fairnessProof")["seed"] = HASH_B;
    const report = await run(snapshot, {
      [RPC_URLS[0] as string]: { hash: HASH_A },
      [RPC_URLS[1] as string]: { hash: HASH_B },
    });
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [5, 6, 7] });
  });

  it("fails check 6 when the evidence's blockValue differs from the chain's", async () => {
    const snapshot = round("canceled");
    at(snapshot, "proofs.randomnessProof")["blockValue"] = HASH_B;
    const report = await run(snapshot);
    expect(statusOf(report, 6)).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [6] });
  });

  it("waits for a round that carries no entropy block or proofs yet", async () => {
    const snapshot = round("active");
    Reflect.deleteProperty(snapshot, "proofs");
    const report = await run(snapshot);
    expect(statusOf(report, 2)).toBe("not-checked");
    expect(statusOf(report, 3)).toBe("not-checked");
    expect(statusOf(report, 6)).toBe("not-checked");
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "not-ended",
    });
  });

  it("fails an ended round that carries no entropy block or proofs", async () => {
    const snapshot = round("won");
    Reflect.deleteProperty(snapshot, "proofs");
    const report = await run(snapshot);
    expect(statusOf(report, 2)).toBe("mismatch");
    expect(statusOf(report, 3)).toBe("mismatch");
    expect(report.verdict.kind).toBe("mismatch");
  });
});
