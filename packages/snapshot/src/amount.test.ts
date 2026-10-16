// T-6a (specs/wrapper.md), the `snapshot` half: amounts are read as `bigint`,
// exactly, up to 2^256 - 1; `normalized` takes no part.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import { compareAmounts, parseBaseUnits, validateSnapshot } from "./index.ts";
import { accepted } from "./test/results.ts";

const MAX =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

const amount = (
  value: string,
  overrides: Partial<{ unit: string; decimals: number }> = {},
) => ({
  value,
  decimals: 18,
  unit: "ETH",
  ...overrides,
});

describe("parseBaseUnits", () => {
  it.each([
    ["0", 0n],
    ["1", 1n],
    ["9007199254740993", 9_007_199_254_740_993n],
    [MAX, 2n ** 256n - 1n],
  ])("reads %s exactly", (value, expected) => {
    expect(parseBaseUnits(value)).toBe(expected);
  });

  it.each([
    "",
    "00",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e3",
    " 1",
    "1\n",
    "0x10",
    "١",
    "115792089237316195423570985008687907853269984665640564039457584007913129639936",
    "1".repeat(79),
  ])("rejects %j", value => {
    expect(parseBaseUnits(value)).toBeUndefined();
  });
});

describe("compareAmounts", () => {
  it("compares above 2^53, where a number would lose the difference", () => {
    const low = amount("9007199254740992");
    const high = amount("9007199254740993");
    expect(Number(low.value)).toBe(Number(high.value));
    expect(compareAmounts(low, high)).toBe(-1);
    expect(compareAmounts(high, low)).toBe(1);
    expect(compareAmounts(high, amount("9007199254740993"))).toBe(0);
  });

  it("compares at 2^256 - 1", () => {
    expect(compareAmounts(amount(MAX), amount(MAX))).toBe(0);
    expect(compareAmounts(amount(MAX.replace(/5$/u, "4")), amount(MAX))).toBe(
      -1,
    );
  });

  it("refuses amounts of different units or scales, or malformed values", () => {
    expect(
      compareAmounts(amount("1"), amount("1", { unit: "EUR" })),
    ).toBeUndefined();
    expect(
      compareAmounts(amount("1"), amount("1", { decimals: 6 })),
    ).toBeUndefined();
    expect(compareAmounts(amount("1.5"), amount("1"))).toBeUndefined();
  });

  it.each([
    ["coinflip-idle-amount-uint256-max", -1],
    ["coinflip-idle-eth-big-amount", 0],
  ] as const)("compares the amounts of valid/%s by value", (name, order) => {
    const file = snapshotVectors.valid[name] as { readonly input: unknown };
    const { bet } = accepted(validateSnapshot(file.input));
    const amounts = [bet.balance, bet.minBet, bet.maxBet, bet.defaultBet];
    expect(amounts.map(each => parseBaseUnits(each.value)?.toString())).toEqual(
      amounts.map(each => each.value),
    );
    expect(compareAmounts(bet.balance, bet.maxBet)).toBe(order);
  });
});
