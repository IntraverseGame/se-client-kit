import { describe, expect, it } from "vitest";

import { acceptedDelegation as vector } from "./fixtures/key-delegation-vectors.ts";
import { sameHex } from "./hex.ts";

describe("sameHex", () => {
  it.each([
    [
      "an EIP-55 address and its lowercase echo",
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      vector.wallet,
    ],
    [
      "a signature in uppercase and in lowercase",
      `0x${vector.signature.slice(2).toUpperCase()}`,
      vector.signature,
    ],
    ["a value and itself", vector.sessionIdBytes32, vector.sessionIdBytes32],
    ["one byte in either case", "0xAB", "0xab"],
  ])("matches %s", (_name, a, b) => {
    expect(sameHex(a, b)).toBe(true);
  });

  it.each([
    ["different bytes", vector.wallet, vector.actionKey],
    [
      "a value and its prefix",
      vector.sessionIdBytes32,
      vector.sessionIdBytes32.slice(0, 34),
    ],
    ["a value and itself left-padded", "0xab", "0x00ab"],
    ["a session id and its bytes32", vector.sessionId, vector.sessionIdBytes32],
    ["two empty values", "0x", "0x"],
    ["values without 0x", vector.wallet.slice(2), vector.wallet.slice(2)],
    ["values with a 0X prefix", "0XAB", "0XAB"],
    ["odd-length hex", "0xabc", "0xabc"],
    ["non-hex digits", "0xzz", "0xzz"],
    ["numbers", 1, 1],
    ["undefined", undefined, undefined],
  ])("does not match %s", (_name, a, b) => {
    expect(sameHex(a, b)).toBe(false);
  });
});
