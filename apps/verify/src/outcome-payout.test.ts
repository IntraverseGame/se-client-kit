// VT-2 (specs/verify-page.md): check 7's payout comparison for a Coin Flip
// round (OQ-B9): the payout follows from the recomputed outcome, Coin Flip's
// terms, and the bet; a value the kernel cannot take is refused, never thrown.

import { describe, expect, it } from "vitest";

import {
  checkSeedAndOutcome,
  type KernelCheck,
  type OutcomeEvidence,
} from "./fairness-checks.ts";
import { expectedSteps, field, vectorsOf } from "./fixtures/kernel-vectors.ts";
import type { Hash32 } from "./hex.ts";

const vector = (set: string, id: string) => {
  const found = vectorsOf(set).find(v => v.id === `kernel/public/v1/${id}`);
  if (found === undefined) throw new TypeError(`no vector ${id}`);
  return found;
};

const hash = (hex: string): Hash32 => `0x${hex}`;
const reference = vector("seed", "seed/reference");
const chain = vector("derive", "derive/deepest-chain-25");
const LOSING = expectedSteps(chain)[0]?.losers[0] ?? -1;

const WON: OutcomeEvidence = {
  blockValue: hash(field(reference.input, "blockValue", reference.id)),
  roundSecret: hash(field(reference.input, "secret", reference.id)),
  seed: hash(field(reference.expected, "seed", reference.id)),
  status: "won",
  selectedIndex: 1 - LOSING,
  losingIndex: LOSING,
  // Coin Flip's terms and a 1.00 EUR bet: 1.94 EUR (`coin-flip-payout/b1000000`
  // at another bet; floor(100 * 1940 / 1000) = 194).
  bet: { value: 100n, decimals: 2, currency: "EUR" },
  payoutTerms: {
    houseEdgeWad: "30000000000000000",
    maxMultiplierMilli: 4_294_967_295,
  },
  payout: "1.94 EUR",
};

const payoutOf = (check: KernelCheck) =>
  check.kind === "recomputed"
    ? check.comparisons.find(c => c.name === "payout")
    : undefined;

describe("check 7's payout", () => {
  it("matches a won round's payout and shows the recomputed one", async () => {
    const check = await checkSeedAndOutcome(1, WON);
    expect(check).toMatchObject({
      kind: "recomputed",
      matches: true,
      values: { payout: "1.94 EUR" },
    });
    expect(payoutOf(check)).toMatchObject({
      recomputed: "1.94 EUR",
      evidence: "1.94 EUR",
      matches: true,
    });
  });

  it("compares amounts, not digits: 1.940 is 1.94", async () => {
    const check = await checkSeedAndOutcome(1, {
      ...WON,
      bet: { value: 1000n, decimals: 3, currency: "EUR" },
    });
    expect(payoutOf(check)?.matches).toBe(true);
  });

  it("pays 0 on a lost round, whatever the terms", async () => {
    const check = await checkSeedAndOutcome(1, {
      ...WON,
      status: "lost",
      selectedIndex: LOSING,
      payoutTerms: { houseEdgeWad: "1".repeat(100), maxMultiplierMilli: 1 },
      payout: "0 EUR",
    });
    expect(check).toMatchObject({ kind: "recomputed", matches: true });
  });

  it.each([
    ["another amount", { payout: "1.95 EUR" }],
    ["another currency", { payout: "1.94 USD" }],
    ["no payout in the body", { payout: undefined }],
    ["no bet", { bet: undefined }],
    ["no terms", { payoutTerms: undefined }],
    [
      "a cap below the multiplier",
      {
        payoutTerms: {
          houseEdgeWad: "30000000000000000",
          maxMultiplierMilli: 1000,
        },
      },
    ],
  ])("fails the payout with %s", async (_, change) => {
    const check = await checkSeedAndOutcome(1, { ...WON, ...change });
    expect(check).toMatchObject({ kind: "recomputed", matches: false });
    expect(payoutOf(check)?.matches).toBe(false);
  });

  it.each([
    [
      "a house edge of 10^18",
      {
        payoutTerms: {
          houseEdgeWad: `1${"0".repeat(18)}`,
          maxMultiplierMilli: 1,
        },
      },
      "houseEdgeWad",
      "house-edge-out-of-range",
    ],
    [
      "a house edge longer than an amount",
      { payoutTerms: { houseEdgeWad: "9".repeat(79), maxMultiplierMilli: 1 } },
      "houseEdgeWad",
      "house-edge-out-of-range",
    ],
    [
      "a bet of 0",
      { bet: { value: 0n, decimals: 2, currency: "EUR" } },
      "bet",
      "bet-out-of-range",
    ],
    [
      "a payout above 2^128 - 1",
      { bet: { value: (1n << 128n) - 1n, decimals: 2, currency: "EUR" } },
      "payout",
      "payout-too-large",
    ],
  ])("refuses %s", async (_, change, name, error) => {
    expect(await checkSeedAndOutcome(1, { ...WON, ...change })).toEqual({
      kind: "refused",
      name,
      error,
    });
  });

  it("compares no payout for a canceled round", async () => {
    const { selectedIndex: _pick, losingIndex: _losing, ...rest } = WON;
    const check = await checkSeedAndOutcome(1, { ...rest, status: "canceled" });
    expect(payoutOf(check)).toBeUndefined();
  });
});
