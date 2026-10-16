// T-2: recovery refuses the zero address. No key is known whose address is
// zero, so Keccak-256 is replaced for this file: every hash is zero, and a
// valid vector signature then "recovers" to the zero address.

import { describe, expect, it, vi } from "vitest";

import { actionVector, codeOf } from "./fixtures/helpers.ts";
import { recoverAddress } from "./signature.ts";

vi.mock("@noble/hashes/sha3.js", () => ({
  keccak_256: (): Uint8Array => new Uint8Array(32),
}));

describe("recoverAddress", () => {
  it("refuses a signature that recovers to the zero address", () => {
    const { digest, signature } = actionVector(0);
    expect(codeOf(() => recoverAddress(digest, signature))).toBe(
      "zero-address",
    );
  });
});
