// VT-13: base58 (RFC-007 section 5), every vector of its table and every
// refusal.

import { describe, expect, it } from "vitest";

import { decodeBase58Bytes32, isBase58Text } from "./base58.ts";
import { hexFromBytes } from "./hex.ts";

const decoded = (text: unknown): string | undefined => {
  const bytes = decodeBase58Bytes32(text);
  return bytes === undefined ? undefined : hexFromBytes(bytes);
};

const ACCEPTED: readonly (readonly [string, string])[] = [
  [
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "45296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0",
  ],
  [
    "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
    "3a132ece10305ec1830725502fa2b7e7eb8157e9123d4c1f654a71787161dc21",
  ],
  [
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    "ce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab",
  ],
  ["11111111111111111111111111111111", "00".repeat(32)],
  ["11111111111111111111111111111112", `${"00".repeat(31)}01`],
  ["JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG", "ff".repeat(32)],
];

// 33 bytes (`01` then 32 zero bytes) and 31 bytes of `ff`: in the alphabet and
// in the length range, refused by the decoded length.
const WRONG_LENGTH = [
  "JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFH",
  "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofL",
];

const VALID = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

describe("decodeBase58Bytes32", () => {
  it.each(ACCEPTED)("decodes %s to its 32 bytes", (text, hex) => {
    expect(decoded(text)).toBe(hex);
    expect(isBase58Text(text)).toBe(true);
  });

  it.each(WRONG_LENGTH)("refuses %s, which is not 32 bytes", text => {
    expect(isBase58Text(text)).toBe(true);
    expect(decoded(text)).toBeUndefined();
  });

  it.each([
    ["the empty string", ""],
    ["31 characters", "1".repeat(31)],
    ["45 characters", "1".repeat(45)],
  ])("refuses %s before any arithmetic", (_name, text) => {
    expect(isBase58Text(text)).toBe(false);
    expect(decoded(text)).toBeUndefined();
  });

  it.each(["0", "O", "I", "l", "+", "/", " ", "é"])(
    "refuses the character %j in an otherwise valid text",
    character => {
      const text = `${VALID.slice(0, 20)}${character}${VALID.slice(21)}`;
      expect(text).toHaveLength(VALID.length);
      expect(isBase58Text(text)).toBe(false);
      expect(decoded(text)).toBeUndefined();
    },
  );

  it("refuses a value that is not a string", () => {
    for (const value of [undefined, null, 32, ["1".repeat(32)], {}]) {
      expect(decoded(value)).toBeUndefined();
    }
  });

  it("never throws, whatever the text", () => {
    for (const text of ["z".repeat(44), "1".repeat(44), `${"1".repeat(43)}z`]) {
      expect(() => decodeBase58Bytes32(text)).not.toThrow();
    }
    // 44 `z`s are above 2^256 and 44 `1`s are 44 zero bytes: neither is 32.
    expect(decoded("z".repeat(44))).toBeUndefined();
    expect(decoded("1".repeat(44))).toBeUndefined();
  });
});
