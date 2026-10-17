// T-1 (specs/wrapper.md, W-20, W-21, W-25): the independent signer's
// `PlayerCancel` vector (`signed-action/coinflip-cancel`, Foundry cast),
// reproduced before the shell signs a cancel: the type hash, the domain
// separator, the struct hash, the digest, and the exact signature bytes of the
// deterministic (RFC 6979) signer with the test key; both signatures recover
// to the test key's address.

import { describe, expect, it } from "vitest";

import { encodeType, typeHash, typedDataDigest } from "./eip712.ts";
import { playerSigner } from "./fixtures/helpers.ts";
import { coinflipCancel } from "./fixtures/signed-action-vectors.ts";
import { coinflipReadyHash } from "./fixtures/typed-data-vectors.ts";
import {
  domainSeparator,
  hashPlayerAction,
  hashPlayerCancel,
  hashPlayerCashOut,
} from "./messages.ts";
import { recoverAddress } from "./signature.ts";
import { PLAYER_CANCEL } from "./types.ts";

const vector = coinflipCancel();
const player = playerSigner();

describe("the PlayerCancel vector (signed-action/coinflip-cancel)", () => {
  it("is a PlayerCancel", () => {
    expect(vector.primaryType).toBe(PLAYER_CANCEL.name);
  });

  it("reproduces the type and its type hash", () => {
    expect(encodeType(PLAYER_CANCEL)).toBe(vector.encodeType);
    expect(typeHash(PLAYER_CANCEL)).toBe(vector.typeHash);
  });

  it("reproduces the domain separator", () => {
    expect(domainSeparator(vector.domain)).toBe(vector.domainSeparator);
  });

  it("reproduces the struct hash and the digest", () => {
    const structHash = hashPlayerCancel(vector.message);
    expect(structHash).toBe(vector.structHash);
    expect(typedDataDigest(vector.domainSeparator, structHash)).toBe(
      vector.digest,
    );
  });

  it("signs the digest with the test key to the vector's exact bytes", () => {
    expect(player.address.toLowerCase()).toBe(vector.address.toLowerCase());
    expect(player.sign(vector.digest)).toBe(vector.signature);
  });

  it("recovers the vector's signature and the kit's own to the test key's address", () => {
    const own = player.sign(vector.digest);
    for (const signature of [vector.signature, own]) {
      expect(recoverAddress(vector.digest, signature).toLowerCase()).toBe(
        vector.address.toLowerCase(),
      );
    }
  });

  it("is the cancel the shell signs: cancel, empty path, sequence 1, previous = T_0", () => {
    expect(vector.message).toEqual({
      action: "cancel",
      path: [],
      sequence: 1,
      round: vector.message.round,
      previous: coinflipReadyHash,
    });
    expect(vector.round).toBe("snapshot/valid/coinflip-active-ready-hash");
  });

  it("is not the hash of a move or a cash-out of the same fields", () => {
    expect(hashPlayerAction(vector.message)).not.toBe(vector.structHash);
    expect(hashPlayerCashOut(vector.message)).not.toBe(vector.structHash);
  });

  it("does not verify a cancel whose previous was changed", () => {
    const changed = hashPlayerCancel({
      ...vector.message,
      previous: vector.structHash,
    });
    const digest = typedDataDigest(vector.domainSeparator, changed);
    expect(recoverAddress(digest, vector.signature).toLowerCase()).not.toBe(
      vector.address.toLowerCase(),
    );
  });
});
