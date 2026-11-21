import { describe, expect, it, vi } from "vitest";

import { codeOf, withByte } from "./fixtures/helpers.ts";
import { acceptedDelegation as vector } from "./fixtures/key-delegation-vectors.ts";
import { type KeyDelegation, recoverKeyDelegation } from "./key-delegation.ts";

vi.mock("@noble/hashes/sha3.js", () => ({
  keccak_256: (): Uint8Array => new Uint8Array(32),
}));

const delegation: KeyDelegation = {
  noticeHash: vector.noticeHash,
  actionKey: vector.actionKey,
  sessionId: vector.sessionIdBytes32,
  expiry: vector.expiry,
};

describe("recoverKeyDelegation", () => {
  it.each([
    ["as signed", vector.signature],
    ["with v 0", withByte(vector.signature, 64, 0)],
  ])(
    "refuses a signature %s that recovers to the zero address",
    (_name, given) => {
      expect(codeOf(() => recoverKeyDelegation(delegation, given))).toBe(
        "zero-address",
      );
    },
  );
});
