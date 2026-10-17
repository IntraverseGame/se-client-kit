// Test-only: the vendored `signed-action/` Snapshot vectors (a `PlayerCancel`
// signed by an independent signer, Foundry cast), read through the `contracts`
// test-only entry and narrowed to what the tests use. The file's test key is
// the public development key `player` (fixtures/keys.ts): the tests sign with
// that fixture and check its address against the file's, so no key is read
// from the file.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

import type { Address, Bytes32, Hex } from "../hex.ts";
import type { Domain, PlayerMessage } from "../messages.ts";
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
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new TypeError(`${where}.${key}: not an address`);
  }
  return value;
};

export type SignedActionVector = {
  readonly name: string;
  /** The `valid/` Snapshot vector of the round it continues. */
  readonly round: string;
  readonly primaryType: string;
  readonly domain: Domain;
  readonly message: PlayerMessage;
  readonly encodeType: string;
  readonly typeHash: Bytes32;
  readonly domainSeparator: Bytes32;
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
  /** The test key's address, as the vector writes it. */
  readonly address: Address;
  readonly signature: Hex;
};

const messageOf = (message: Json, where: string): PlayerMessage => {
  const path = at(message, "path", where);
  if (!Array.isArray(path)) throw new TypeError(`${where}.path: not a list`);
  const entries: unknown[] = path;
  return {
    action: text(message, "action", where),
    path: entries.map(entry => {
      if (typeof entry !== "number" || !Number.isSafeInteger(entry)) {
        throw new TypeError(`${where}.path: not a list of integers`);
      }
      return entry;
    }),
    sequence: integer(message, "sequence", where),
    round: bytes32(message, "round", where),
    previous: bytes32(message, "previous", where),
  };
};

const signedActionVector = (
  name: string,
  file: unknown,
): SignedActionVector => {
  const where = `signed-action/${name}`;
  const root = record(file, where);
  if (text(root, "vector", where) !== `snapshot/${where}`) {
    throw new TypeError(`${where}.vector: does not name the file`);
  }
  const sources = record(at(root, "sources", where), `${where}.sources`);
  const eip712 = record(at(root, "eip712", where), `${where}.eip712`);
  const domain = record(at(eip712, "domain", where), `${where}.domain`);
  const testKey = record(at(root, "testKey", where), `${where}.testKey`);
  const signature = record(at(root, "signature", where), `${where}.signature`);
  return {
    name,
    round: text(sources, "round", `${where}.sources`),
    primaryType: text(eip712, "primaryType", `${where}.eip712`),
    domain: {
      name: text(domain, "name", `${where}.domain`),
      version: text(domain, "version", `${where}.domain`),
      chainId: BigInt(integer(domain, "chainId", `${where}.domain`)),
      verifyingContract: address(
        domain,
        "verifyingContract",
        `${where}.domain`,
      ),
    },
    message: messageOf(
      record(at(eip712, "message", where), `${where}.message`),
      `${where}.message`,
    ),
    encodeType: text(root, "encodeType", where),
    typeHash: bytes32(root, "typeHash", where),
    domainSeparator: bytes32(root, "domainSeparator", where),
    structHash: bytes32(root, "structHash", where),
    digest: bytes32(root, "digest", where),
    address: address(testKey, "address", `${where}.testKey`),
    signature: hex(signature, "hex", `${where}.signature`),
  };
};

/** Every `signed-action/` Snapshot vector, by file name. */
export const signedActionVectors: readonly SignedActionVector[] =
  Object.entries(snapshotVectors.signedAction).map(([name, file]) =>
    signedActionVector(name, file),
  );

/** The independent signer's `PlayerCancel` of the Coin Flip round. */
export const coinflipCancel = (): SignedActionVector => {
  const vector = signedActionVectors.find(v => v.name === "coinflip-cancel");
  if (vector === undefined) {
    throw new TypeError("signed-action/coinflip-cancel: not vendored");
  }
  return vector;
};
