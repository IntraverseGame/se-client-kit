import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import { describe, expect, it } from "vitest";

import { encodeType, hashStruct, typeHash } from "./eip712.ts";
import { withByte } from "./fixtures/helpers.ts";
import {
  type AcceptedKeyDelegation,
  acceptedDelegation as accepted,
  type DelegatedStart,
  keyDelegation,
  refusedDelegation,
} from "./fixtures/key-delegation-vectors.ts";
import { checksumAddress, decodeHex, sameHex } from "./hex.ts";
import { readKeyDelegationNotices } from "./key-delegation-notices.ts";
import {
  hashKeyDelegation,
  type KeyDelegation,
  keyDelegationDigest,
  keyDelegationTypedData,
  noticeHash,
  type RecoveredKeyDelegation,
  recoverKeyDelegation,
  sessionIdBytes32,
} from "./key-delegation.ts";
import { KEY_DELEGATION, KEY_DELEGATION_DOMAIN } from "./types.ts";

// The backend's `key-delegation/v1 vectors`, vendored in `contracts`. The
// backend refuses each refused vector with its code; `signing` normalizes the
// wallet's signature forms and recovers, and the comparisons that refuse the
// rest (the wallet, the expiry, the notice) are the caller's.

const delegationOf = (start: DelegatedStart): KeyDelegation => ({
  noticeHash: start.noticeHash,
  actionKey: start.actionKey,
  sessionId: sessionIdBytes32(start.sessionId),
  expiry: start.expiry,
});

const recovered = (start: DelegatedStart): RecoveredKeyDelegation =>
  recoverKeyDelegation(delegationOf(start), start.signature);

const publishedHashes = new Set(
  readKeyDelegationNotices(keyDelegationNotices).map(
    notice => notice.noticeHash,
  ),
);

describe("the vendored key-delegation vectors", () => {
  it("name the domain's type and its hash", () => {
    expect(encodeType(KEY_DELEGATION_DOMAIN)).toBe(
      keyDelegation.domainEncodeType,
    );
    expect(typeHash(KEY_DELEGATION_DOMAIN)).toBe(keyDelegation.domainTypeHash);
  });

  it("were signed by the public development account, which the accepted vector recovers to", () => {
    expect(accepted.wallet).toBe(keyDelegation.devAddress);
    expect(recovered(accepted)).toEqual({
      wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      signature: accepted.signature,
    });
  });

  it("are all covered below: the accepted ones by name and notice", () => {
    expect(
      keyDelegation.accepted.map(vector => [vector.name, vector.noticeId]),
    ).toEqual([["en-draft-1", "en-draft-1"]]);
  });

  it.each([...keyDelegation.accepted, ...keyDelegation.refused])(
    "map the session of $name to its bytes32",
    start => {
      expect(sessionIdBytes32(start.sessionId)).toBe(start.sessionIdBytes32);
    },
  );

  it("are all covered below, each with one of the three codes", () => {
    expect(
      keyDelegation.refused.map(vector => [vector.name, vector.code]),
    ).toEqual([
      ["high-s twin", "KEY_DELEGATION_INVALID"],
      ["v as 0", "KEY_DELEGATION_INVALID"],
      ["v as 1", "KEY_DELEGATION_INVALID"],
      ["another session", "KEY_DELEGATION_INVALID"],
      ["another action key", "KEY_DELEGATION_INVALID"],
      ["zero wallet", "KEY_DELEGATION_INVALID"],
      ["expiry not after acceptedAt", "KEY_DELEGATION_EXPIRED"],
      ["a notice not in the list", "KEY_DELEGATION_NOTICE_UNKNOWN"],
    ]);
  });
});

describe.each(keyDelegation.accepted)(
  "the accepted vector $name",
  (vector: AcceptedKeyDelegation) => {
    it("signs a notice of the published list, by its id and hash", () => {
      const notices = readKeyDelegationNotices(keyDelegationNotices);
      expect(
        notices.find(notice => notice.id === vector.noticeId),
      ).toMatchObject({ text: vector.notice, noticeHash: vector.noticeHash });
      expect(noticeHash(vector.notice)).toBe(vector.noticeHash);
    });

    it("has the typed data keyDelegationTypedData rebuilds", () => {
      const typed = keyDelegationTypedData({
        notice: vector.notice,
        actionKey: vector.actionKey,
        sessionId: vector.sessionIdBytes32,
        expiry: vector.expiry,
      });
      const given = vector.typedData;
      expect(typed.types).toEqual(given.types);
      expect(typed.primaryType).toBe(given.primaryType);
      expect(typed.domain).toEqual(given.domain);
      expect(typed.domain).toEqual({
        name: keyDelegation.domainName,
        version: keyDelegation.domainVersion,
      });
      // The file spells the action key in lowercase and the expiry as a JSON
      // number; the kit sends EIP-55 and a decimal string, which encode alike.
      expect(typed.message).toEqual({
        notice: given.message.notice,
        actionKey: checksumAddress(decodeHex(given.message.actionKey, 20)),
        sessionId: given.message.sessionId,
        expiry: String(given.message.expiry),
      });
    });

    it("has the struct hash and the digest, from the text or from its hash", () => {
      const typed = keyDelegationTypedData({
        notice: vector.notice,
        actionKey: vector.actionKey,
        sessionId: vector.sessionIdBytes32,
        expiry: vector.expiry,
      });
      expect(hashStruct(KEY_DELEGATION, typed.message)).toBe(vector.structHash);
      // The encoder takes a uint64 from a bigint or a decimal string only.
      expect(
        hashStruct(KEY_DELEGATION, {
          ...vector.typedData.message,
          expiry: BigInt(vector.typedData.message.expiry),
        }),
      ).toBe(vector.structHash);
      expect(hashKeyDelegation(delegationOf(vector))).toBe(vector.structHash);
      expect(keyDelegationDigest(delegationOf(vector))).toBe(vector.digest);
    });

    it("recovers its canonical signature to its wallet", () => {
      expect(recovered(vector).signature).toBe(vector.signature);
      expect(sameHex(recovered(vector).wallet, vector.wallet)).toBe(true);
    });
  },
);

describe("the refused vectors", () => {
  it.each(["high-s twin", "v as 0"])(
    "normalize the %s to the accepted signature's canonical bytes",
    name => {
      expect(recovered(refusedDelegation(name))).toEqual(recovered(accepted));
    },
  );

  it("read v as 1 as 28, which recovers to another wallet", () => {
    const vector = refusedDelegation("v as 1");
    const result = recovered(vector);
    expect(result.signature).toBe(withByte(accepted.signature, 64, 28));
    expect(sameHex(result.wallet, vector.wallet)).toBe(false);
  });

  it.each(["another session", "another action key"])(
    "recover %s to another wallet than the one claimed",
    name => {
      const vector = refusedDelegation(name);
      expect(sameHex(recovered(vector).wallet, vector.wallet)).toBe(false);
    },
  );

  it("recover the zero wallet's signature to the signer, never to the zero address", () => {
    const vector = refusedDelegation("zero wallet");
    expect(vector.wallet).toBe(`0x${"0".repeat(40)}`);
    expect(sameHex(recovered(vector).wallet, keyDelegation.devAddress)).toBe(
      true,
    );
  });

  it("leave an expiry not after the start to the caller: the signature recovers", () => {
    const vector = refusedDelegation("expiry not after acceptedAt");
    expect(vector.expiry).toBeLessThanOrEqual(vector.acceptedAt);
    expect(sameHex(recovered(vector).wallet, vector.wallet)).toBe(true);
  });

  it("leave a notice not in the list to the caller: the signature recovers over its hash", () => {
    const vector = refusedDelegation("a notice not in the list");
    expect(publishedHashes.has(vector.noticeHash)).toBe(false);
    expect(publishedHashes.has(accepted.noticeHash)).toBe(true);
    expect(sameHex(recovered(vector).wallet, vector.wallet)).toBe(true);
  });
});
