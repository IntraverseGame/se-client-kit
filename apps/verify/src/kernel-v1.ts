// The SuperEngine fairness kernel, kernelVersion 1: its commitments and its
// seed (specs/verify-page.md, V-12 checks 5 and 7), pinned by the public vector
// sets `kernel/public/v1/seed` and `kernel/public/v1/round-secret-hash`.
// SHA-256 is Web Crypto's, with no library.

import { KernelError, type KernelErrorCode } from "./kernel-error.ts";

const WORD = 32;

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));

/** A rejection with `code` when `bytes` is not 32 bytes long. */
const refuseUnless32 = (
  bytes: Uint8Array,
  code: KernelErrorCode,
): Promise<never> | undefined =>
  bytes.length === WORD ? undefined : Promise.reject(new KernelError(code));

/**
 * Seed(blockValue, secret) = SHA-256(blockValue || secret): a 64-byte preimage,
 * block N's 32-byte hash first, then the round secret's 32 bytes. The block
 * value is checked first.
 */
export const seedOf = (
  blockValue: Uint8Array,
  secret: Uint8Array,
): Promise<Uint8Array> => {
  const refused =
    refuseUnless32(blockValue, "block-value-length") ??
    refuseUnless32(secret, "secret-length");
  if (refused !== undefined) return refused;
  const preimage = new Uint8Array(WORD * 2);
  preimage.set(blockValue, 0);
  preimage.set(secret, WORD);
  return sha256(preimage);
};

/** SeedHash(seed) = SHA-256(seed), over the seed's raw 32 bytes. */
export const seedHashOf = (seed: Uint8Array): Promise<Uint8Array> =>
  refuseUnless32(seed, "seed-length") ?? sha256(seed);

/**
 * The round secret's commitment, `roundSecretHash = SHA-256(roundSecret)`, over
 * its raw 32 bytes (not its hex text); any other length is `secret-length`.
 * Pinned by `kernel/public/v1/round-secret-hash`.
 */
export const roundSecretHashOf = (secret: Uint8Array): Promise<Uint8Array> =>
  refuseUnless32(secret, "secret-length") ?? sha256(secret);
