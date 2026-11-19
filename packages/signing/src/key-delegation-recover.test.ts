import { describe, expect, it } from "vitest";

import { caught, codeOf, playerSigner, withByte } from "./fixtures/helpers.ts";
import { provisionalKeyDelegation as vector } from "./fixtures/provisional-key-delegation.ts";
import { sameHex } from "./hex.ts";
import {
  type KeyDelegation,
  keyDelegationDigest,
  noticeHash,
  recoverKeyDelegation,
} from "./key-delegation.ts";
import { recoverAddress } from "./signature.ts";
import { normalizeWalletSignature } from "./wallet-signature.ts";

const ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const delegation: KeyDelegation = {
  noticeHash: vector.noticeHash,
  actionKey: vector.actionKey,
  sessionId: vector.sessionIdBytes32,
  expiry: vector.expiry,
};

const { signature } = vector;
const r = signature.slice(2, 66);
const s = signature.slice(66, 130);
const ZERO = "0".repeat(64);

const vOf = (sig: string): number => Number.parseInt(sig.slice(130), 16);

const highSTwin = (sig: string): string =>
  withByte(
    `0x${sig.slice(2, 66)}${(ORDER - BigInt(`0x${sig.slice(66, 130)}`)).toString(16).padStart(64, "0")}${sig.slice(130)}`,
    64,
    55 - vOf(sig),
  );

const withRecoveryBit = (sig: string): string =>
  withByte(sig, 64, vOf(sig) - 27);

const unflippedTwin = withByte(highSTwin(signature), 64, vOf(signature));

describe("recoverKeyDelegation", () => {
  it("recovers the provisional vector's signature to its wallet, in EIP-55", () => {
    expect(recoverKeyDelegation(delegation, signature)).toEqual({
      wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      signature,
    });
    expect(
      sameHex(
        recoverKeyDelegation(delegation, signature).wallet,
        vector.wallet,
      ),
    ).toBe(true);
  });

  it.each([
    ["as signed", signature],
    ["in uppercase hex", `0x${signature.slice(2).toUpperCase()}`],
    ["with v 0", withRecoveryBit(signature)],
    ["as its high-s twin with v flipped", highSTwin(signature)],
    [
      "as its high-s twin with v as a recovery bit",
      withRecoveryBit(highSTwin(signature)),
    ],
  ])("takes the signature %s and returns the canonical one", (_name, given) => {
    const recovered = recoverKeyDelegation(delegation, given);
    expect(recovered.signature).toBe(signature);
    expect(sameHex(recovered.wallet, vector.wallet)).toBe(true);
  });

  it("reads v 1 as 28", () => {
    const asTwentyEight = withByte(signature, 64, 28);
    const recovered = recoverKeyDelegation(
      delegation,
      withByte(signature, 64, 1),
    );
    expect(recovered.signature).toBe(asTwentyEight);
    expect(recovered.wallet).toBe(recoverAddress(vector.digest, asTwentyEight));
    expect(sameHex(recovered.wallet, vector.wallet)).toBe(false);
  });

  it("recovers a high-s twin whose v was not flipped to another wallet", () => {
    expect(
      sameHex(
        recoverKeyDelegation(delegation, unflippedTwin).wallet,
        vector.wallet,
      ),
    ).toBe(false);
  });

  const own: KeyDelegation = {
    ...delegation,
    noticeHash: noticeHash("A test notice for the test key."),
  };
  const player = playerSigner();
  const signed = player.sign(keyDelegationDigest(own));

  it.each([
    ["as signed", signed],
    ["with v as a recovery bit", withRecoveryBit(signed)],
    ["as its high-s twin", highSTwin(signed)],
    [
      "as its high-s twin with v as a recovery bit",
      withRecoveryBit(highSTwin(signed)),
    ],
  ])("recovers the test key's signature %s to its address", (_name, given) => {
    expect(recoverKeyDelegation(own, given)).toEqual({
      wallet: player.address,
      signature: signed,
    });
  });

  const changed: readonly (readonly [string, KeyDelegation])[] = [
    ["the notice hash", own],
    ["the action key", { ...delegation, actionKey: vector.wallet }],
    ["the session", { ...delegation, sessionId: `0x${"11".repeat(32)}` }],
    ["the expiry", { ...delegation, expiry: vector.expiry - 1 }],
  ];

  it.each(changed)(
    "recovers the signature to another wallet when %s changes",
    (_name, given) => {
      expect(
        sameHex(recoverKeyDelegation(given, signature).wallet, vector.wallet),
      ).toBe(false);
    },
  );

  it.each([0, 1, 64, 66, 130])("refuses a %i-byte signature", length => {
    expect(
      codeOf(() =>
        recoverKeyDelegation(delegation, `0x${"1b".repeat(length)}`),
      ),
    ).toBe("invalid-signature-length");
  });

  it("refuses the 64-byte compact form of the signature", () => {
    expect(
      codeOf(() => recoverKeyDelegation(delegation, signature.slice(0, 130))),
    ).toBe("invalid-signature-length");
  });

  it.each([2, 3, 26, 29, 0x9b, 0xff])("refuses v = %i", bad => {
    expect(
      codeOf(() =>
        recoverKeyDelegation(delegation, withByte(signature, 64, bad)),
      ),
    ).toBe("invalid-signature-v");
  });

  it.each([
    ["r = 0", `0x${ZERO}${s}1b`],
    ["r = the curve order", `0x${ORDER.toString(16)}${s}1b`],
    ["s = 0", `0x${r}${ZERO}1b`],
    ["s = the curve order", `0x${r}${ORDER.toString(16)}1b`],
    ["s above the curve order", `0x${r}${(ORDER + 1n).toString(16)}1b`],
    ["r that is no point's x", `0x${"5".padStart(64, "0")}${s}1b`],
  ])("refuses %s, which it does not normalize", (_name, bad) => {
    expect(codeOf(() => recoverKeyDelegation(delegation, bad))).toBe(
      "invalid-signature",
    );
  });

  it.each([
    ["undefined", undefined],
    ["a number", 42],
    ["an empty string", ""],
    ["odd-length hex", "0x1"],
    ["hex without 0x", signature.slice(2)],
    ["a 0X prefix", `0X${signature.slice(2)}`],
    ["non-hex digits", `0x${"zz".repeat(65)}`],
  ])("refuses %s as a signature", (_name, bad) => {
    expect(codeOf(() => recoverKeyDelegation(delegation, bad))).toBe(
      "invalid-input",
    );
  });

  it("refuses a delegation that does not encode before it reads the signature", () => {
    expect(
      codeOf(() =>
        recoverKeyDelegation(
          { ...delegation, expiry: 0 },
          withByte(signature, 64, 2),
        ),
      ),
    ).toBe("invalid-input");
  });

  it("names the reason, never the signature", () => {
    const error = caught(() =>
      recoverKeyDelegation(delegation, withByte(signature, 64, 2)),
    );
    expect(String(error)).toBe(
      "SigningError: a signature's v must be 27 or 28",
    );
    expect(JSON.stringify(error)).not.toContain(r);
  });
});

describe("normalizeWalletSignature", () => {
  it("returns a canonical signature as it is, in lowercase", () => {
    expect(
      normalizeWalletSignature(`0x${signature.slice(2).toUpperCase()}`),
    ).toBe(signature);
  });

  it("is idempotent", () => {
    const once = normalizeWalletSignature(
      withRecoveryBit(highSTwin(signature)),
    );
    expect(normalizeWalletSignature(once)).toBe(once);
  });
});

describe("recoverAddress, for every other signature", () => {
  it.each([
    ["v 0", withRecoveryBit(signature), "invalid-signature-v"],
    ["v 1", withByte(signature, 64, 1), "invalid-signature-v"],
    ["a high s", highSTwin(signature), "high-s"],
  ])("still refuses the wallet's form with %s", (_name, given, code) => {
    expect(codeOf(() => recoverAddress(vector.digest, given))).toBe(code);
  });

  it("recovers the canonical signature to the wallet", () => {
    expect(
      sameHex(recoverAddress(vector.digest, signature), vector.wallet),
    ).toBe(true);
  });
});
