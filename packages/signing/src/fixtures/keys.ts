// Test-only: the two keys the vendored signing vectors were signed with. The
// vector file names them as the well-known local development accounts
// (`player`, the action key, and `engine`, the registry admin): they are the
// public default accounts of the local Ethereum development node, published
// by design, hold nothing, and must never be used outside tests. The tests
// prove each derives the address the vectors give.

import { hexToBytes } from "@noble/hashes/utils.js";

import type { RandomSource } from "../signer.ts";

export const PLAYER_KEY =
  "7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

export const ENGINE_KEY =
  "5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

/**
 * A random source that yields the given 32-byte values in order, then fails the
 * test.
 */
export const scriptedRandom = (...draws: readonly string[]): RandomSource => {
  let next = 0;
  return (length: number): Uint8Array => {
    const draw = draws[next];
    next += 1;
    if (draw === undefined) throw new Error("scripted random source exhausted");
    const bytes = hexToBytes(draw);
    if (bytes.length !== length)
      throw new Error("scripted draw has the wrong length");
    return bytes;
  };
};
