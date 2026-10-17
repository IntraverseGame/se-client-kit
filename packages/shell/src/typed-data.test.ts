// The `typedData` text: RFC 4648 base64 of the encoder's bytes, pinned to
// outside values, and the Play API document's limits (1 to 4096 characters).

import { describe, expect, it } from "vitest";

import { toBase64, typedDataOf } from "./typed-data.ts";

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

const ACTION = {
  kind: "action",
  message: {
    action: "pick row 0 tile 0",
    path: [0],
    sequence: 1,
    round: `0x${"00".repeat(32)}`,
    previous: `0x${"00".repeat(32)}`,
  },
} as const;

describe("toBase64", () => {
  // RFC 4648, section 10, and seven bytes spanning the whole alphabet range.
  it.each<[string, Uint8Array, string]>([
    ["0 bytes", ascii(""), ""],
    ["1 byte", ascii("f"), "Zg=="],
    ["2 bytes", ascii("fo"), "Zm8="],
    ["3 bytes", ascii("foo"), "Zm9v"],
    ["6 bytes", ascii("foobar"), "Zm9vYmFy"],
    [
      "7 bytes",
      Uint8Array.of(0xff, 0xfe, 0xfd, 0x00, 0x10, 0x83, 0x3f),
      "//79ABCDPw==",
    ],
  ])("encodes %s as RFC 4648 does", (_, bytes, expected) => {
    expect(toBase64(bytes)).toBe(expected);
  });
});

describe("typedDataOf", () => {
  it("is the base64 of the encoder's bytes", () => {
    expect(typedDataOf(() => ascii("foobar"), ACTION)).toBe("Zm9vYmFy");
  });

  it("refuses an encoder that gives no bytes", () => {
    expect(() => typedDataOf(() => new Uint8Array(0), ACTION)).toThrow(
      expect.objectContaining({ code: "invalid-input" }),
    );
  });

  it("admits 4096 characters (3072 bytes) and refuses one block more", () => {
    expect(typedDataOf(() => new Uint8Array(3072), ACTION)).toHaveLength(4096);
    expect(() => typedDataOf(() => new Uint8Array(3073), ACTION)).toThrow(
      expect.objectContaining({ code: "invalid-input" }),
    );
  });
});
