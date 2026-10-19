// The raw Keccak-256 hash, for callers that hash bytes of their own (the verify
// page's StepsDerive, specs/verify-page.md V-12 check 7).

import { keccak_256 } from "@noble/hashes/sha3.js";

import { SigningError } from "./errors.ts";

// The same test as the hash library's own: a `Uint8Array`, or one from another
// realm (an iframe, jsdom), whose `instanceof` is false here.
const isBytes = (value: unknown): value is Uint8Array =>
  value instanceof Uint8Array ||
  (ArrayBuffer.isView(value) && value.constructor.name === "Uint8Array");

/**
 * Keccak-256 of `data`, Ethereum's hash (the original Keccak padding, not NIST
 * SHA3-256): 32 new bytes. `data` is read, never changed. Anything but a
 * `Uint8Array` is refused with `invalid-input`.
 */
export const keccak256 = (data: Uint8Array): Uint8Array => {
  if (!isBytes(data)) throw new SigningError("invalid-input");
  return keccak_256(data);
};
