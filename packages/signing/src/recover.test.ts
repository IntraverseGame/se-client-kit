// T-2 (specs/wrapper.md): recovery refuses every non-canonical signature,
// derived from a valid vector signature.

import { describe, expect, it } from "vitest";

import { actionVector, codeOf, withByte } from "./fixtures/helpers.ts";
import { recoverAddress } from "./signature.ts";

const ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const { digest, signature, signer } = actionVector(0);
const r = signature.slice(2, 66);
const s = signature.slice(66, 130);
const v = signature.slice(130);
const ZERO = "0".repeat(64);
// The other v, so the high-s twin is the same point's other signature.
const FLIPPED_V = v === "1b" ? "1c" : "1b";

describe("recoverAddress", () => {
  it("recovers the vector signer", () => {
    expect(recoverAddress(digest, signature)).toBe(signer);
  });

  it("accepts the same signature in uppercase hex", () => {
    expect(
      recoverAddress(digest, `0x${signature.slice(2).toUpperCase()}`),
    ).toBe(signer);
  });

  it("refuses the high-s twin of a valid signature", () => {
    const high = (ORDER - BigInt(`0x${s}`)).toString(16).padStart(64, "0");
    expect(
      codeOf(() => recoverAddress(digest, `0x${r}${high}${FLIPPED_V}`)),
    ).toBe("high-s");
  });

  it.each([0, 1, 26, 29, 0x9b, 0xff])("refuses v = %i", bad => {
    expect(
      codeOf(() => recoverAddress(digest, withByte(signature, 64, bad))),
    ).toBe("invalid-signature-v");
  });

  it.each([0, 1, 64, 66, 130])("refuses a %i-byte signature", length => {
    expect(
      codeOf(() => recoverAddress(digest, `0x${"1b".repeat(length)}`)),
    ).toBe("invalid-signature-length");
  });

  it("refuses the 64-byte compact form of a valid signature", () => {
    expect(codeOf(() => recoverAddress(digest, signature.slice(0, 130)))).toBe(
      "invalid-signature-length",
    );
  });

  it.each([
    ["r = 0", `0x${ZERO}${s}${v}`],
    ["r = the curve order", `0x${ORDER.toString(16)}${s}${v}`],
    ["s = 0", `0x${r}${ZERO}${v}`],
    // x = 5 is no point's x coordinate (5^3 + 7 is not a square modulo p).
    ["r that is no point's x", `0x${"5".padStart(64, "0")}${s}${v}`],
  ])("refuses %s", (_name, bad) => {
    expect(codeOf(() => recoverAddress(digest, bad))).toBe("invalid-signature");
  });

  it.each([
    ["undefined", undefined],
    ["a number", 42],
    ["an empty string", ""],
    ["odd-length hex", "0x1"],
    ["hex without 0x", "1b".repeat(65)],
    ["non-hex digits", `0x${"zz".repeat(65)}`],
  ])("refuses %s as a signature", (_name, bad) => {
    expect(codeOf(() => recoverAddress(digest, bad))).toBe("invalid-input");
  });

  it("refuses a digest that is not 32 bytes", () => {
    expect(codeOf(() => recoverAddress("0x1234", signature))).toBe(
      "invalid-input",
    );
  });
});
