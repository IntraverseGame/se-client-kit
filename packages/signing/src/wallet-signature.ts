// A browser wallet may answer with `v` 0 or 1 or a high `s`, so its
// `KeyDelegation` signature, and only that one, is made canonical before the
// strict recovery (RFC-006). Every other signature reaches `recoverAddress`
// as it came.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/utils.js";

import { SigningError } from "./errors.ts";
import { decodeHex, encodeHex } from "./hex.ts";
import type { Signature } from "./signature.ts";

const SIGNATURE_BYTES = 65;
const SCALAR_BYTES = 32;
const V_INDEX = 64;
const V_OFFSET = 27;
const ORDER = secp256k1.Point.Fn.ORDER;
const HALF_ORDER = ORDER >> 1n;
const EVEN_HEX = /^0x(?:[0-9a-fA-F]{2})*$/u;

const recoveryBit = (v: number): 0 | 1 => {
  if (v === 0 || v === V_OFFSET) return 0;
  if (v === 1 || v === V_OFFSET + 1) return 1;
  throw new SigningError("invalid-signature-v");
};

/**
 * The canonical form of a wallet's 65-byte signature, in lowercase hex: `v` 0
 * or 1 becomes 27 or 28, and an `s` above half the curve order becomes `n − s`
 * with `v` flipped. Refuses text that is not `0x` hex (`invalid-input`), any
 * length but 65 bytes (`invalid-signature-length`), and any other `v`
 * (`invalid-signature-v`). An `s` of zero or not below the order is left for
 * the strict recovery to refuse.
 */
export const normalizeWalletSignature = (signature: unknown): Signature => {
  if (typeof signature !== "string" || !EVEN_HEX.test(signature)) {
    throw new SigningError("invalid-input");
  }
  if (signature.length !== 2 + SIGNATURE_BYTES * 2) {
    throw new SigningError("invalid-signature-length");
  }
  const bytes = decodeHex(signature, SIGNATURE_BYTES);
  const bit = recoveryBit(bytes[V_INDEX] ?? -1);
  const s = bytesToNumberBE(bytes.subarray(SCALAR_BYTES, V_INDEX));
  const high = s > HALF_ORDER && s < ORDER;
  if (high) bytes.set(numberToBytesBE(ORDER - s, SCALAR_BYTES), SCALAR_BYTES);
  bytes[V_INDEX] = V_OFFSET + (high ? 1 - bit : bit);
  return encodeHex(bytes);
};
