// VT-16: the vendored `key-delegation/v1` vectors replayed through check 9
// (V-22). Each vector's delegation and start replace the
// `coinflip-active-key-delegation` vector's own (the same wallet, notice, and
// round); the accepted one matches, and each refused one fails on exactly the
// comparisons named here.

import { keyDelegationVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import { failing, run } from "./fixtures/delegation-check.ts";
import { MESSAGES as M } from "./messages.ts";
import type { KeyDelegationEvidence } from "./round-evidence.ts";

type Json = Record<string, unknown>;
type Start = {
  readonly actionKey: string;
  readonly sessionIdBytes32: string;
  readonly acceptedAt: number;
};
type Vector = {
  readonly name: string;
  readonly start: Start;
  readonly keyDelegation: Json;
};

const vectors = keyDelegationVectors.v1 as {
  readonly accepted: readonly Vector[];
  readonly refused: readonly Vector[];
};

const EXPIRY_AFTER = M["delegation.expiryAfter"];

/** The vector's values, over the round's delegation. */
const evidenceOf = (vector: Vector): Partial<KeyDelegationEvidence> => ({
  wallet: String(vector.keyDelegation["wallet"]),
  expiry: Number(vector.keyDelegation["expiry"]),
  noticeHash: String(vector.keyDelegation["noticeHash"]),
  signature: String(vector.keyDelegation["signature"]),
  actionKey: vector.start.actionKey,
  sessionId: vector.start.sessionIdBytes32,
  acceptedAt: vector.start.acceptedAt,
});

/** The refused vector `name`. */
const refused = (name: string): Vector => {
  const vector = vectors.refused.find(v => v.name === name);
  if (vector === undefined) throw new TypeError(`no refused vector ${name}`);
  return vector;
};

describe("the `key-delegation/v1` vectors, replayed", () => {
  it.each(vectors.accepted.map(v => [v.name, v] as const))(
    "accepts `%s`",
    (_, vector) => {
      expect(run(evidenceOf(vector)).status).toBe("matches");
    },
  );

  it("replays every refused vector below", () => {
    expect(vectors.refused.map(v => v.name).toSorted()).toEqual(
      [
        "high-s twin",
        "v as 0",
        "v as 1",
        "another session",
        "zero wallet",
        "another action key",
        "expiry not after acceptedAt",
        "a notice not in the list",
      ].toSorted(),
    );
  });

  it.each<[string, readonly string[]]>([
    // Recovers the wallet; the canonical form is not the published one.
    ["high-s twin", ["signature"]],
    ["v as 0", ["signature"]],
    // `v` 1 recovers with the other parity: another wallet, and not canonical.
    ["v as 1", ["wallet", "signature"]],
    // The digest changes, so the canonical signature recovers another wallet.
    ["another session", ["wallet"]],
    // The signature recovers the vector's wallet, never the zero address.
    ["zero wallet", ["wallet"]],
    // Another digest (item 2), and not the key `newRound` names (item 3).
    ["another action key", ["wallet", "actionKey"]],
    ["expiry not after acceptedAt", [EXPIRY_AFTER]],
    // The page fails it on item 1, because the vector carries no notice text
    // (the round's notice does not hash to it); it never refuses an unlisted
    // notice itself (V-22 item 5: "not checked", never a mismatch).
    ["a notice not in the list", ["noticeHash"]],
  ])("fails `%s` on %j", (name, names) => {
    const result = run(evidenceOf(refused(name)));
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toEqual(names);
  });

  it("finds `a notice not in the list` unlisted, its signature the wallet's", () => {
    const result = run(evidenceOf(refused("a notice not in the list")));
    expect(result.delegation?.listed).toBe("unlisted");
    expect(result.delegation?.unchecked).toEqual([
      M["delegation.unlistedItem"],
    ]);
    // Its signature recovers the wallet, in its canonical form.
    const matches = Object.fromEntries(
      result.comparisons.map(c => [c.name, c.matches]),
    );
    expect(matches).toMatchObject({ wallet: true, signature: true });
  });
});
