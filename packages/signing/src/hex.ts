import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { SigningError } from "./errors.ts";

/**
 * `0x`-prefixed hexadecimal text. Outputs of this package are lowercase, except
 * addresses (EIP-55).
 */
export type Hex = `0x${string}`;

/** A 32-byte value as `0x` and 64 hexadecimal digits. */
export type Bytes32 = Hex;

/** A 20-byte Ethereum address as `0x` and 40 hexadecimal digits. */
export type Address = Hex;

const HEX_BODY = /^[0-9a-fA-F]*$/u;

/** Decode `0x`-prefixed hex of exactly `length` bytes, or throw `invalid-input`. */
export const decodeHex = (value: unknown, length: number): Uint8Array => {
  if (
    typeof value !== "string" ||
    !value.startsWith("0x") ||
    value.length !== 2 + length * 2 ||
    !HEX_BODY.test(value.slice(2))
  ) {
    throw new SigningError("invalid-input");
  }
  return hexToBytes(value.slice(2));
};

export const encodeHex = (bytes: Uint8Array): Hex => `0x${bytesToHex(bytes)}`;

/** EIP-55 mixed-case checksum spelling of a 20-byte address. */
export const checksumAddress = (address: Uint8Array): Address => {
  const lower = bytesToHex(address);
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "";
  for (let i = 0; i < lower.length; i += 1) {
    const char = lower.charAt(i);
    out += Number.parseInt(hash.charAt(i), 16) >= 8 ? char.toUpperCase() : char;
  }
  return `0x${out}`;
};
