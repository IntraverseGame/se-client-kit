// The action key. It is generated here and lives only inside the closure of the
// signer that owns it: nothing returns, serializes, or prints it.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { randomBytes } from "@noble/hashes/utils.js";

import { SigningError } from "./errors.ts";
import type { Address, Bytes32 } from "./hex.ts";
import { addressOfPublicKey, type Signature, signDigest } from "./signature.ts";

/**
 * A cryptographic random source: returns `length` fresh random bytes. The
 * default is the platform's (`crypto.getRandomValues`); tests inject a fake.
 */
export type RandomSource = (length: number) => Uint8Array;

export type SignerOptions = {
  readonly random?: RandomSource;
};

/** Signs digests with a key it never exposes. */
export type Signer = {
  /** The key's Ethereum address (EIP-55). */
  readonly address: Address;
  /** Sign a 32-byte digest: canonical, deterministic (RFC 6979), low `s`. */
  readonly sign: (digest: Bytes32) => Signature;
  /** Zero the key bytes (best effort) and refuse every later `sign`. */
  readonly destroy: () => void;
};

const KEY_BYTES = 32;
// A uniform draw is zero or not below the order with probability about
// 2^-128, so a source that fails this many times in a row is broken.
const MAX_DRAWS = 16;

const drawSecretKey = (random: RandomSource): Uint8Array => {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const drawn = random(KEY_BYTES);
    const valid =
      drawn instanceof Uint8Array &&
      drawn.length === KEY_BYTES &&
      secp256k1.utils.isValidSecretKey(drawn);
    if (valid) {
      const key = Uint8Array.from(drawn);
      drawn.fill(0);
      return key;
    }
    if (drawn instanceof Uint8Array) drawn.fill(0);
  }
  throw new SigningError("random-source");
};

const REDACTED = "[Signer]";

/**
 * Generate a fresh action key from the random source (32 bytes, redrawn while
 * zero or not below the curve order) and return the signer that holds it.
 */
export const createSigner = (options: SignerOptions = {}): Signer => {
  const key = drawSecretKey(options.random ?? randomBytes);
  const address = addressOfPublicKey(secp256k1.getPublicKey(key, false));
  let destroyed = false;
  const signer: Signer & {
    readonly toJSON: () => string;
    readonly toString: () => string;
  } = {
    address,
    sign: (digest: Bytes32): Signature => {
      if (destroyed) throw new SigningError("signer-destroyed");
      return signDigest(digest, key);
    },
    destroy: (): void => {
      key.fill(0);
      destroyed = true;
    },
    toJSON: (): string => REDACTED,
    toString: (): string => REDACTED,
  };
  return Object.freeze(signer);
};
