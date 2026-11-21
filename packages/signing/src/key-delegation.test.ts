import { describe, expect, it } from "vitest";

import { encodeType, hashStruct, typedDataDigest, typeHash } from "./eip712.ts";
import { codeOf } from "./fixtures/helpers.ts";
import {
  acceptedDelegation as vector,
  keyDelegation,
} from "./fixtures/key-delegation-vectors.ts";
import { type Address, type Bytes32, encodeHex } from "./hex.ts";
import { keccak256 } from "./keccak.ts";
import {
  hashKeyDelegation,
  type KeyDelegation,
  keyDelegationDigest,
  keyDelegationDomainSeparator,
  noticeHash,
  sessionIdBytes32,
} from "./key-delegation.ts";
import { KEY_DELEGATION, KEY_DELEGATION_DOMAIN } from "./types.ts";

const NOTICE =
  "A test notice: this action key acts for my wallet for one session.";
const CHECKSUMMED_ACTION_KEY: Address =
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const delegation: KeyDelegation = {
  noticeHash: vector.noticeHash,
  actionKey: vector.actionKey,
  sessionId: sessionIdBytes32(vector.sessionId),
  expiry: vector.expiry,
};

const ownDelegation: KeyDelegation = {
  ...delegation,
  noticeHash: noticeHash(NOTICE),
};

const structHashOfText = (expiry: number): Bytes32 =>
  hashStruct(KEY_DELEGATION, {
    notice: NOTICE,
    actionKey: vector.actionKey,
    sessionId: vector.sessionIdBytes32,
    expiry: BigInt(expiry),
  });

describe("the KeyDelegation type and its domain", () => {
  it("reproduces the type string and its type hash", () => {
    expect(encodeType(KEY_DELEGATION)).toBe(keyDelegation.encodeType);
    expect(typeHash(KEY_DELEGATION)).toBe(keyDelegation.typeHash);
  });

  it("reproduces the chainless domain and its separator", () => {
    expect(encodeType(KEY_DELEGATION_DOMAIN)).toBe(
      keyDelegation.domainEncodeType,
    );
    expect(keyDelegationDomainSeparator()).toBe(keyDelegation.domainSeparator);
  });
});

describe("hashKeyDelegation and keyDelegationDigest", () => {
  it("reproduce the struct hash and the digest from the notice's hash", () => {
    expect(hashKeyDelegation(delegation)).toBe(vector.structHash);
    expect(keyDelegationDigest(delegation)).toBe(vector.digest);
  });

  it("is the 0x1901 digest of the struct hash over the chainless domain", () => {
    expect(keyDelegationDigest(delegation)).toBe(
      typedDataDigest(keyDelegation.domainSeparator, vector.structHash),
    );
  });

  it("gives the struct hash of the notice as text", () => {
    expect(hashKeyDelegation(ownDelegation)).toBe(
      structHashOfText(vector.expiry),
    );
  });

  it("accepts the action key in EIP-55 or in uppercase", () => {
    expect(
      keyDelegationDigest({ ...delegation, actionKey: CHECKSUMMED_ACTION_KEY }),
    ).toBe(vector.digest);
    expect(
      keyDelegationDigest({
        ...delegation,
        actionKey: `0x${vector.actionKey.slice(2).toUpperCase()}`,
      }),
    ).toBe(vector.digest);
  });

  it.each([1, Number.MAX_SAFE_INTEGER])(
    "takes an expiry of %i as its uint64 word",
    expiry => {
      expect(hashKeyDelegation({ ...ownDelegation, expiry })).toBe(
        structHashOfText(expiry),
      );
    },
  );

  it.each([0, -1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses an expiry of %d",
    expiry => {
      expect(codeOf(() => keyDelegationDigest({ ...delegation, expiry }))).toBe(
        "invalid-input",
      );
    },
  );

  const refused: readonly (readonly [string, KeyDelegation])[] = [
    [
      "a notice hash of 31 bytes",
      { ...delegation, noticeHash: `0x${"ab".repeat(31)}` },
    ],
    [
      "a notice hash that is not hex",
      { ...delegation, noticeHash: `0x${"zz".repeat(32)}` },
    ],
    [
      "an action key of 32 bytes",
      { ...delegation, actionKey: vector.sessionIdBytes32 },
    ],
    [
      "a session of 16 bytes",
      { ...delegation, sessionId: `0x${vector.sessionId.slice(4)}` },
    ],
  ];

  it.each(refused)("refuses %s", (_name, given) => {
    expect(codeOf(() => keyDelegationDigest(given))).toBe("invalid-input");
  });

  it("refuses a field not of the type", () => {
    const withChainId = { ...delegation, chainId: 1 };
    expect(codeOf(() => hashKeyDelegation(withChainId))).toBe("invalid-input");
  });

  const changed: readonly (readonly [string, KeyDelegation])[] = [
    ["the notice", ownDelegation],
    ["the action key", { ...delegation, actionKey: vector.wallet }],
    [
      "the session",
      {
        ...delegation,
        sessionId: sessionIdBytes32(`ses_${"0".repeat(32)}`),
      },
    ],
    ["the expiry", { ...delegation, expiry: vector.expiry + 1 }],
  ];

  it.each(changed)("binds %s", (_name, given) => {
    expect(keyDelegationDigest(given)).not.toBe(vector.digest);
  });
});

describe("sessionIdBytes32", () => {
  it("maps the redeem's sessionId to its 16 bytes, left-aligned and zero-padded", () => {
    expect(sessionIdBytes32(vector.sessionId)).toBe(vector.sessionIdBytes32);
  });

  it.each([
    [`ses_${"0".repeat(32)}`, `0x${"0".repeat(64)}`],
    [`ses_${"f".repeat(32)}`, `0x${"f".repeat(32)}${"0".repeat(32)}`],
  ])("maps %s to %s", (sessionId, bytes32) => {
    expect(sessionIdBytes32(sessionId)).toBe(bytes32);
  });

  it.each([
    ["uppercase hex", "ses_0192F0C4A1B27C3D8E9F00112233AABB"],
    ["31 hex digits", vector.sessionId.slice(0, -1)],
    ["33 hex digits", `${vector.sessionId}0`],
    ["no prefix", vector.sessionId.slice(4)],
    ["an uppercase prefix", `SES_${vector.sessionId.slice(4)}`],
    ["the Snapshot's wider form", "ses_abcXYZ"],
    ["digits that are not hex", `ses_${"g".repeat(32)}`],
    ["the bytes32 itself", vector.sessionIdBytes32],
    ["a trailing newline", `${vector.sessionId}\n`],
    ["a leading space", ` ${vector.sessionId}`],
    ["an empty string", ""],
  ])("refuses %s", (_name, sessionId) => {
    expect(codeOf(() => sessionIdBytes32(sessionId))).toBe("invalid-input");
  });
});

describe("noticeHash", () => {
  it.each([
    ["", "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"],
    [
      "abc",
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    ],
  ])("hashes %j to its known Keccak-256", (text, hash) => {
    expect(noticeHash(text)).toBe(hash);
  });

  it("is the Keccak-256 of the text's exact UTF-8 bytes", () => {
    expect(noticeHash(NOTICE)).toBe(
      encodeHex(keccak256(new TextEncoder().encode(NOTICE))),
    );
  });

  it("hashes a character outside the BMP as its four UTF-8 bytes", () => {
    expect(noticeHash("\u{1F3B2}")).toBe(
      encodeHex(keccak256(Uint8Array.of(0xf0, 0x9f, 0x8e, 0xb2))),
    );
  });

  it.each([
    ["composed and decomposed accents", `caf\u00E9`, `cafe\u0301`],
    ["LF and CRLF", "a\nb", "a\r\nb"],
    ["a trailing space", NOTICE, `${NOTICE} `],
    ["a space and a no-break space", "a b", `a\u00A0b`],
    ["case", "Notice", "notice"],
  ])("does not normalize %s", (_name, a, b) => {
    expect(noticeHash(a)).not.toBe(noticeHash(b));
  });

  it.each([
    ["a lone high surrogate", "\uD800"],
    ["a lone low surrogate", "notice \uDC00"],
    ["a reversed pair", "\uDC00\uD800"],
  ])("refuses %s", (_name, text) => {
    expect(codeOf(() => noticeHash(text))).toBe("invalid-input");
  });
});
