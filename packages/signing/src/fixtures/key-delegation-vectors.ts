// Test-only: the vendored `key-delegation/v1 vectors`, read through the
// `contracts` test-only entry and narrowed to what the tests use. The file is
// data of unknown shape, so every field is checked before it is used. Its
// wallet is a public, well-known local development account; no key is held
// here, and none is needed to recover.

import { keyDelegationVectors } from "@intraverse/se-client-contracts/testing";

import type { Address, Bytes32, Hex } from "../hex.ts";
import { at, hex, integer, type Json, record, text } from "./vectors.ts";

const bytes32 = (parent: Json, key: string, where: string): Bytes32 => {
  const value = hex(parent, key, where);
  if (!/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${where}.${key}: not 32 bytes of lowercase hex`);
  }
  return value;
};

const address = (parent: Json, key: string, where: string): Address => {
  const value = hex(parent, key, where);
  if (!/^0x[0-9a-f]{40}$/u.test(value)) {
    throw new TypeError(`${where}.${key}: not 20 bytes of lowercase hex`);
  }
  return value;
};

const list = (parent: Json, key: string, where: string): readonly unknown[] => {
  const value = at(parent, key, where);
  if (!Array.isArray(value)) throw new TypeError(`${where}.${key}: not a list`);
  const items: unknown[] = value;
  return items;
};

/** A start with a delegation: the start's values and the delegation it sends. */
export type DelegatedStart = {
  readonly name: string;
  readonly actionKey: Address;
  /** The redeem's `ses_` form. */
  readonly sessionId: string;
  readonly sessionIdBytes32: Bytes32;
  readonly acceptedAt: number;
  readonly wallet: Address;
  readonly expiry: number;
  readonly noticeHash: Bytes32;
  readonly signature: Hex;
};

/** The `eth_signTypedData_v4` typed data, as the file gives it. */
export type VectorTypedData = {
  readonly types: unknown;
  readonly primaryType: string;
  readonly domain: unknown;
  readonly message: {
    readonly notice: string;
    /** In lowercase, as the file spells it. */
    readonly actionKey: Address;
    readonly sessionId: Bytes32;
    /** A JSON number in the file. */
    readonly expiry: number;
  };
};

export type AcceptedKeyDelegation = DelegatedStart & {
  readonly noticeId: string;
  readonly typedData: VectorTypedData;
  /** The notice's text, from the typed data's message. */
  readonly notice: string;
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
};

export type RefusedKeyDelegation = DelegatedStart & {
  /** The code the backend answers. */
  readonly code: string;
};

export type KeyDelegationVectors = {
  readonly domainName: string;
  readonly domainVersion: string;
  readonly domainEncodeType: string;
  readonly domainTypeHash: Bytes32;
  readonly domainSeparator: Bytes32;
  readonly encodeType: string;
  readonly typeHash: Bytes32;
  /** The public development account that signed the vectors. */
  readonly devAddress: Address;
  readonly accepted: readonly AcceptedKeyDelegation[];
  readonly refused: readonly RefusedKeyDelegation[];
};

const delegatedStart = (item: unknown, where: string): DelegatedStart => {
  const root = record(item, where);
  const start = record(at(root, "start", where), `${where}.start`);
  const delegation = record(
    at(root, "keyDelegation", where),
    `${where}.keyDelegation`,
  );
  return {
    name: text(root, "name", where),
    actionKey: address(start, "actionKey", `${where}.start`),
    sessionId: text(start, "sessionId", `${where}.start`),
    sessionIdBytes32: bytes32(start, "sessionIdBytes32", `${where}.start`),
    acceptedAt: integer(start, "acceptedAt", `${where}.start`),
    wallet: address(delegation, "wallet", `${where}.keyDelegation`),
    expiry: integer(delegation, "expiry", `${where}.keyDelegation`),
    noticeHash: bytes32(delegation, "noticeHash", `${where}.keyDelegation`),
    signature: hex(delegation, "signature", `${where}.keyDelegation`),
  };
};

const acceptedVector = (
  item: unknown,
  index: number,
): AcceptedKeyDelegation => {
  const where = `accepted[${String(index)}]`;
  const root = record(item, where);
  const typed = `${where}.typedData`;
  const typedData = record(at(root, "typedData", where), typed);
  const message = record(at(typedData, "message", typed), `${typed}.message`);
  const notice = text(message, "notice", `${typed}.message`);
  return {
    ...delegatedStart(item, where),
    noticeId: text(root, "noticeId", where),
    typedData: {
      types: at(typedData, "types", typed),
      primaryType: text(typedData, "primaryType", typed),
      domain: at(typedData, "domain", typed),
      message: {
        notice,
        actionKey: address(message, "actionKey", `${typed}.message`),
        sessionId: bytes32(message, "sessionId", `${typed}.message`),
        expiry: integer(message, "expiry", `${typed}.message`),
      },
    },
    notice,
    structHash: bytes32(root, "structHash", where),
    digest: bytes32(root, "digest", where),
  };
};

const refusedVector = (item: unknown, index: number): RefusedKeyDelegation => {
  const where = `refused[${String(index)}]`;
  return {
    ...delegatedStart(item, where),
    code: text(record(item, where), "code", where),
  };
};

const read = (file: unknown): KeyDelegationVectors => {
  const where = "key-delegation/v1 vectors";
  const root = record(file, where);
  if (integer(root, "version", where) !== 1) {
    throw new TypeError(`${where}.version: not 1`);
  }
  const domain = record(at(root, "domain", where), `${where}.domain`);
  const type = record(at(root, "type", where), `${where}.type`);
  const devKey = record(at(root, "devKey", where), `${where}.devKey`);
  return {
    domainName: text(domain, "name", `${where}.domain`),
    domainVersion: text(domain, "version", `${where}.domain`),
    domainEncodeType: text(domain, "encodeType", `${where}.domain`),
    domainTypeHash: bytes32(domain, "typeHash", `${where}.domain`),
    domainSeparator: bytes32(domain, "separator", `${where}.domain`),
    encodeType: text(type, "encodeType", `${where}.type`),
    typeHash: bytes32(type, "typeHash", `${where}.type`),
    devAddress: address(devKey, "address", `${where}.devKey`),
    accepted: list(root, "accepted", where).map((item, index) =>
      acceptedVector(item, index),
    ),
    refused: list(root, "refused", where).map((item, index) =>
      refusedVector(item, index),
    ),
  };
};

/** The vendored `key-delegation/v1 vectors`, checked. */
export const keyDelegation: KeyDelegationVectors = read(
  keyDelegationVectors.v1,
);

/** The one accepted vector, `en-draft-1`. */
export const acceptedDelegation: AcceptedKeyDelegation =
  ((): AcceptedKeyDelegation => {
    const [first] = keyDelegation.accepted;
    if (first === undefined) throw new TypeError("no accepted vector");
    return first;
  })();

/** The refused vector `name`. */
export const refusedDelegation = (name: string): RefusedKeyDelegation => {
  const found = keyDelegation.refused.find(vector => vector.name === name);
  if (found === undefined) throw new TypeError(`no refused vector "${name}"`);
  return found;
};
