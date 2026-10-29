// VT-2 (specs/verify-page.md): Coin Flip's payout against the fairness kernel's
// public vector set `kernel/public/v1/coin-flip-payout`, every vector replayed,
// and the input checks the set states but no vector reaches.

import { describe, expect, it } from "vitest";

import { coinFlipSchedule, type CoinFlipTerms } from "./coin-flip-payout.ts";
import { field, vectorsOf } from "./fixtures/kernel-vectors.ts";
import { KernelError } from "./kernel-error.ts";
import { kernelFor } from "./kernels.ts";

const set = vectorsOf("coin-flip-payout");

/** A vector's terms, after checking they are Coin Flip's node on path [0]. */
const termsOf = (input: Readonly<Record<string, unknown>>): CoinFlipTerms => {
  const terms = input["terms"] as Record<string, unknown>;
  expect(terms["nodes"]).toEqual([{ options: 2, losers: 1, next: [] }]);
  expect(input["path"]).toEqual([0]);
  return {
    houseEdgeWad: BigInt(String(terms["houseEdgeWad"])),
    maxMultiplierMilli: BigInt(Number(terms["maxMultiplierMilli"])),
  };
};

const errorOf = (call: () => unknown): string => {
  try {
    call();
  } catch (error) {
    if (error instanceof KernelError) return error.code;
    throw error;
  }
  return "no error";
};

const TERMS: CoinFlipTerms = {
  houseEdgeWad: 30_000_000_000_000_000n,
  maxMultiplierMilli: 4_294_967_295n,
};
const MAX = (1n << 128n) - 1n;

describe("kernel/public/v1/coin-flip-payout", () => {
  it("has the vendored set's 7 vectors, 1 of them an error", () => {
    expect(set).toHaveLength(7);
    expect(set.filter(v => v.error !== undefined)).toHaveLength(1);
  });

  it.each(set.filter(v => v.error === undefined).map(v => [v.id, v]))(
    "%s: the multiplier, the payout, and the RTP of step 0",
    (_, vector) => {
      const steps = vector.expected["steps"] as Record<string, unknown>[];
      expect(steps).toHaveLength(1);
      const [step = {}] = steps;
      expect(step["node"]).toBe(0);
      const got = coinFlipSchedule(
        termsOf(vector.input),
        BigInt(field(vector.input, "bet", vector.id)),
      );
      expect(String(got.multiplierMilli)).toBe(
        field(step, "multiplierMilli", vector.id),
      );
      expect(String(got.payout)).toBe(field(step, "payout", vector.id));
      expect(got.rtp).toBe(field(step, "rtp", vector.id));
    },
  );

  it.each(set.filter(v => v.error !== undefined).map(v => [v.id, v]))(
    "%s: refused with the vector's error",
    (_, vector) => {
      const terms = termsOf(vector.input);
      const bet = BigInt(field(vector.input, "bet", vector.id));
      expect(errorOf(() => coinFlipSchedule(terms, bet))).toBe(vector.error);
    },
  );

  it("is kernel 1's Coin Flip payout", () => {
    expect(kernelFor(1)?.coinFlipPayout).toBe(coinFlipSchedule);
  });
});

describe("the input checks no vector reaches, in the set's order", () => {
  it.each([
    ["a house edge of 10^18", { ...TERMS, houseEdgeWad: 10n ** 18n }, 1n],
    ["a negative house edge", { ...TERMS, houseEdgeWad: -1n }, 1n],
  ])("refuses %s", (_, terms, bet) => {
    expect(errorOf(() => coinFlipSchedule(terms, bet))).toBe(
      "house-edge-out-of-range",
    );
  });

  it("refuses a multiplier cap of 0, before the bet", () => {
    expect(
      errorOf(() => coinFlipSchedule({ ...TERMS, maxMultiplierMilli: 0n }, 0n)),
    ).toBe("max-multiplier-out-of-range");
  });

  it.each([0n, -1n, MAX + 1n])("refuses a bet of %s", bet => {
    expect(errorOf(() => coinFlipSchedule(TERMS, bet))).toBe(
      "bet-out-of-range",
    );
  });

  it("takes the largest bet whose payout fits", () => {
    expect(
      coinFlipSchedule({ ...TERMS, maxMultiplierMilli: 1000n }, MAX),
    ).toMatchObject({ payout: MAX });
  });
});
