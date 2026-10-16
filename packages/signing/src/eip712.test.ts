import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { hashStruct, type StructType, typedDataDigest } from "./eip712.ts";
import { codeOf } from "./fixtures/helpers.ts";
import { vectors } from "./fixtures/vectors.ts";
import { hashCloseRoundAuth } from "./messages.ts";
import { CLOSE_ROUND_AUTH, PLAYER_ACTION } from "./types.ts";

const ZERO = `0x${"00".repeat(32)}` as const;

const action = {
  action: "pick row 0 tile 2",
  path: [0],
  sequence: 1,
  round: vectors.roundId,
  previous: vectors.ready,
};

const close = {
  roundId: vectors.closeRoundAuth.roundId,
  payoutAmount: vectors.closeRoundAuth.payoutAmount,
  expired: vectors.closeRoundAuth.expired,
  resultHash: vectors.closeRoundAuth.resultHash,
  lastActionHash: vectors.closeRoundAuth.lastActionHash,
  expiry: vectors.closeRoundAuth.expiry,
};

const one = (type: StructType["fields"][number]["type"]): StructType => ({
  name: "One",
  fields: [{ name: "v", type }],
});

const word = (n: bigint): string => n.toString(16).padStart(64, "0");

// The reference encoding, spelled out: keccak256(keccak256("One(<type> v)") ‖ word).
const expected = (struct: StructType, encoded: string): string => {
  const type = utf8ToBytes(`One(${struct.fields[0]?.type ?? ""} v)`);
  return `0x${bytesToHex(keccak_256(concatBytes(keccak_256(type), hexToBytes(encoded))))}`;
};

describe("encodeData", () => {
  it("encodes uintN as a big-endian 32-byte word", () => {
    expect(hashStruct(one("uint256"), { v: 258n })).toBe(
      expected(one("uint256"), word(258n)),
    );
    const max = (1n << 256n) - 1n;
    expect(hashStruct(one("uint256"), { v: max.toString() })).toBe(
      expected(one("uint256"), word(max)),
    );
  });

  it("encodes bool as 0 or 1", () => {
    expect(hashStruct(one("bool"), { v: true })).toBe(
      expected(one("bool"), word(1n)),
    );
    expect(hashStruct(one("bool"), { v: false })).toBe(
      expected(one("bool"), word(0n)),
    );
  });

  it("encodes uint8[] as the hash of its 32-byte words", () => {
    const words = `${word(0n)}${word(1n)}${word(255n)}`;
    expect(hashStruct(one("uint8[]"), { v: [0, 1, 255] })).toBe(
      expected(one("uint8[]"), bytesToHex(keccak_256(hexToBytes(words)))),
    );
    expect(hashStruct(one("uint8[]"), { v: [] })).toBe(
      expected(one("uint8[]"), bytesToHex(keccak_256(new Uint8Array(0)))),
    );
  });

  it("encodes string as the hash of its UTF-8 bytes", () => {
    expect(hashStruct(one("string"), { v: "é" })).toBe(
      expected(
        one("string"),
        bytesToHex(keccak_256(Uint8Array.of(0xc3, 0xa9))),
      ),
    );
  });

  it("left-pads an address and accepts any case", () => {
    const lower = vectors.domain.verifyingContract.toLowerCase();
    expect(hashStruct(one("address"), { v: lower })).toBe(
      expected(one("address"), `${"00".repeat(12)}${lower.slice(2)}`),
    );
    expect(
      hashStruct(one("address"), { v: `0x${lower.slice(2).toUpperCase()}` }),
    ).toBe(hashStruct(one("address"), { v: lower }));
  });
});

describe("refused values", () => {
  it.each([
    ["a sequence above uint32", { ...action, sequence: 2 ** 32 }],
    ["a negative sequence", { ...action, sequence: -1 }],
    ["a fractional sequence", { ...action, sequence: 1.5 }],
    ["a path step above uint8", { ...action, path: [256] }],
    ["a negative path step", { ...action, path: [-1] }],
    ["a path step as a string", { ...action, path: ["1"] }],
    ["a path that is not an array", { ...action, path: "0" }],
    ["a short round", { ...action, round: "0x1234" }],
    ["a round without 0x", { ...action, round: ZERO.slice(2) }],
    ["a non-hex previous", { ...action, previous: `0x${"zz".repeat(32)}` }],
    ["a lone surrogate in the action", { ...action, action: "pick \uD800" }],
    ["a non-string action", { ...action, action: 7 }],
    ["a missing field", { action: "x", path: [], sequence: 1, round: ZERO }],
    ["an unknown field", { ...action, extra: 1 }],
  ])("refuses %s", (_name, message) => {
    expect(codeOf(() => hashStruct(PLAYER_ACTION, message))).toBe(
      "invalid-input",
    );
  });

  it.each([
    ["a payout amount as a number", { ...close, payoutAmount: 1853000 }],
    [
      "a payout amount above uint128",
      { ...close, payoutAmount: (1n << 128n).toString() },
    ],
    ["a payout amount with a leading zero", { ...close, payoutAmount: "01" }],
    ["a payout amount with a sign", { ...close, payoutAmount: "+1" }],
    ["a payout amount in hex", { ...close, payoutAmount: "0x10" }],
    ["a negative bigint payout amount", { ...close, payoutAmount: -1n }],
    ["an expired flag that is not a boolean", { ...close, expired: 0 }],
    ["an expiry above uint256", { ...close, expiry: 1n << 256n }],
  ])("refuses %s", (_name, message) => {
    expect(codeOf(() => hashStruct(CLOSE_ROUND_AUTH, message))).toBe(
      "invalid-input",
    );
  });

  it("accepts a payout amount as a bigint or a decimal string, with one result", () => {
    expect(hashCloseRoundAuth({ ...close, payoutAmount: 1853000n })).toBe(
      hashCloseRoundAuth(close),
    );
  });

  it("refuses a digest input that is not 32 bytes", () => {
    expect(codeOf(() => typedDataDigest("0x12", ZERO))).toBe("invalid-input");
    expect(codeOf(() => typedDataDigest(ZERO, "0x12"))).toBe("invalid-input");
  });
});
