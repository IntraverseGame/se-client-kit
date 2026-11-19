// `KeyDelegation`: once per session, the player's wallet signs that the
// shell's action key acts for it (RFC-006). The domain has no `chainId`, so the
// wallet never asks the player to switch networks.

import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes } from "@noble/hashes/utils.js";

import {
  encodeData,
  hashStruct,
  type StructType,
  stringBytes,
  typedDataDigest,
  typeHash,
} from "./eip712.ts";
import { SigningError } from "./errors.ts";
import {
  type Address,
  type Bytes32,
  checksumAddress,
  decodeHex,
  encodeHex,
} from "./hex.ts";
import { recoverAddress, type Signature } from "./signature.ts";
import { KEY_DELEGATION, KEY_DELEGATION_DOMAIN } from "./types.ts";
import { normalizeWalletSignature } from "./wallet-signature.ts";

const WORD = 32;
const ADDRESS_BYTES = 20;
// The redeem's `sessionId` (the Play API document), never the Snapshot's wider
// `context.sessionId`.
const SESSION_ID = /^ses_([0-9a-f]{32})$/u;

const invalid = (): SigningError => new SigningError("invalid-input");

type DelegatedKey = {
  /** The shell's action key's address. */
  readonly actionKey: Address;
  /** The session as `bytes32`, from `sessionIdBytes32`. */
  readonly sessionId: Bytes32;
  /**
   * Unix seconds, an integer from 1 to 2^53 − 1: `floor(sessionExpiresAt)`. A
   * time, never an amount.
   */
  readonly expiry: number;
};

/** A `KeyDelegation` with its notice as the notice's Keccak-256. */
export type KeyDelegation = DelegatedKey & { readonly noticeHash: Bytes32 };

/** A `KeyDelegation` with its notice as the exact text the wallet shows. */
export type KeyDelegationMessage = DelegatedKey & { readonly notice: string };

/** The `eth_signTypedData_v4` typed data of a `KeyDelegation`. */
export type KeyDelegationTypedData = {
  readonly types: {
    readonly EIP712Domain: readonly [
      { readonly name: "name"; readonly type: "string" },
      { readonly name: "version"; readonly type: "string" },
    ];
    readonly KeyDelegation: readonly [
      { readonly name: "notice"; readonly type: "string" },
      { readonly name: "actionKey"; readonly type: "address" },
      { readonly name: "sessionId"; readonly type: "bytes32" },
      { readonly name: "expiry"; readonly type: "uint64" },
    ];
  };
  readonly primaryType: "KeyDelegation";
  readonly domain: {
    readonly name: "SuperEngine KeyDelegation";
    readonly version: "1";
  };
  readonly message: {
    readonly notice: string;
    readonly actionKey: Address;
    readonly sessionId: Bytes32;
    /** Decimal, the form MetaMask and Rabby were seen to sign (RFC-006). */
    readonly expiry: string;
  };
};

/** The wallet a `KeyDelegation` recovers to, and the canonical signature. */
export type RecoveredKeyDelegation = {
  /** EIP-55. */
  readonly wallet: Address;
  /** 65 bytes, `v` 27 or 28, low `s`, lowercase hex. */
  readonly signature: Signature;
};

const expiryValue = (expiry: unknown): number => {
  if (
    typeof expiry !== "number" ||
    !Number.isSafeInteger(expiry) ||
    expiry < 1
  ) {
    throw invalid();
  }
  return expiry;
};

const noticeText = (notice: string): string => {
  stringBytes(notice);
  return notice;
};

type Types = KeyDelegationTypedData["types"];

const domain = (): KeyDelegationTypedData["domain"] => ({
  name: "SuperEngine KeyDelegation",
  version: "1",
});

const domainFields = (): Types["EIP712Domain"] => [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
];

const delegationFields = (): Types["KeyDelegation"] => [
  { name: "notice", type: "string" },
  { name: "actionKey", type: "address" },
  { name: "sessionId", type: "bytes32" },
  { name: "expiry", type: "uint64" },
];

// The fields after `notice`, whose EIP-712 encoding is the notice's hash.
const delegatedKey = (): StructType => ({
  name: KEY_DELEGATION.name,
  fields: KEY_DELEGATION.fields.slice(1),
});

/**
 * A Play API `sessionId` (`ses_` and 32 lowercase hex digits) as `bytes32`: its
 * 16 bytes, left-aligned and zero-padded. Anything else is `invalid-input`.
 */
export const sessionIdBytes32 = (sessionId: string): Bytes32 => {
  const hex =
    typeof sessionId === "string" ? SESSION_ID.exec(sessionId)?.[1] : undefined;
  if (hex === undefined) throw invalid();
  return `0x${hex.padEnd(WORD * 2, "0")}`;
};

/**
 * The Keccak-256 of a notice's exact UTF-8 bytes, with no normalization: its
 * EIP-712 encoding and the delegation's `noticeHash`. A lone surrogate is
 * `invalid-input`.
 */
export const noticeHash = (notice: string): Bytes32 =>
  encodeHex(keccak_256(stringBytes(notice)));

export const keyDelegationDomainSeparator = (): Bytes32 =>
  hashStruct(KEY_DELEGATION_DOMAIN, domain());

/** `hashStruct(KeyDelegation)`, from the notice's Keccak-256. */
export const hashKeyDelegation = (delegation: KeyDelegation): Bytes32 => {
  const { noticeHash: notice, ...key } = delegation;
  return encodeHex(
    keccak_256(
      concatBytes(
        decodeHex(typeHash(KEY_DELEGATION), WORD),
        decodeHex(notice, WORD),
        ...encodeData(delegatedKey(), {
          ...key,
          expiry: BigInt(expiryValue(key.expiry)),
        }),
      ),
    ),
  );
};

/** The EIP-712 digest the wallet signs. */
export const keyDelegationDigest = (delegation: KeyDelegation): Bytes32 =>
  typedDataDigest(
    keyDelegationDomainSeparator(),
    hashKeyDelegation(delegation),
  );

/**
 * The wallet a `KeyDelegation`'s signature recovers to, with the signature in
 * its canonical form, the one the start sends. The wallet's `v` 0 or 1 and a
 * high `s` are normalized first; recovery is then `recoverAddress`'s, the zero
 * address refused. Comparing the wallet with the claimed one is the caller's.
 */
export const recoverKeyDelegation = (
  delegation: KeyDelegation,
  signature: unknown,
): RecoveredKeyDelegation => {
  const digest = keyDelegationDigest(delegation);
  const canonical = normalizeWalletSignature(signature);
  return { wallet: recoverAddress(digest, canonical), signature: canonical };
};

/**
 * The typed data for `eth_signTypedData_v4`: both types, the chainless domain,
 * and the message with the notice as text, the address in EIP-55, the session
 * in lowercase hex, and the expiry as a decimal string. Its four fields are
 * checked as the digest checks them; no other field is copied.
 */
export const keyDelegationTypedData = (
  message: KeyDelegationMessage,
): KeyDelegationTypedData => {
  const { notice, actionKey, sessionId, expiry } = message;
  return {
    types: {
      EIP712Domain: domainFields(),
      KeyDelegation: delegationFields(),
    },
    primaryType: "KeyDelegation",
    domain: domain(),
    message: {
      notice: noticeText(notice),
      actionKey: checksumAddress(decodeHex(actionKey, ADDRESS_BYTES)),
      sessionId: encodeHex(decodeHex(sessionId, WORD)),
      expiry: expiryValue(expiry).toString(),
    },
  };
};
