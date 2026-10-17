// T-3 (specs/wrapper.md): key generation, Sign then Recover round trips from a
// seeded source, and determinism.

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";

import { actionVector, codeOf, playerSigner } from "./fixtures/helpers.ts";
import { PLAYER_KEY, scriptedRandom } from "./fixtures/keys.ts";
import { vectors } from "./fixtures/vectors.ts";
import type { Bytes32 } from "./hex.ts";
import { recoverAddress } from "./signature.ts";
import { createSigner, type RandomSource } from "./signer.ts";

const ORDER =
  "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141";
const HALF_ORDER = BigInt(`0x${ORDER}`) >> 1n;
const ROUND_TRIP_TIMEOUT_MS = 20_000;

/** A deterministic stream of 32-byte values: keccak256("<seed>:<counter>"). */
const seeded = (seed: string): (() => Uint8Array) => {
  let counter = 0;
  return (): Uint8Array => {
    counter += 1;
    return keccak_256(utf8ToBytes(`${seed}:${counter}`));
  };
};

/** A random source that hands out the given buffers in order. */
const queued = (...draws: Uint8Array[]): RandomSource => {
  const queue = [...draws];
  return (): Uint8Array => {
    const next = queue.shift();
    if (next === undefined) throw new Error("queued random source exhausted");
    return next;
  };
};

/** Records each length the signer asks the source for. */
const recording = (
  source: RandomSource,
): { readonly random: RandomSource; readonly lengths: number[] } => {
  const lengths: number[] = [];
  return {
    lengths,
    random: (length: number): Uint8Array => {
      lengths.push(length);
      return source(length);
    },
  };
};

const zeroSource: RandomSource = () => new Uint8Array(32);

const digestFrom = (bytes: Uint8Array): Bytes32 => `0x${bytesToHex(bytes)}`;

const isCanonical = (signature: string): boolean =>
  /^0x[0-9a-f]{128}1[bc]$/u.test(signature) &&
  BigInt(`0x${signature.slice(66, 130)}`) <= HALF_ORDER;

/**
 * Sign `count` seeded digests with the player key; true per canonical,
 * recovering signature.
 */
const roundTrips = (count: number, seed: string): boolean[] => {
  const next = seeded(seed);
  const signer = playerSigner();
  return Array.from({ length: count }, () => {
    const digest = digestFrom(next());
    const signature = signer.sign(digest);
    return (
      isCanonical(signature) &&
      recoverAddress(digest, signature) === signer.address
    );
  });
};

/**
 * Sign one seeded digest with each of `count` fresh seeded keys; true per
 * recovering signature.
 */
const freshKeyRoundTrips = (count: number, seed: string): boolean[] => {
  const next = seeded(seed);
  return Array.from({ length: count }, () => {
    const fresh = createSigner({ random: () => next() });
    const digest = digestFrom(next());
    return recoverAddress(digest, fresh.sign(digest)) === fresh.address;
  });
};

/**
 * Create a signer with no injected source while the platform's
 * `crypto.getRandomValues` is replaced: the first call gets the player key, and
 * later calls (the curve library's own blinding of the public-key computation)
 * a fixed non-zero pattern. Report the length of every call and the address.
 */
const withPlatformSource = (): {
  readonly lengths: readonly number[];
  readonly address: string;
} => {
  const lengths: number[] = [];
  const spy = vi
    .spyOn(globalThis.crypto, "getRandomValues")
    .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) {
        if (lengths.length === 0) array.set(hexToBytes(PLAYER_KEY));
        else array.fill(0x5a);
        lengths.push(array.length);
      }
      return array;
    });
  try {
    return { lengths, address: createSigner().address };
  } finally {
    spy.mockRestore();
  }
};

const allTrue = (count: number): boolean[] =>
  Array.from({ length: count }, () => true);

describe("createSigner", () => {
  it("draws 32 bytes from the injected source and derives the vector address", () => {
    const { random, lengths } = recording(scriptedRandom(PLAYER_KEY));
    expect(createSigner({ random }).address).toBe(vectors.actionKey);
    expect(lengths).toEqual([32]);
  });

  it.each([
    ["zero", "00".repeat(32)],
    ["the curve order", ORDER],
    ["above the curve order", "ff".repeat(32)],
  ])("redraws a key that is %s", (_name, bad) => {
    const { random, lengths } = recording(scriptedRandom(bad, PLAYER_KEY));
    expect(createSigner({ random }).address).toBe(vectors.actionKey);
    expect(lengths).toEqual([32, 32]);
  });

  it("redraws a draw of the wrong length", () => {
    const random = queued(new Uint8Array(31), hexToBytes(PLAYER_KEY));
    expect(createSigner({ random }).address).toBe(vectors.actionKey);
  });

  it("zeroes every draw it read", () => {
    const draws = [new Uint8Array(32), hexToBytes(PLAYER_KEY)];
    createSigner({ random: queued(...draws) });
    expect(draws.map(draw => draw.every(byte => byte === 0))).toEqual([
      true,
      true,
    ]);
  });

  it("draws from the platform's crypto.getRandomValues by default", () => {
    const { lengths, address } = withPlatformSource();
    expect(lengths[0]).toBe(32);
    expect(address).toBe(vectors.actionKey);
  });

  it("fails closed on a source that never yields a valid key", () => {
    expect(codeOf(() => createSigner({ random: zeroSource }))).toBe(
      "random-source",
    );
  });
});

describe("sign", () => {
  it("gives the same bytes for the same digest", () => {
    const signer = playerSigner();
    const { digest } = actionVector(0);
    expect(signer.sign(digest)).toBe(signer.sign(digest));
    expect(playerSigner().sign(digest)).toBe(signer.sign(digest));
  });

  // Many sign-and-recover rounds of pure-JS secp256k1: a busy CI runner can
  // pass the default 5 s, so these two get their own timeout.
  it(
    "round-trips 200 seeded digests: canonical, low s, recovers the signer",
    { timeout: ROUND_TRIP_TIMEOUT_MS },
    () => {
      expect(roundTrips(200, "signing:t-3")).toEqual(allTrue(200));
    },
  );

  it(
    "round-trips with fresh keys from a seeded source",
    { timeout: ROUND_TRIP_TIMEOUT_MS },
    () => {
      expect(freshKeyRoundTrips(20, "signing:t-3:keys")).toEqual(allTrue(20));
    },
  );

  it("refuses a digest that is not 32 bytes", () => {
    expect(codeOf(() => playerSigner().sign("0x1234"))).toBe("invalid-input");
  });

  it("refuses to sign after destroy", () => {
    const signer = playerSigner();
    signer.destroy();
    expect(codeOf(() => signer.sign(actionVector(0).digest))).toBe(
      "signer-destroyed",
    );
  });
});
