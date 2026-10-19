// The raw keccak256 export (specs/client-kit/the-cryptography.md): known
// answers, and the seeds the fairness kernel's public vectors name as
// `keccak256("...")` of an ASCII text.

import { runInNewContext } from "node:vm";

import { kernelVectors } from "@intraverse/se-client-contracts/testing";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { SigningError } from "./errors.ts";
import { record } from "./fixtures/vectors.ts";
import { keccak256 } from "./index.ts";

const hex = (bytes: Uint8Array): string => bytesToHex(bytes);

/** Every `seed = keccak256("text")` a kernel vector's description names. */
const namedSeeds = (): { text: string; seed: string }[] =>
  Object.values(kernelVectors.v1).flatMap(file => {
    const vectors = record(file, "kernel set")["vectors"];
    if (!Array.isArray(vectors)) throw new TypeError("kernel set: no vectors");
    return vectors.flatMap((entry: unknown) => {
      const vector = record(entry, "kernel vector");
      const { description } = vector;
      const match =
        typeof description === "string"
          ? /seed = keccak256\("([^"]+)"\)/u.exec(description)
          : null;
      const seed = record(vector["input"], "kernel vector input")["seed"];
      return match?.[1] === undefined || typeof seed !== "string"
        ? []
        : [{ text: match[1], seed }];
    });
  });

describe("keccak256", () => {
  it("gives the known Keccak-256 answers, not SHA3-256's", () => {
    expect(hex(keccak256(new Uint8Array()))).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(hex(keccak256(utf8ToBytes("abc")))).toBe(
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });

  it("reproduces the seeds the kernel vectors name by their keccak256 text", () => {
    const seeds = namedSeeds();
    expect(seeds.length).toBeGreaterThanOrEqual(4);
    for (const { text, seed } of seeds) {
      expect(hex(keccak256(utf8ToBytes(text)))).toBe(seed);
    }
  });

  it("takes a Uint8Array from another realm (an iframe, jsdom)", () => {
    const foreign: unknown = runInNewContext("new Uint8Array([97, 98, 99])");
    expect(foreign instanceof Uint8Array).toBe(false);
    expect(hex(keccak256(foreign as Uint8Array))).toBe(
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });

  it("returns 32 new bytes and leaves its input unchanged", () => {
    const data = utf8ToBytes("abc");
    const first = keccak256(data);
    const second = keccak256(data);
    expect(first).toHaveLength(32);
    expect(first).not.toBe(second);
    expect(data).toEqual(utf8ToBytes("abc"));
  });

  it("refuses anything but bytes with invalid-input", () => {
    for (const value of ["abc", [1, 2, 3], new Uint16Array(2), null]) {
      const call = (): Uint8Array => keccak256(value as unknown as Uint8Array);
      expect(call).toThrow(SigningError);
      expect(call).toThrow(expect.objectContaining({ code: "invalid-input" }));
    }
  });
});
