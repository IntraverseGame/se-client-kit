import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  encodeData,
  hashStruct,
  type StructType,
  typedDataDigest,
  typeHash,
} from "./eip712.ts";
import { codeOf } from "./fixtures/helpers.ts";
import {
  acceptedDelegation as vector,
  keyDelegation,
} from "./fixtures/key-delegation-vectors.ts";
import { type Address, type Bytes32, decodeHex, encodeHex } from "./hex.ts";
import {
  hashKeyDelegation,
  keyDelegationDigest,
  type KeyDelegationMessage,
  type KeyDelegationTypedData,
  keyDelegationTypedData,
  noticeHash,
} from "./key-delegation.ts";
import { KEY_DELEGATION, KEY_DELEGATION_DOMAIN } from "./types.ts";

const NOTICE =
  "A test notice: this action key acts for my wallet for one session.";
const CHECKSUMMED_ACTION_KEY: Address =
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const message: KeyDelegationMessage = {
  notice: NOTICE,
  actionKey: vector.actionKey,
  sessionId: vector.sessionIdBytes32,
  expiry: vector.expiry,
};

const ownDelegation = {
  noticeHash: noticeHash(NOTICE),
  actionKey: vector.actionKey,
  sessionId: vector.sessionIdBytes32,
  expiry: vector.expiry,
};

const FIELDS_AFTER_NOTICE: StructType = {
  name: KEY_DELEGATION.name,
  fields: KEY_DELEGATION.fields.slice(1),
};

const structHashOfNoticeHash = (
  notice: Bytes32,
  typed: KeyDelegationTypedData,
): Bytes32 =>
  encodeHex(
    keccak_256(
      concatBytes(
        decodeHex(typeHash(KEY_DELEGATION), 32),
        decodeHex(notice, 32),
        ...encodeData(FIELDS_AFTER_NOTICE, {
          actionKey: typed.message.actionKey,
          sessionId: typed.message.sessionId,
          expiry: typed.message.expiry,
        }),
      ),
    ),
  );

describe("keyDelegationTypedData", () => {
  it("builds the exact eth_signTypedData_v4 JSON", () => {
    expect(JSON.stringify(keyDelegationTypedData(message))).toBe(
      [
        '{"types":{"EIP712Domain":[{"name":"name","type":"string"},',
        '{"name":"version","type":"string"}],"KeyDelegation":[',
        '{"name":"notice","type":"string"},',
        '{"name":"actionKey","type":"address"},',
        '{"name":"sessionId","type":"bytes32"},',
        '{"name":"expiry","type":"uint64"}]},',
        '"primaryType":"KeyDelegation",',
        '"domain":{"name":"SuperEngine KeyDelegation","version":"1"},',
        `"message":{"notice":${JSON.stringify(NOTICE)},`,
        `"actionKey":"${CHECKSUMMED_ACTION_KEY}",`,
        `"sessionId":"${vector.sessionIdBytes32}",`,
        `"expiry":"${vector.expiry}"}}`,
      ].join(""),
    );
  });

  it.each([
    [1, "1"],
    [vector.expiry, "1795000000"],
    [Number.MAX_SAFE_INTEGER, "9007199254740991"],
  ])("writes an expiry of %i as the decimal string %s", (expiry, text) => {
    expect(keyDelegationTypedData({ ...message, expiry }).message.expiry).toBe(
      text,
    );
  });

  it("encodes, by its own types and domain, to the digest of the notice's hash", () => {
    const typed = keyDelegationTypedData(message);
    const struct: StructType = {
      name: typed.primaryType,
      fields: typed.types.KeyDelegation,
    };
    const domain: StructType = {
      name: "EIP712Domain",
      fields: typed.types.EIP712Domain,
    };
    const separator = hashStruct(domain, typed.domain);
    expect(typeHash(struct)).toBe(keyDelegation.typeHash);
    expect(separator).toBe(keyDelegation.domainSeparator);
    expect(typedDataDigest(separator, hashStruct(struct, typed.message))).toBe(
      keyDelegationDigest(ownDelegation),
    );
  });

  it("gives the same struct hash with the expiry read from the string or from the number", () => {
    const typed = keyDelegationTypedData(message);
    const fromString = hashStruct(KEY_DELEGATION, typed.message);
    expect(fromString).toBe(
      hashStruct(KEY_DELEGATION, {
        ...typed.message,
        expiry: BigInt(message.expiry),
      }),
    );
    expect(fromString).toBe(hashKeyDelegation(ownDelegation));
  });

  it("gives the accepted vector's struct hash and digest from its fields and the notice's hash", () => {
    const structHash = structHashOfNoticeHash(
      vector.noticeHash,
      keyDelegationTypedData(message),
    );
    expect(structHash).toBe(vector.structHash);
    expect(typedDataDigest(keyDelegation.domainSeparator, structHash)).toBe(
      vector.digest,
    );
  });

  it("spells the action key in EIP-55 and the session in lowercase, whatever the input's case", () => {
    const typed = keyDelegationTypedData({
      ...message,
      actionKey: `0x${vector.actionKey.slice(2).toUpperCase()}`,
      sessionId: `0x${vector.sessionIdBytes32.slice(2).toUpperCase()}`,
    });
    expect(typed.message.actionKey).toBe(CHECKSUMMED_ACTION_KEY);
    expect(typed.message.sessionId).toBe(vector.sessionIdBytes32);
  });

  it("spells the registry's types exactly", () => {
    const typed = keyDelegationTypedData(message);
    expect(typed.types.EIP712Domain).toEqual(KEY_DELEGATION_DOMAIN.fields);
    expect(typed.types.KeyDelegation).toEqual(KEY_DELEGATION.fields);
    expect(typed.primaryType).toBe(KEY_DELEGATION.name);
  });

  it("returns new objects, never the registry's", () => {
    const first = keyDelegationTypedData(message);
    const second = keyDelegationTypedData(message);
    expect(first).toEqual(second);
    expect(first.types.KeyDelegation).not.toBe(second.types.KeyDelegation);
    expect(first.types.KeyDelegation).not.toBe(KEY_DELEGATION.fields);
    expect(first.domain).not.toBe(second.domain);
  });

  it("copies no field but the four of the type", () => {
    const withChainId = { ...message, chainId: 1 };
    expect(Object.keys(keyDelegationTypedData(withChainId).message)).toEqual([
      "notice",
      "actionKey",
      "sessionId",
      "expiry",
    ]);
  });

  const refused: readonly (readonly [string, KeyDelegationMessage])[] = [
    ["a notice with a lone surrogate", { ...message, notice: "\uD800" }],
    [
      "an action key of 19 bytes",
      { ...message, actionKey: `0x${"ab".repeat(19)}` },
    ],
    [
      "a session of 31 bytes",
      { ...message, sessionId: `0x${"ab".repeat(31)}` },
    ],
    ["an expiry of 0", { ...message, expiry: 0 }],
    ["an expiry of 2^53", { ...message, expiry: 2 ** 53 }],
    ["a fractional expiry", { ...message, expiry: 1.5 }],
  ];

  it.each(refused)("refuses %s", (_name, given) => {
    expect(codeOf(() => keyDelegationTypedData(given))).toBe("invalid-input");
  });
});
