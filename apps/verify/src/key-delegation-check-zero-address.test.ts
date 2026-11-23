// VT-16: check 9 (V-22) with a signature that recovers to the zero address. No
// key is known whose address is zero, and the page takes `signing` from its
// build, where Keccak-256 cannot be replaced as `signing`'s own zero-address
// tests replace it. So `recoverKeyDelegation` is replaced for this file by
// the refusal `signing` makes for such a signature (`zero-address`, proven in
// `packages/signing/src/key-delegation-zero-address.test.ts`): check 9
// reports a mismatch naming the signature, never an exception.

import { SigningError } from "@intraverse/se-client-signing";
import { describe, expect, it, vi } from "vitest";

import { run } from "./fixtures/delegation-check.ts";
import { MESSAGES as M } from "./messages.ts";

vi.mock(import("@intraverse/se-client-signing"), async original => ({
  ...(await original()),
  recoverKeyDelegation: () => {
    throw new SigningError("zero-address");
  },
}));

describe("a delegation signature that recovers to the zero address", () => {
  it("is a mismatch naming the signature, nothing recovered", () => {
    const result = run();
    expect(result.status).toBe("mismatch");
    expect(result.note).toBe(`${M["delegation.refused"]} (signature).`);
    expect(
      result.comparisons
        .filter(c => c.recomputed === undefined)
        .map(c => c.name),
    ).toEqual(["wallet", "signature"]);
  });
});
