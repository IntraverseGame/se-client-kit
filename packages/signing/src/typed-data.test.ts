// The canonical typedData encoding, replayed byte for byte from the vendored
// `typed-data` Snapshot vectors (specs/client-kit/the-cryptography.md).

import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { actionVector, codeOf } from "./fixtures/helpers.ts";
import {
  coinflipReadyHash,
  type TypedDataVector,
  typedDataVectors as all,
} from "./fixtures/typed-data-vectors.ts";
import type { Bytes32 } from "./hex.ts";
import { encodeTypedData, type TypedDataFields } from "./typed-data.ts";

const byName = (name: string): TypedDataVector => {
  const found = all.find(vector => vector.name === name);
  if (found === undefined) throw new Error(`no vector ${name}`);
  return found;
};

// RFC 4648 base64 with padding, written out so the test does not rest on the
// platform's encoder.
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const toBase64 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const word =
      ((bytes[i] ?? 0) << 16) |
      ((bytes[i + 1] ?? 0) << 8) |
      (bytes[i + 2] ?? 0);
    out +=
      ALPHABET.charAt((word >> 18) & 63) + ALPHABET.charAt((word >> 12) & 63);
    out += i + 1 < bytes.length ? ALPHABET.charAt((word >> 6) & 63) : "=";
    out += i + 2 < bytes.length ? ALPHABET.charAt(word & 63) : "=";
  }
  return out;
};

const PREVIOUS: Bytes32 = `0x${"ab".repeat(32)}`;
const base: TypedDataFields = {
  kind: "action",
  action: "pick row 0 tile 1",
  path: [0],
  sequence: 1,
  previous: PREVIOUS,
};

describe("the typed-data vectors", () => {
  it("holds a move, a multi-row move, a cash-out, and a cancel", () => {
    expect(all.map(vector => vector.name).toSorted()).toEqual([
      "cash-out",
      "coinflip-cancel",
      "coinflip-pick",
      "pick-multi-path",
    ]);
    expect(
      Object.fromEntries(all.map(v => [v.kindName, v.fields.kind])),
    ).toEqual({
      ACTION_KIND_ACTION: "action",
      ACTION_KIND_CASH_OUT: "cash-out",
      ACTION_KIND_CANCEL: "cancel",
    });
  });

  it.each(all)("replays $name byte for byte in hex", vector => {
    expect(`0x${bytesToHex(encodeTypedData(vector.fields))}`).toBe(vector.hex);
  });

  it.each(all)("replays $name byte for byte in base64", vector => {
    expect(toBase64(encodeTypedData(vector.fields))).toBe(vector.base64);
  });

  it("leaves out the path of a cancel", () => {
    const cancel = byName("coinflip-cancel");
    expect(cancel.fields.path).toEqual([]);
    // The action ("cancel") is followed by the sequence's tag, not a path's.
    expect(cancel.hex).toMatch(/^0x0803120663616e63656c2001/u);
  });

  it("links the Coin Flip move and cancel to the ready hash of their Snapshot", () => {
    expect(byName("coinflip-pick").fields.previous).toBe(coinflipReadyHash);
    expect(byName("coinflip-cancel").fields.previous).toBe(coinflipReadyHash);
  });

  // `signing.json`'s actions are T_1..T_4: the third pick links to T_2, the
  // cash-out to T_3.
  it.each([
    ["pick-multi-path", 2, "Action"],
    ["cash-out", 3, "CashOut"],
  ] as const)(
    "ties %s to signing.json's step %i",
    (name, index, signedKind) => {
      const vector = byName(name);
      const signed = actionVector(index);
      const before = actionVector(index - 1);
      expect(signed.kind).toBe(signedKind);
      expect(vector.fields.previous).toBe(before.structHash);
      expect(vector.fields.previous).toBe(signed.previous);
      expect(vector.fields.action).toBe(signed.action);
      expect(vector.fields.path).toEqual(signed.path);
      expect(vector.fields.sequence).toBe(signed.sequence);
    },
  );
});

describe("encodeTypedData", () => {
  it("is deterministic", () => {
    expect(encodeTypedData(base)).toEqual(encodeTypedData({ ...base }));
  });

  it("returns fresh bytes for each call", () => {
    expect(encodeTypedData(base)).not.toBe(encodeTypedData(base));
  });

  it("writes a path entry above 127 as a two-byte varint", () => {
    const hex = bytesToHex(encodeTypedData({ ...base, path: [127, 128, 255] }));
    expect(hex).toContain("1a057f8001ff01");
  });

  it("writes a sequence as a multi-byte varint", () => {
    const hex = bytesToHex(
      encodeTypedData({ ...base, sequence: 0xff_ff_ff_ff }),
    );
    expect(hex).toContain("20ffffffff0f2a20");
  });

  it("leaves out an empty path", () => {
    const hex = bytesToHex(encodeTypedData({ ...base, action: "a", path: [] }));
    expect(hex).toBe(`080112016120012a20${"ab".repeat(32)}`);
  });

  it("encodes the action as UTF-8", () => {
    const hex = bytesToHex(encodeTypedData({ ...base, action: "é" }));
    expect(hex).toMatch(/^08011202c3a91a/u);
  });

  it("accepts an action with a surrogate pair (an emoji)", () => {
    const hex = bytesToHex(encodeTypedData({ ...base, action: "\u{1F3B2}" }));
    expect(hex).toMatch(/^08011204f09f8eb21a/u);
  });

  it("accepts a cancel with an empty path", () => {
    expect(
      codeOf(() => encodeTypedData({ ...base, kind: "cancel", path: [] })),
    ).toBeUndefined();
  });

  const refused: readonly (readonly [string, unknown])[] = [
    ["null fields", null],
    ["undefined fields", undefined],
    ["fields that are text", "action"],
    ["kind 0", { ...base, kind: 0 }],
    ["kind 1 as a number", { ...base, kind: 1 }],
    ["an unknown kind", { ...base, kind: "bet" }],
    ["an inherited key as a kind", { ...base, kind: "toString" }],
    ["a missing kind", { ...base, kind: undefined }],
    ["a cancel with a path", { ...base, kind: "cancel", path: [0] }],
    ["a path entry of 256", { ...base, path: [0, 256] }],
    ["a negative path entry", { ...base, path: [-1] }],
    ["a fractional path entry", { ...base, path: [1.5] }],
    ["a path entry as text", { ...base, path: ["1"] }],
    ["a path that is not a list", { ...base, path: "0" }],
    ["a sequence of 0", { ...base, sequence: 0 }],
    [
      "a cancel at sequence 0",
      { ...base, kind: "cancel", path: [], sequence: 0 },
    ],
    ["a sequence of 2^32", { ...base, sequence: 2 ** 32 }],
    ["a negative sequence", { ...base, sequence: -1 }],
    ["a fractional sequence", { ...base, sequence: 1.5 }],
    ["a sequence as a bigint", { ...base, sequence: 1n }],
    ["a previous of 31 bytes", { ...base, previous: `0x${"ab".repeat(31)}` }],
    ["a previous of 33 bytes", { ...base, previous: `0x${"ab".repeat(33)}` }],
    ["a previous without 0x", { ...base, previous: "ab".repeat(32) }],
    [
      "a previous that is not hex",
      { ...base, previous: `0x${"zz".repeat(32)}` },
    ],
    ["an empty action", { ...base, action: "" }],
    [
      "an empty cancel action",
      { ...base, kind: "cancel", path: [], action: "" },
    ],
    ["an action that is not text", { ...base, action: 1 }],
    ["an action with a lone high surrogate", { ...base, action: "\uD800" }],
    ["an action with a lone low surrogate", { ...base, action: "\uDC00" }],
    ["an action with a reversed pair", { ...base, action: "\uDC00\uD800" }],
  ];

  it.each(refused)("refuses %s", (_name, fields) => {
    expect(codeOf(() => encodeTypedData(fields as TypedDataFields))).toBe(
      "invalid-input",
    );
  });
});
