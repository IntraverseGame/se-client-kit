// W-26, check 3: the bytes32 forms of the bet's unit, the entropy source, and
// the round id.

import { describe, expect, it } from "vitest";

import { asciiBytes32, roundIdBytes32 } from "./bytes32-text.ts";

describe("the encodings", () => {
  it("writes ASCII text as a left-aligned, zero-padded bytes32", () => {
    expect(asciiBytes32("EUR")).toBe(`0x455552${"0".repeat(58)}`);
    expect(asciiBytes32("x".repeat(32))).toBe(`0x${"78".repeat(32)}`);
  });

  it("refuses text that is not ASCII or is longer than 32 bytes", () => {
    expect(asciiBytes32("€")).toBeUndefined();
    expect(asciiBytes32("x".repeat(33))).toBeUndefined();
  });

  it("writes a roundId as its 16 bytes, left-aligned and zero-padded", () => {
    expect(roundIdBytes32("01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d")).toBe(
      `0x01927c5e8b3a7f219c4d5e6f7a8b9c0d${"0".repeat(32)}`,
    );
    expect(roundIdBytes32("not-a-uuid")).toBeUndefined();
  });
});
