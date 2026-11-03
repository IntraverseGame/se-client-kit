// V-3b, check 3 under `earlierPins`. The vector's own pair plays the earlier pair:
// it is the only pair with a signature, so the configuration's current pair is
// another one. No backend vector is involved beyond the signed round.

import { describe, expect, it } from "vitest";

import { checkReadyEvidence, checkSignature } from "./auth-checks.ts";
import type { CheckResult } from "./check-result.ts";
import {
  at,
  configFor,
  configWithEarlier,
  evidenceOf,
  highS,
  type Pinned,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";
import { MESSAGES as M } from "./messages.ts";
import type {
  CreateRoundAuthEvidence,
  RoundEvidence,
} from "./round-evidence.ts";

const ACCEPT = "create-round-auth-accept";
const RECOVERS = "signature recovers to the configured signer";
const SIGNED = signatureVector(ACCEPT).pinned;
const OTHER: Pinned = {
  chainId: 127,
  verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  signer: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
};
const THIRD: Pinned = {
  chainId: 128,
  verifyingContract: "0xc4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4",
  signer: "0x4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f",
};

/** Check 3 of `input` (the vector's, by default) under the given pairs. */
const check3 = async (
  current: Pinned,
  earlier: readonly Pinned[],
  input: unknown = signatureVector(ACCEPT).input,
) =>
  checkSignature(await evidenceOf(input), configWithEarlier(current, earlier));

const failing = (result: CheckResult): string[] =>
  result.comparisons.filter(c => !c.matches).map(c => c.name);

const recomputed = (result: CheckResult, name: string): string | undefined =>
  result.comparisons.find(c => c.name === name)?.recomputed;

const namesOf = (pinned: Pinned) => [
  { label: M["check.earlierChainId"], value: String(pinned.chainId) },
  { label: M["check.earlierContract"], value: pinned.verifyingContract },
  { label: M["check.earlierSigner"], value: pinned.signer },
];

const upper = (address: string): string =>
  `0x${address.slice(2).toUpperCase()}`;

/** The evidence with the domain's address and the signer in upper case. */
const inUpperCase = (evidence: RoundEvidence): RoundEvidence => {
  const auth = evidence.createRoundAuth as CreateRoundAuthEvidence;
  return {
    ...evidence,
    createRoundAuth: {
      ...auth,
      signer: upper(auth.signer),
      domain: {
        ...auth.domain,
        verifyingContract: upper(auth.domain.verifyingContract),
      },
    },
  };
};

describe("check 3 under a configured pair", () => {
  it("takes the current pair first, and says nothing of an earlier one", async () => {
    const { result, created } = await check3(SIGNED, [OTHER, THIRD]);
    expect(result.status).toBe("matches");
    expect(result.note).toBeUndefined();
    expect(result.details).toEqual([{ label: "created", value: created }]);
  });

  it.each([
    ["the first", [SIGNED, THIRD]],
    ["the last", [THIRD, SIGNED]],
  ])("accepts %s earlier pair, and names it", async (_, earlier) => {
    const { result, created } = await check3(OTHER, earlier);
    expect(result).toMatchObject({ id: 3, status: "matches" });
    expect(result.note).toBe(M["check.earlierSigned"]);
    expect(result.details).toEqual([
      { label: "created", value: created },
      ...namesOf(SIGNED),
    ]);
  });

  it("recovers under the earlier domain, not the current one", async () => {
    // The same signer in both pairs: only the digest's domain can tell them.
    const current = { ...OTHER, signer: SIGNED.signer };
    const { result } = await check3(current, [SIGNED]);
    expect(result.status).toBe("matches");
    expect(result.note).toBe(M["check.earlierSigned"]);
  });

  it("gives check 4 the same created under an earlier pair", async () => {
    const evidence = await evidenceOf(
      validSnapshot("coinflip-active-ready-hash"),
    );
    const { result, created } = checkSignature(
      evidence,
      configWithEarlier(OTHER, [SIGNED]),
    );
    expect(result.status).toBe("matches");
    expect(created).toBe(checkSignature(evidence, configFor(SIGNED)).created);
    expect(checkReadyEvidence(evidence, created).status).toBe("matches");
  });

  it("gives an empty list today's result for the current pair", async () => {
    const { result } = await check3(SIGNED, []);
    expect(result.status).toBe("matches");
    expect(result.note).toBeUndefined();
  });

  // The verify API's `Address` is lowercase, so a body in another case is an API
  // error before any check (V-10). The check's own comparison holds without it:
  // the evidence is changed after it is read.
  it.each<[string, Pinned, readonly Pinned[]]>([
    ["the current pair", SIGNED, []],
    ["an earlier pair", OTHER, [SIGNED]],
  ])("matches %s without address case", async (_, current, earlier) => {
    const evidence = await evidenceOf(signatureVector(ACCEPT).input);
    const { result } = checkSignature(
      inUpperCase(evidence),
      configWithEarlier(current, earlier),
    );
    expect(result.status).toBe("matches");
  });

  it("reads a body with an address in another case as an API error", async () => {
    const { input } = signatureVector(ACCEPT);
    at(input, "proofs.createRoundAuth")["signer"] = upper(SIGNED.signer);
    await expect(evidenceOf(input)).rejects.toThrow(/does not validate/u);
  });
});

describe("check 3 with no configured pair", () => {
  // The signature is good for the domain it names, by the key it names: only
  // the pairing keeps these rounds out.
  it.each<[string, Pinned, Pinned]>([
    [
      "the current domain with an earlier signer",
      { ...SIGNED, signer: OTHER.signer },
      { ...OTHER, signer: SIGNED.signer },
    ],
    [
      "an earlier domain with the current signer",
      { ...OTHER, signer: SIGNED.signer },
      { ...SIGNED, signer: OTHER.signer },
    ],
  ])(
    "refuses a validly signed mix of %s, against the current pair",
    async (_, current, earlier) => {
      const { result } = await check3(current, [earlier]);
      expect(result.status).toBe("mismatch");
      expect(result.note).toBeUndefined();
      expect(recomputed(result, "domain.chainId")).toBe(
        String(current.chainId),
      );
      expect(recomputed(result, "signer")).toBe(current.signer);
      expect(failing(result)).toContain(RECOVERS);
    },
  );

  it.each<[string, Partial<Pinned>]>([
    ["its chain id", { chainId: THIRD.chainId }],
    ["its contract", { verifyingContract: THIRD.verifyingContract }],
    ["its signer", { signer: THIRD.signer }],
  ])(
    "refuses a pair that differs from a listed one by %s",
    async (_, change) => {
      const { result } = await check3(OTHER, [{ ...SIGNED, ...change }]);
      expect(result.status).toBe("mismatch");
      expect(result.note).toBeUndefined();
      expect(recomputed(result, "signer")).toBe(OTHER.signer);
    },
  );

  it("refuses a mix of two earlier pairs", async () => {
    const { result } = await check3(OTHER, [
      { ...SIGNED, signer: THIRD.signer },
      { ...THIRD, signer: SIGNED.signer },
    ]);
    expect(result.status).toBe("mismatch");
    expect(result.note).toBeUndefined();
    expect(recomputed(result, "signer")).toBe(OTHER.signer);
  });

  it("keeps today's failure and comparisons for a pair not listed", async () => {
    const { input } = signatureVector(ACCEPT);
    const listed = await check3(OTHER, [THIRD], input);
    const none = await check3(OTHER, [], input);
    expect(listed.result).toEqual(none.result);
    expect(failing(listed.result)).toEqual([
      "domain.chainId",
      "domain.verifyingContract",
      "signer",
      RECOVERS,
    ]);
    expect(recomputed(listed.result, "domain.verifyingContract")).toBe(
      OTHER.verifyingContract,
    );
  });

  it("takes no trust from the answer's own domain and signer", async () => {
    // A round whole under the pair it names: the configuration does not hold
    // that pair, so the page does not accept it, and the digest is the current
    // domain's, so the signature does not recover to the signer it names.
    expect((await check3(SIGNED, [])).result.status).toBe("matches");
    const { result } = await check3(OTHER, [THIRD]);
    expect(result.status).toBe("mismatch");
    expect(result.note).toBeUndefined();
    expect(recomputed(result, "signer")).toBe(OTHER.signer);
    expect(recomputed(result, RECOVERS)).not.toBe(SIGNED.signer);
  });
});

describe("check 3 failing under an earlier pair", () => {
  it("refuses a listed pair whose signature recovers to another signer", async () => {
    const { input } = signatureVector(ACCEPT);
    at(input, "proofs.createRoundAuth")["signer"] = THIRD.signer;
    const listed = { ...SIGNED, signer: THIRD.signer };
    const { result } = await check3(OTHER, [listed], input);
    expect(failing(result)).toEqual([RECOVERS]);
    // It names the pair, and does not claim the round was signed under it.
    expect(result.note).toBe(M["check.earlierChecked"]);
    expect(result.details).toEqual(expect.arrayContaining(namesOf(listed)));
  });

  it("gives both reasons for a refused signature", async () => {
    const { input } = signatureVector(ACCEPT);
    const auth = at(input, "proofs.createRoundAuth");
    auth["signature"] = highS(String(auth["signature"]));
    const { result } = await check3(OTHER, [SIGNED], input);
    expect(failing(result)).toEqual([RECOVERS]);
    expect(result.note).toMatch(/refused/u);
    expect(result.note).toContain(M["check.earlierChecked"]);
  });

  it("fails the secret-hash comparison", async () => {
    const vector = signatureVector("create-round-auth-secret-hash");
    const { result } = await check3(OTHER, [vector.pinned], vector.input);
    expect(failing(result)).toEqual(["newRound.roundSecretHash"]);
    expect(result.note).toBe(M["check.earlierChecked"]);
  });
});
