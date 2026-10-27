// T-1 (specs/wrapper.md, W-20, W-21, W-24): the independent signer's
// `PlayerCashOut` vector (`signed-action/cashorcrash-cash-out`, Foundry cast),
// reproduced: the type hash, the domain separator, the struct hash, the
// digest, and the exact signature bytes of the deterministic (RFC 6979) signer
// with the test key; both signatures recover to the test key's address. Its
// chain is the round's: the pick (`typed-data/cashorcrash-pick`) links to the
// round's `readyHash` (T_0), and the cash-out's `previous` is the pick's
// struct hash (T_1).

import { describe, expect, it } from "vitest";

import { encodeType, typeHash, typedDataDigest } from "./eip712.ts";
import { playerSigner } from "./fixtures/helpers.ts";
import { cashOrCrashCashOut } from "./fixtures/signed-action-vectors.ts";
import {
  cashOrCrashReadyHash,
  roundIdOf,
  typedDataVectors,
} from "./fixtures/typed-data-vectors.ts";
import type { Bytes32 } from "./hex.ts";
import {
  domainSeparator,
  hashPlayerAction,
  hashPlayerCancel,
  hashPlayerCashOut,
} from "./messages.ts";
import { recoverAddress } from "./signature.ts";
import { PLAYER_CASH_OUT } from "./types.ts";

const vector = cashOrCrashCashOut();
const player = playerSigner();

/**
 * A Snapshot `roundId` (UUID text) as the round's EIP-712 `bytes32`, as the
 * shell encodes it: its 16 bytes, left-aligned, then 16 zero bytes.
 */
const roundBytes32 = (roundId: string): Bytes32 =>
  `0x${roundId.toLowerCase().replaceAll("-", "").padEnd(64, "0")}`;

const typedData = (name: string): (typeof typedDataVectors)[number] => {
  const found = typedDataVectors.find(each => each.name === name);
  if (found === undefined) throw new Error(`no typed-data/${name}`);
  return found;
};

describe("the PlayerCashOut vector (signed-action/cashorcrash-cash-out)", () => {
  it("is a PlayerCashOut", () => {
    expect(vector.primaryType).toBe(PLAYER_CASH_OUT.name);
  });

  it("reproduces the type and its type hash", () => {
    expect(encodeType(PLAYER_CASH_OUT)).toBe(vector.encodeType);
    expect(typeHash(PLAYER_CASH_OUT)).toBe(vector.typeHash);
  });

  it("reproduces the domain separator", () => {
    expect(domainSeparator(vector.domain)).toBe(vector.domainSeparator);
  });

  it("reproduces the struct hash and the digest", () => {
    const structHash = hashPlayerCashOut(vector.message);
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

  it("is the cash-out of typed-data/cashorcrash-cash-out on the round of valid/cashorcrash-cash-out-active-step1", () => {
    const cashOut = typedData("cashorcrash-cash-out");
    expect(cashOut.fields.kind).toBe("cash-out");
    expect(vector.message).toEqual({
      action: cashOut.fields.action,
      path: cashOut.fields.path,
      sequence: cashOut.fields.sequence,
      round: roundBytes32(roundIdOf("cashorcrash-cash-out-active-step1")),
      previous: cashOut.fields.previous,
    });
    expect(vector.round).toBe(
      "snapshot/valid/cashorcrash-cash-out-active-step1",
    );
  });

  it("chains on the round: the pick's previous is T_0, the cash-out's is the pick's struct hash", () => {
    const pick = typedData("cashorcrash-pick").fields;
    expect(pick.kind).toBe("action");
    expect(pick.sequence).toBe(1);
    expect(pick.previous).toBe(cashOrCrashReadyHash);
    const pickHash = hashPlayerAction({
      action: pick.action,
      path: pick.path,
      sequence: pick.sequence,
      round: vector.message.round,
      previous: pick.previous,
    });
    expect(vector.message.previous).toBe(pickHash);
    expect(vector.message.sequence).toBe(pick.sequence + 1);
  });

  it("is not the hash of a move or a cancel of the same fields", () => {
    expect(hashPlayerAction(vector.message)).not.toBe(vector.structHash);
    expect(hashPlayerCancel(vector.message)).not.toBe(vector.structHash);
  });

  it("does not verify a cash-out whose previous was changed", () => {
    const changed = hashPlayerCashOut({
      ...vector.message,
      previous: vector.structHash,
    });
    const digest = typedDataDigest(vector.domainSeparator, changed);
    expect(recoverAddress(digest, vector.signature).toLowerCase()).not.toBe(
      vector.address.toLowerCase(),
    );
  });
});
