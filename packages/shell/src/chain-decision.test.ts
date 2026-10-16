// W-26 and W-26b: the bind rule, and the decision a tip check leads to (pass,
// or fail with the record and the reason; whether a cancel is signed then
// depends on `T_0` being settled, W-25).

import { describe, expect, it } from "vitest";

import { type Bind, bindHolds, decideChain } from "./chain-decision.ts";
import type { TipCheckFailure, TipCheckRecord } from "./tip-check.ts";

const passed: TipCheckRecord = Object.freeze({
  source: "base",
  passed: true,
  tipCheck: "independent",
  tip: 100n,
  low: 99n,
  tipLagMargin: 2n,
  answers: Object.freeze([
    { provider: "p1", finalBlock: 100n, hashAtLow: `0x${"1".repeat(64)}` },
    { provider: "p2", finalBlock: 99n, hashAtLow: `0x${"1".repeat(64)}` },
  ] as const),
});

const failed = (failure: TipCheckFailure): TipCheckRecord =>
  Object.freeze({ ...passed, passed: false, failure });

const future = (blockNumber: bigint): Bind => ({ mode: "future", blockNumber });
const atTip = (blockNumber: bigint): Bind => ({ mode: "tip", blockNumber });

describe("bindHolds", () => {
  it("needs a future bind's N above the tip", () => {
    expect(bindHolds(future(101n), 100n, 2n)).toBe(true);
    expect(bindHolds(future(100n), 100n, 2n)).toBe(false);
    expect(bindHolds(future(99n), 100n, 2n)).toBe(false);
  });

  it("needs a tip bind's N not older than the tip beyond the margin", () => {
    expect(bindHolds(atTip(100n), 100n, 2n)).toBe(true);
    expect(bindHolds(atTip(103n), 100n, 2n)).toBe(true);
    expect(bindHolds(atTip(98n), 100n, 2n)).toBe(true);
    expect(bindHolds(atTip(97n), 100n, 2n)).toBe(false);
    expect(bindHolds(atTip(99n), 100n, 0n)).toBe(false);
  });
});

describe("decideChain", () => {
  it("passes a passed check whose bind holds", () => {
    expect(decideChain(passed, future(101n))).toEqual({
      verdict: "pass",
      record: passed,
    });
  });

  it("fails when the bind does not hold, keeping the record", () => {
    const decision = decideChain(passed, future(100n));
    expect(decision).toEqual({
      verdict: "fail",
      reason: "verification-failed",
      failure: "bind",
      record: passed,
    });
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it.each([
    ["unknown-source", "chain-unverified"],
    ["too-few-answered", "chain-unverified"],
    ["hash-unavailable", "chain-unverified"],
    ["lagging", "verification-failed"],
    ["hash-mismatch", "verification-failed"],
  ] as const)("fails a %s check as %s", (failure, reason) => {
    const record = failed(failure);
    expect(decideChain(record, future(1_000n))).toEqual({
      verdict: "fail",
      reason,
      failure,
      record,
    });
  });

  it("fails a degraded check that failed like any other", () => {
    const record = Object.freeze({
      ...failed("too-few-answered"),
      tipCheck: "degraded" as const,
    });
    expect(decideChain(record, atTip(100n)).verdict).toBe("fail");
  });
});
