// Canonical secp256k1 signatures: 65 bytes `r ‖ s ‖ v`, `v` in {27, 28}, low
// `s`. These are the backend verifier's rules
// (specs/client-kit/the-cryptography.md).

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes } from "@noble/hashes/utils.js";

import { SigningError } from "./errors.ts";
import {
  type Address,
  type Bytes32,
  checksumAddress,
  decodeHex,
  encodeHex,
  type Hex,
} from "./hex.ts";

/** A canonical signature as `0x` and 130 hexadecimal digits: `r ‖ s ‖ v`. */
export type Signature = Hex;

const SIGNATURE_BYTES = 65;
const SCALAR_BYTES = 32;
const V_OFFSET = 27;
const ORDER = secp256k1.Point.Fn.ORDER;
const HALF_ORDER = ORDER >> 1n;
const HEX_BODY = /^[0-9a-fA-F]*$/u;

const toScalar = (bytes: Uint8Array): bigint => {
  let n = 0n;
  for (const byte of bytes) n = (n << 8n) | BigInt(byte);
  return n;
};

/**
 * The address of an uncompressed public key: the last 20 bytes of Keccak-256 of
 * its 64-byte body.
 */
export const addressOfPublicKey = (uncompressed: Uint8Array): Address =>
  checksumAddress(keccak_256(uncompressed.subarray(1)).subarray(12));

/**
 * Sign a 32-byte digest: deterministic (RFC 6979, no extra entropy) and
 * normalized to low `s`. Internal: only the signer's closure calls it.
 */
export const signDigest = (
  digest: Bytes32,
  secretKey: Uint8Array,
): Signature => {
  const message = decodeHex(digest, SCALAR_BYTES);
  let recovered: Uint8Array;
  try {
    recovered = secp256k1.sign(message, secretKey, {
      prehash: false,
      lowS: true,
      extraEntropy: false,
      format: "recovered",
    });
  } catch {
    // The curve's own message may describe its input; it is dropped.
    throw new SigningError("signing-failed");
  }
  const recovery = recovered[0] ?? 0;
  // Recovery ids 2 and 3 (r overflowed the order) cannot be written as v in
  // {27, 28}; the chance is about 2^-127, so refuse rather than encode it.
  if (recovery > 1) throw new SigningError("signing-failed");
  return encodeHex(
    concatBytes(recovered.subarray(1), Uint8Array.of(recovery + V_OFFSET)),
  );
};

/**
 * Recover the signer's address (EIP-55) from a digest and a signature. Refuses,
 * in this order: any length other than 65 bytes (`invalid-signature-length`),
 * `v` outside {27, 28} (`invalid-signature-v`), `r` or `s` zero or not below
 * the curve order (`invalid-signature`), a high `s` (`high-s`), a signature no
 * key recovers from (`invalid-signature`), and the zero address
 * (`zero-address`).
 */
export const recoverAddress = (
  digest: Bytes32,
  signature: unknown,
): Address => {
  const message = decodeHex(digest, SCALAR_BYTES);
  if (
    typeof signature !== "string" ||
    !signature.startsWith("0x") ||
    !HEX_BODY.test(signature.slice(2)) ||
    signature.length % 2 !== 0
  ) {
    throw new SigningError("invalid-input");
  }
  if (signature.length !== 2 + SIGNATURE_BYTES * 2) {
    throw new SigningError("invalid-signature-length");
  }
  const bytes = decodeHex(signature, SIGNATURE_BYTES);
  const v = bytes[SIGNATURE_BYTES - 1] ?? 0;
  if (v !== V_OFFSET && v !== V_OFFSET + 1) {
    throw new SigningError("invalid-signature-v");
  }
  const r = toScalar(bytes.subarray(0, SCALAR_BYTES));
  const s = toScalar(bytes.subarray(SCALAR_BYTES, 2 * SCALAR_BYTES));
  if (r === 0n || r >= ORDER || s === 0n || s >= ORDER) {
    throw new SigningError("invalid-signature");
  }
  if (s > HALF_ORDER) throw new SigningError("high-s");
  let publicKey: Uint8Array;
  try {
    publicKey = secp256k1.Signature.fromBytes(
      bytes.subarray(0, 2 * SCALAR_BYTES),
      "compact",
    )
      .addRecoveryBit(v - V_OFFSET)
      .recoverPublicKey(message)
      .toBytes(false);
  } catch {
    throw new SigningError("invalid-signature");
  }
  const address = keccak_256(publicKey.subarray(1)).subarray(12);
  if (address.every(byte => byte === 0)) throw new SigningError("zero-address");
  return checksumAddress(address);
};
