// The `signature/` Snapshot vectors (W-26): each is a valid Snapshot with the
// verdict the shell's CreateRoundAuth checks must reach for it. The checks are
// not built yet (specs/wrapper/signing-start-move-cash-out-and-cancel.md, the
// W-26 TODO), so the verdicts are not replayed here: replaying every vector's
// verdict through checks 1 to 5 is part of the change that builds them. What
// is checked now is that the vectors read as that replay will need them.

import { describe, expect, it } from "vitest";

import { signatureVectors } from "./fixtures/vectors.ts";

/** The refusal reasons of W-26's checks 1 to 5. */
const REASONS = [
  "missing",
  "pinned-mismatch",
  "cross-field",
  "recover-mismatch",
  "ready-mismatch",
];

describe("the signature/ vectors", () => {
  it("are there, and accept at least once and refuse at least once", () => {
    const verdicts = new Set(signatureVectors.map(v => v.verdict));
    expect(verdicts).toEqual(new Set(["accept", "refuse"]));
  });

  it.each(signatureVectors.filter(v => v.verdict === "accept"))(
    "$name accepts with no reason",
    vector => {
      expect(vector.reason).toBeUndefined();
    },
  );

  it.each(signatureVectors.filter(v => v.verdict === "refuse"))(
    "$name refuses with a W-26 reason",
    vector => {
      expect(REASONS).toContain(vector.reason);
    },
  );

  it.each(signatureVectors)(
    "$name carries a createRoundAuth and the values it is checked with",
    vector => {
      expect(vector.snapshot.proofs?.createRoundAuth).toBeDefined();
      expect(Object.keys(vector.pinned).toSorted()).toEqual([
        "chainId",
        "signer",
        "verifyingContract",
      ]);
      expect(Object.keys(vector.shell).toSorted()).toEqual([
        "actionKey",
        "bet",
      ]);
    },
  );
});
