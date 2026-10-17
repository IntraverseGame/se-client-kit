// T-6a (the Wrapper's part) and W-34: amounts are compared as `bigint` base
// units, also above 2^53 and at 2^256 - 1; the selector shows `formatted`;
// `normalized` and multipliers are never read for a decision.

import { describe, expect, it } from "vitest";

import { betChoice, compareAmounts } from "./bet-options.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import type { ShownAmount } from "./round-input.ts";

const MAX = (2n ** 256n - 1n).toString();
const ABOVE_2_53 = (2n ** 53n + 1n).toString();

const amount = (value: string, unit = "ETH", decimals = 18): ShownAmount => ({
  value,
  decimals,
  unit,
  formatted: `${value} ${unit}`,
});

describe("compareAmounts", () => {
  it("compares values that a JS number cannot tell apart", () => {
    const a = amount((2n ** 53n).toString());
    const b = amount(ABOVE_2_53);
    // As numbers, 2^53 and 2^53 + 1 are equal.
    expect(Number(a.value)).toBe(Number(b.value));
    expect(compareAmounts(a, b)).toBe(-1);
    expect(compareAmounts(b, a)).toBe(1);
  });

  it("compares at 2^256 - 1", () => {
    const below = (2n ** 256n - 2n).toString();
    expect(compareAmounts(amount(MAX), amount(MAX))).toBe(0);
    expect(compareAmounts(amount(below), amount(MAX))).toBe(-1);
  });

  it("does not compare amounts of another unit or precision", () => {
    expect(compareAmounts(amount("1"), amount("1", "EUR", 2))).toBeUndefined();
    expect(compareAmounts(amount("1"), amount("1", "ETH", 6))).toBeUndefined();
  });

  it("ignores `normalized` (a display number)", () => {
    const left = { ...amount("100"), normalized: 999 };
    const right = { ...amount("100"), normalized: 1 };
    expect(compareAmounts(left, right)).toBe(0);
  });
});

describe("betChoice (W-31, idle)", () => {
  it("offers the suggested bets and preselects the default", () => {
    const { bet } = snapshotVector("coinflip-idle");
    const choice = betChoice(bet);
    expect(choice.options.map(option => option.amount.formatted)).toEqual([
      "€1.00",
      "€5.00",
      "€10.00",
    ]);
    expect(choice.selected).toBe(0);
  });

  it("keeps a bet above the balance out of reach, compared as bigint", () => {
    const balance = amount(ABOVE_2_53);
    const affordable = amount((2n ** 53n).toString());
    const tooHigh = amount((2n ** 53n + 2n).toString());
    const choice = betChoice({
      balance,
      minBet: amount("1"),
      maxBet: amount(MAX),
      suggestedBets: [tooHigh, affordable],
      defaultBet: tooHigh,
    });
    expect(choice.options.map(option => option.affordable)).toEqual([
      false,
      true,
    ]);
    expect(choice.selected).toBe(1);
  });

  it("leaves out a suggested bet outside minBet and maxBet", () => {
    const choice = betChoice({
      balance: amount(MAX),
      minBet: amount("10"),
      maxBet: amount("100"),
      suggestedBets: [amount("9"), amount("10"), amount("100"), amount("101")],
      defaultBet: amount("10"),
    });
    expect(choice.options.map(option => option.amount.value)).toEqual([
      "10",
      "100",
    ]);
  });

  it("adds the default bet when it is not among the suggestions", () => {
    const choice = betChoice({
      balance: amount("1000"),
      minBet: amount("1"),
      maxBet: amount("1000"),
      suggestedBets: [amount("5")],
      defaultBet: amount("2"),
    });
    expect(choice.options.map(option => option.amount.value)).toEqual([
      "2",
      "5",
    ]);
    expect(choice.selected).toBe(0);
  });

  it("selects nothing when no bet can be afforded", () => {
    const choice = betChoice({
      balance: amount("1"),
      minBet: amount("5"),
      maxBet: amount("10"),
      suggestedBets: [amount("5")],
      defaultBet: amount("5"),
    });
    expect(choice.selected).toBeUndefined();
  });

  it("renders the 2^256 - 1 golden vector's amounts as given", () => {
    const { bet } = snapshotVector("coinflip-idle-amount-uint256-max");
    expect(() => betChoice(bet)).not.toThrow();
    expect(bet.balance.value.length).toBeGreaterThan(15);
  });
});
