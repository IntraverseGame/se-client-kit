// VT-3: the verify API body's validation and its reading as evidence. The body
// is `RoundVerification` of the vendored verify API document: a vendored
// Snapshot vector's round, written as that body (`verifyBody`, test-only). A
// body the validator refuses is never partly used (V-10); amounts read as
// `bigint`.

import { describe, expect, it } from "vitest";

import { asRecord, withField, wonBody } from "./fixtures/verify-body.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { formatAmount } from "./verify-amount.ts";
import { parseEvidence } from "./verify-body.ts";

const ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";
const body = wonBody;

const evidenceOf = (json: unknown): RoundEvidence => {
  const evidence = parseEvidence(json);
  if (evidence === undefined) throw new TypeError("the body does not validate");
  return evidence;
};

describe("a round found", () => {
  it("reads the evidence from the document's fields", () => {
    const evidence = evidenceOf(body());
    expect(evidence.roundId).toBe(ID);
    expect(evidence.status).toBe("won");
    expect(evidence.shape).toEqual([]);
    expect(evidence.terms).toEqual([{ options: 2, losers: 1, next: [] }]);
    expect(evidence.steps).toEqual([
      { optionCount: 2, selectedIndex: 1, losingIndex: 0 },
    ]);
    expect(evidence.randomnessProof?.source).toBe("ethereum:block");
    expect(evidence.randomnessProof?.roundSecret).toBe(`0x${"44".repeat(32)}`);
    expect(evidence.fairnessProof?.seed).toBe(`0x${"55".repeat(32)}`);
    expect(evidence.createRoundAuth?.signer).toBe(
      "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    );
    expect(evidence.createRoundAuth?.domain.chainId).toBe(31_337);
    expect(evidence.record).toBeUndefined();
  });

  it("decodes newRound from its abi.encode bytes", () => {
    const newRound = evidenceOf(body()).createRoundAuth?.newRound;
    expect(newRound?.currency).toBe("EUR");
    expect(newRound?.betAmount).toBe(100n);
    expect(newRound?.roundId).toBe(
      `0x01927c5e8b3a7f219c4d5e6f7a8b9c0d${"0".repeat(32)}`,
    );
    expect(newRound?.actionKey).toMatch(/^0x[0-9a-f]{40}$/u);
  });

  it("reads amounts and the block number as bigint, never a number", () => {
    const evidence = evidenceOf(body());
    expect(evidence.createRoundAuth?.newRound.betAmount).toBe(100n);
    expect(evidence.payout?.value).toBe(194n);
    expect(evidence.payout?.formatted).toBe("1.94 EUR");
    expect(evidence.randomnessProof?.blockNumber).toBe(21_000_123n);
  });

  it("takes the kernel version from the body (V-12a)", () => {
    const evidence = evidenceOf(withField("kernel.version", 7));
    expect(evidence.kernelVersion).toBe(7);
    expect(evidenceOf(body()).kernelVersion).toBe(1);
  });

  it("reads a round before its bind: no entropy, no commitment, no proofs", () => {
    const early = body();
    for (const key of [
      "commitment",
      "entropy",
      "reveal",
      "seedHash",
      "readyHash",
      "payout",
      "recomputed",
    ]) {
      Reflect.deleteProperty(early, key);
    }
    early["status"] = "starting";
    early["closed"] = false;
    const evidence = evidenceOf(early);
    expect(evidence.randomnessProof).toBeUndefined();
    expect(evidence.createRoundAuth).toBeUndefined();
    expect(evidence.fairnessProof).toBeUndefined();
    expect(evidence.steps).toEqual([]);
  });

  it("reads a voided round: idle with a reason and no reveal", () => {
    const voided = body();
    for (const key of ["reveal", "recomputed", "payout"]) {
      Reflect.deleteProperty(voided, key);
    }
    voided["status"] = "idle";
    voided["voidReason"] = "ROOT_LOST";
    const evidence = evidenceOf(voided);
    expect(evidence.status).toBe("idle");
    expect(evidence.randomnessProof?.roundSecret).toBeUndefined();
    expect(evidence.closure).toBe("voided");
  });

  it("reads an idle round with a reject code as refused", () => {
    const refused = { ...body(), status: "idle", rejectCode: "NO_FUNDS" };
    expect(evidenceOf(refused).closure).toBe("refused");
  });

  it("reads an idle round with both a void reason and a reject code as voided", () => {
    const both = {
      ...body(),
      status: "idle",
      voidReason: "ROOT_LOST",
      rejectCode: "NO_FUNDS",
    };
    expect(evidenceOf(both).closure).toBe("voided");
  });

  it("reads no closure for an idle round with neither, or a played round", () => {
    expect(evidenceOf({ ...body(), status: "idle" }).closure).toBeUndefined();
    expect(
      evidenceOf({ ...body(), voidReason: "ROOT_LOST" }).closure,
    ).toBeUndefined();
  });

  it("gives no losing index when the replay names none or several", () => {
    const none = withField("recomputed.steps", [
      { node: 0, option: 1, losers: [], survived: true },
    ]);
    expect(evidenceOf(none).steps).toEqual([
      { optionCount: 2, selectedIndex: 1 },
    ]);
  });

  it("ignores a verdict field the API might add", () => {
    const evidence = evidenceOf({ ...body(), verified: true });
    expect(evidence).not.toHaveProperty("verified");
  });

  it("reads a config round's `recomputed.draw` as nothing (only a book round has a draw)", () => {
    const plain = evidenceOf(body());
    const recomputed = asRecord(body()["recomputed"]);
    const evidence = evidenceOf({
      ...body(),
      recomputed: {
        ...recomputed,
        draw: { index: 4, multiplierMilli: "1940" },
      },
    });
    expect(evidence).toEqual(plain);
    expect(evidence.book).toBeUndefined();
  });

  it("never reads the API's checks or its recomputed kind as a result", () => {
    const lying = {
      ...body(),
      checks: [{ name: "seed", result: "passed" }],
    };
    const evidence = evidenceOf(lying);
    expect(evidence).not.toHaveProperty("checks");
  });
});

describe("formatAmount", () => {
  it.each<[bigint, number, string]>([
    [194n, 2, "1.94 EUR"],
    [100n, 2, "1 EUR"],
    [5n, 2, "0.05 EUR"],
    [0n, 2, "0 EUR"],
    [7n, 0, "7 EUR"],
    [1_000_000_000_000_000_000n, 18, "1 EUR"],
    [123_456_789_012_345_678_901n, 18, "123.456789012345678901 EUR"],
    [10n ** 77n, 77, "1 EUR"],
  ])("writes %s base units at %i decimals as %s", (value, decimals, shown) => {
    expect(formatAmount(value, decimals, "EUR")).toBe(shown);
  });
});
