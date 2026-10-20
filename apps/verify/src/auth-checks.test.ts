// VT-2, checks 1 to 4 of V-12, against the vendored Snapshot vectors: the
// `signature/` vectors (with their pinned domain and signer) and the
// `coinflip-active-ready-hash` vector's `readyHash`. Each check has a passing
// case and a case per failure.

import { describe, expect, it } from "vitest";

import {
  checkEntropyTarget,
  checkReadyEvidence,
  checkRoundId,
  checkSignature,
} from "./auth-checks.ts";
import type { CheckResult } from "./check-result.ts";
import {
  at,
  configFor,
  evidenceOf,
  ROUND_ID,
  SOURCE,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";

const ACCEPT = "create-round-auth-accept";
const OTHER_HASH = `0x${"ab".repeat(32)}`;
// secp256k1's group order, to flip a signature's `s` into the high half.
const ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** The names of the comparisons that do not match. */
const failing = (result: CheckResult): string[] =>
  result.comparisons.filter(c => !c.matches).map(c => c.name);

describe("check 1: the round id", () => {
  it("matches the asked id and its bytes32 form in newRound", async () => {
    const evidence = await evidenceOf(signatureVector(ACCEPT).input);
    const result = checkRoundId(evidence, ROUND_ID);
    expect(result).toMatchObject({ id: 1, status: "matches" });
    expect(result.comparisons).toHaveLength(2);
  });

  it("fails for another asked id", async () => {
    const evidence = await evidenceOf(signatureVector(ACCEPT).input);
    const other = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0e";
    const result = checkRoundId(evidence, other);
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toEqual(["roundId", "newRound.roundId"]);
  });

  it("fails when newRound.roundId is not the id's bytes32 form", async () => {
    const { input } = signatureVector(ACCEPT);
    at(input, "proofs.createRoundAuth.newRound")["roundId"] =
      `0x01927c5e8b3a7f219c4d5e6f7a8b9c0e${"0".repeat(32)}`;
    const result = checkRoundId(await evidenceOf(input), ROUND_ID);
    expect(failing(result)).toEqual(["newRound.roundId"]);
  });

  it("fails, with a note, when the round carries no createRoundAuth", async () => {
    const { input } = signatureVector(ACCEPT);
    delete at(input, "proofs")["createRoundAuth"];
    const result = checkRoundId(await evidenceOf(input), ROUND_ID);
    expect(result.status).toBe("mismatch");
    expect(result.note).toMatch(/createRoundAuth/u);
  });
});

describe("check 2: the entropy target", () => {
  const { input, pinned } = signatureVector(ACCEPT);
  const config = configFor(pinned);

  it("matches the vector's randomnessTarget under the pinned chain id", async () => {
    const result = checkEntropyTarget(await evidenceOf(input), config);
    expect(result).toMatchObject({ id: 2, status: "matches" });
    expect(result.details).toEqual([
      { label: "block number", value: "21000123" },
    ]);
  });

  it("fails for a source the configuration does not list", async () => {
    const result = checkEntropyTarget(
      await evidenceOf(input),
      configFor(pinned, { sources: {} }),
    );
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toEqual([
      "entropyChainId",
      "newRound.randomnessTarget",
    ]);
    expect(result.note).toMatch(/does not list/u);
  });

  it("fails when the configuration pins another chain id for the source", async () => {
    const result = checkEntropyTarget(
      await evidenceOf(input),
      configFor(pinned, {
        sources: { [SOURCE]: { chainId: 5, endpoints: [] } },
      }),
    );
    expect(failing(result)).toEqual([
      "entropyChainId",
      "newRound.randomnessTarget",
    ]);
  });

  it("fails for a tampered randomnessTarget", async () => {
    const { input: tampered } = signatureVector(ACCEPT);
    at(tampered, "proofs.createRoundAuth.newRound")["randomnessTarget"] =
      OTHER_HASH;
    const result = checkEntropyTarget(await evidenceOf(tampered), config);
    expect(failing(result)).toEqual(["newRound.randomnessTarget"]);
  });

  it("fails for another block number", async () => {
    const { input: moved } = signatureVector(ACCEPT);
    at(moved, "proofs.randomnessProof")["blockNumber"] = 21_000_124;
    const result = checkEntropyTarget(await evidenceOf(moved), config);
    expect(failing(result)).toEqual(["newRound.randomnessTarget"]);
  });
});

/** Check 3 over a `signature/` vector, under its pinned values. */
const signatureCheck = async (name: string): Promise<CheckResult> => {
  const vector = signatureVector(name);
  return checkSignature(
    await evidenceOf(vector.input),
    configFor(vector.pinned),
  ).result;
};

/** The same signature with `s` in the high half and `v` flipped (malleated). */
const highS = (signature: string): string => {
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = signature.slice(130) === "1b" ? "1c" : "1b";
  return `${signature.slice(0, 66)}${(ORDER - s).toString(16).padStart(64, "0")}${v}`;
};

describe("check 3: the backend's signature (the signature/ vectors)", () => {
  it("accepts create-round-auth-accept, and returns created", async () => {
    const vector = signatureVector(ACCEPT);
    expect(vector.verdict).toBe("accept");
    const { result, created } = checkSignature(
      await evidenceOf(vector.input),
      configFor(vector.pinned),
    );
    expect(result).toMatchObject({ id: 3, status: "matches" });
    expect(created).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.details).toEqual([{ label: "created", value: created }]);
  });

  it("refuses create-round-auth-tampered (recover-mismatch)", async () => {
    expect(signatureVector("create-round-auth-tampered").reason).toBe(
      "recover-mismatch",
    );
    const result = await signatureCheck("create-round-auth-tampered");
    expect(failing(result)).toEqual([
      "signature recovers to the configured signer",
    ]);
  });

  it("refuses create-round-auth-unpinned-signer (pinned-mismatch)", async () => {
    expect(signatureVector("create-round-auth-unpinned-signer").reason).toBe(
      "pinned-mismatch",
    );
    const result = await signatureCheck("create-round-auth-unpinned-signer");
    expect(failing(result)).toEqual([
      "signer",
      "signature recovers to the configured signer",
    ]);
  });

  it("refuses create-round-auth-secret-hash (cross-field)", async () => {
    expect(signatureVector("create-round-auth-secret-hash").reason).toBe(
      "cross-field",
    );
    const result = await signatureCheck("create-round-auth-secret-hash");
    expect(failing(result)).toEqual(["newRound.roundSecretHash"]);
  });

  // The vector's refusal compares newRound.actionKey with the shell's own
  // action key. The page has no player and no key (V-12, check 3 names no
  // such comparison), so for the page the signature is good.
  it("passes create-round-auth-action-key: the page holds no action key", async () => {
    const vector = signatureVector("create-round-auth-action-key");
    expect(vector).toMatchObject({ verdict: "refuse", reason: "cross-field" });
    expect((await signatureCheck("create-round-auth-action-key")).status).toBe(
      "matches",
    );
  });

  it("refuses a pinned domain other than the evidence's", async () => {
    const vector = signatureVector(ACCEPT);
    const result = checkSignature(
      await evidenceOf(vector.input),
      configFor({ ...vector.pinned, chainId: 1 }),
    ).result;
    expect(failing(result)).toEqual([
      "domain.chainId",
      "signature recovers to the configured signer",
    ]);
  });

  it("refuses a signature with a high s, as not canonical", async () => {
    const vector = signatureVector(ACCEPT);
    const auth = at(vector.input, "proofs.createRoundAuth");
    auth["signature"] = highS(String(auth["signature"]));
    const result = checkSignature(
      await evidenceOf(vector.input),
      configFor(vector.pinned),
    ).result;
    expect(failing(result)).toEqual([
      "signature recovers to the configured signer",
    ]);
    expect(result.note).toMatch(/refused/u);
  });

  it("refuses a signature with r out of range (zero)", async () => {
    const vector = signatureVector(ACCEPT);
    const auth = at(vector.input, "proofs.createRoundAuth");
    auth["signature"] =
      `0x${"0".repeat(64)}${String(auth["signature"]).slice(66)}`;
    const result = checkSignature(
      await evidenceOf(vector.input),
      configFor(vector.pinned),
    ).result;
    expect(failing(result)).toEqual([
      "signature recovers to the configured signer",
    ]);
    expect(result.note).toMatch(/refused/u);
  });

  it("fails, with no created, when the round carries no createRoundAuth", async () => {
    const vector = signatureVector(ACCEPT);
    delete at(vector.input, "proofs")["createRoundAuth"];
    const { result, created } = checkSignature(
      await evidenceOf(vector.input),
      configFor(vector.pinned),
    );
    expect(result.status).toBe("mismatch");
    expect(created).toBeUndefined();
  });
});

describe("check 4: the ready evidence (coinflip-active-ready-hash)", () => {
  const pinned = signatureVector(ACCEPT).pinned;

  const readyCheck = async (snapshot: Record<string, unknown>) => {
    const evidence = await evidenceOf(snapshot);
    const { created } = checkSignature(evidence, configFor(pinned));
    return checkReadyEvidence(evidence, created);
  };

  it("matches the vector's readyHash", async () => {
    const result = await readyCheck(
      validSnapshot("coinflip-active-ready-hash"),
    );
    expect(result).toMatchObject({ id: 4, status: "matches" });
  });

  it("fails for a tampered readyHash", async () => {
    const snapshot = validSnapshot("coinflip-active-ready-hash");
    at(snapshot, "proofs.fairnessProof")["readyHash"] = OTHER_HASH;
    const result = await readyCheck(snapshot);
    expect(failing(result)).toEqual(["fairnessProof.readyHash"]);
  });

  it("fails for a tampered seedHash", async () => {
    const snapshot = validSnapshot("coinflip-active-ready-hash");
    at(snapshot, "proofs.fairnessProof")["seedHash"] = OTHER_HASH;
    expect((await readyCheck(snapshot)).status).toBe("mismatch");
  });

  it("fails, with a note, when the round carries no fairnessProof", async () => {
    const snapshot = validSnapshot("coinflip-active-ready-hash");
    delete at(snapshot, "proofs")["fairnessProof"];
    const result = await readyCheck(snapshot);
    expect(result.status).toBe("mismatch");
    expect(result.note).toMatch(/fairnessProof/u);
  });

  it("fails when created could not be recomputed", async () => {
    const snapshot = validSnapshot("coinflip-active-ready-hash");
    delete at(snapshot, "proofs")["createRoundAuth"];
    const evidence = await evidenceOf(snapshot);
    const { created } = checkSignature(evidence, configFor(pinned));
    const result = checkReadyEvidence(evidence, created);
    expect(result.status).toBe("mismatch");
    expect(result.note).toMatch(/created/u);
  });
});
