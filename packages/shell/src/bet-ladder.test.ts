// W-31's fallback ladder, and autoplay's "still offered" rule over it
// (RFC-005 section 6): both read the same offered bets.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { offeredAmount } from "./autoplay-bet.ts";
import { type OfferedAmount, suggestedOrLadder } from "./bet-ladder.ts";

const amount = (
  value: string,
  formatted: string,
  unit = "USD",
  decimals = 2,
): OfferedAmount => ({ value, decimals, unit, formatted });

const ladder = (minBet: OfferedAmount): string[][] =>
  suggestedOrLadder({ minBet, suggestedBets: [] }).map(a => [
    a.value,
    a.formatted,
  ]);

describe("suggestedOrLadder (W-31)", () => {
  it("keeps the Snapshot's suggested bets when it has any", () => {
    const suggested = [amount("500", "5 USD")];
    expect(
      suggestedOrLadder({
        minBet: amount("10", "0.1 USD"),
        suggestedBets: suggested,
      }),
    ).toBe(suggested);
  });

  it("offers 1, 10, 20, 50, 100 whole units, trimmed like minBet", () => {
    expect(ladder(amount("10", "0.1 USD"))).toEqual([
      ["100", "1 USD"],
      ["1000", "10 USD"],
      ["2000", "20 USD"],
      ["5000", "50 USD"],
      ["10000", "100 USD"],
    ]);
  });

  it("shows zero fraction digits when minBet shows all its decimals", () => {
    expect(ladder(amount("10", "€0.10", "EUR")).map(([, f]) => f)).toEqual([
      "€1.00",
      "€10.00",
      "€20.00",
      "€50.00",
      "€100.00",
    ]);
  });

  it("replaces the amount, never a digit inside the unit", () => {
    expect(ladder(amount("1", "B3TR 0.1", "B3TR", 1)).at(1)).toEqual([
      "100",
      "B3TR 10.0",
    ]);
  });

  it("handles 0 and 18 decimals as bigints", () => {
    expect(ladder(amount("1", "1 JPY", "JPY", 0)).at(-1)).toEqual([
      "100",
      "100 JPY",
    ]);
    expect(
      ladder(amount("1", "0.000000000000000001 ETH", "ETH", 18)).at(-1),
    ).toEqual([(100n * 10n ** 18n).toString(), "100.000000000000000000 ETH"]);
    expect(
      ladder(amount("10000000000000000", "0.01 ETH", "ETH", 18)).at(-1),
    ).toEqual([(100n * 10n ** 18n).toString(), "100 ETH"]);
  });

  it("offers no ladder when minBet's formatted holds no number", () => {
    expect(ladder(amount("10", "min"))).toEqual([]);
  });
});

const snapshot = (maxBet: string): ValidSnapshot =>
  ({
    bet: {
      balance: amount("1000000", "10000 USD"),
      minBet: amount("10", "0.1 USD"),
      maxBet: amount(maxBet, "max"),
      suggestedBets: [],
      defaultBet: amount("10", "0.1 USD"),
    },
  }) as unknown as ValidSnapshot;

describe("offeredAmount over the ladder (RFC-005 section 6)", () => {
  it("still offers a ladder bet, so autoplay goes on", () => {
    expect(
      offeredAmount(snapshot("100000"), {
        value: "2000",
        unit: "USD",
        decimals: 2,
      })?.value,
    ).toBe("2000");
  });

  it("no longer offers a ladder bet above maxBet", () => {
    expect(
      offeredAmount(snapshot("1000"), {
        value: "2000",
        unit: "USD",
        decimals: 2,
      }),
    ).toBeUndefined();
  });

  it("does not offer a value off the ladder", () => {
    expect(
      offeredAmount(snapshot("100000"), {
        value: "1500",
        unit: "USD",
        decimals: 2,
      }),
    ).toBeUndefined();
  });
});
