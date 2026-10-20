// The bytes32 form of a short ASCII text (the bet's unit, the entropy source),
// as `newRound` and the entropy target use it (V-12, checks 2 and 3).

import { describe, expect, it } from "vitest";

import { asciiBytes32 } from "./ascii-bytes32.ts";

describe("asciiBytes32", () => {
  it("left-aligns ASCII text and pads it with zero bytes", () => {
    expect(asciiBytes32("EUR")).toBe(`0x455552${"0".repeat(58)}`);
    expect(asciiBytes32("a".repeat(32))).toBe(`0x${"61".repeat(32)}`);
  });

  it("refuses text longer than 32 bytes, or not ASCII", () => {
    expect(asciiBytes32("a".repeat(33))).toBeUndefined();
    expect(asciiBytes32("€")).toBeUndefined();
    expect(asciiBytes32("é")).toBeUndefined();
  });
});
