// T-8: the backend's `signature/` Snapshot vectors replay with their verdicts
// through W-26's checks. Each vector is a valid Snapshot with the pinned
// values and the shell's own inputs it is checked with. The vectors pin the
// domain and the signer, not the entropy source's chain id: each is replayed
// with its own `entropyChainId` as the configured one, so check 3's
// wrong-chain case has its own unit tests (create-round-auth.test.ts).

import type { Address } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import {
  type AuthCheck,
  type CheckReason,
  checkCreateRoundAuth,
  checkReady,
  type StartRequest,
} from "./create-round-auth.ts";
import {
  configFor,
  type Pinned,
  ROUND_REQUEST,
  roundConfig,
  vendoredRound,
} from "./fixtures/round-auth.ts";
import { createdOf } from "./fixtures/round-edits.ts";
import { type SignatureVector, signatureVectors } from "./fixtures/vectors.ts";

/** The refusal reasons of W-26's checks 1 to 5. */
const REASONS: readonly (string | undefined)[] = [
  "missing",
  "pinned-mismatch",
  "cross-field",
  "recover-mismatch",
  "ready-mismatch",
] satisfies readonly CheckReason[];

type Json = Readonly<Record<string, unknown>>;

const textOf = (parent: Json, key: string): string => {
  const value = parent[key];
  if (typeof value !== "string") throw new TypeError(key);
  return value;
};

const pinnedOf = (vector: SignatureVector): Pinned => {
  const chainId = vector.pinned["chainId"];
  if (typeof chainId !== "number") throw new TypeError("pinned.chainId");
  return {
    chainId,
    verifyingContract: textOf(vector.pinned, "verifyingContract"),
    signer: textOf(vector.pinned, "signer"),
  };
};

const requestOf = (vector: SignatureVector): StartRequest => {
  const bet = vector.shell["bet"];
  if (typeof bet !== "object" || bet === null || Array.isArray(bet)) {
    throw new TypeError("shell.bet");
  }
  const amount = bet as Json;
  return {
    actionKey: textOf(vector.shell, "actionKey") as Address,
    bet: { value: textOf(amount, "value"), unit: textOf(amount, "unit") },
  };
};

/** The vector's own entropy source and chain id, as the configuration's. */
const chainsOf = (vector: SignatureVector): Record<string, number> => {
  const { proofs } = vector.snapshot;
  const auth = proofs?.createRoundAuth;
  if (proofs === undefined || auth === undefined) throw new TypeError("proofs");
  return { [proofs.randomnessProof.source]: auth.entropyChainId };
};

const replay = (vector: SignatureVector): AuthCheck =>
  checkCreateRoundAuth(
    configFor(pinnedOf(vector), chainsOf(vector)),
    requestOf(vector),
    vector.snapshot,
  );

describe("the signature/ vectors", () => {
  it("are there, and accept at least once and refuse at least once", () => {
    const verdicts = new Set(signatureVectors.map(v => v.verdict));
    expect(verdicts).toEqual(new Set(["accept", "refuse"]));
  });

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

  it.each(signatureVectors.filter(v => v.verdict === "accept"))(
    "$name passes checks 1 to 4",
    vector => {
      expect(vector.reason).toBeUndefined();
      expect(replay(vector).status).toBe("passed");
    },
  );

  it.each(signatureVectors.filter(v => v.verdict === "refuse"))(
    "$name refuses with its reason",
    vector => {
      expect(REASONS).toContain(vector.reason);
      expect(replay(vector)).toEqual({
        status: "refused",
        reason: vector.reason,
      });
    },
  );
});

describe("the vendored ready round", () => {
  it("passes checks 1 to 5 and settles T_0 as its readyHash", () => {
    const snapshot = vendoredRound();
    const auth = checkCreateRoundAuth(roundConfig(), ROUND_REQUEST, snapshot);
    expect(auth.status).toBe("passed");
    expect(checkReady(createdOf(auth), snapshot)).toEqual({
      status: "settled",
      initial: snapshot.proofs?.fairnessProof?.readyHash,
    });
  });
});
