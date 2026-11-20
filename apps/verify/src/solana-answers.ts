// The readers of a Solana endpoint's answers for check 6 (RFC-007 section 4):
// untrusted results, read strictly; anything else is no answer. The engine's
// `getBlock` options and the Solana validator's JSON-RPC error codes the page
// tells apart live here too.

import { decodeBase58Bytes32, isBase58Text } from "./base58.ts";
import { type Hash32, hashFromBytes } from "./hex.ts";

/** The engine's `getBlock` options, exactly (the backend's Solana entropy spec). */
export const GET_BLOCK_OPTIONS = {
  commitment: "finalized",
  encoding: "json",
  transactionDetails: "none",
  rewards: false,
  maxSupportedTransactionVersion: 0,
} as const;

/** `getBlocksWithLimit`'s commitment: finalized blocks only. */
export const FINALIZED = { commitment: "finalized" } as const;

/** `getBlock` errors that mean the slot was skipped (no block was produced). */
export const SKIPPED_CODES: ReadonlySet<number> = new Set([-32_007, -32_009]);

/**
 * `getBlock` errors that mean "not found" (not available, cleaned up, status
 * not available yet, long-term storage unreachable), never "skipped".
 */
export const NOT_AVAILABLE_CODES: ReadonlySet<number> = new Set([
  -32_004, -32_001, -32_014, -32_019,
]);

type Json = unknown;

const isRecord = (value: Json): value is Readonly<Record<string, Json>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSlot = (value: Json): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A genesis hash: a string of 32 to 44 base58 characters, compared as text. */
export const readGenesisHash = (result: Json): string | undefined =>
  isBase58Text(result) ? result : undefined;

/** What the page keeps of a block: its value and its parent's slot. */
export type SolanaBlock = {
  /** The `blockhash`'s 32 bytes as `0x` and 64 lowercase hex. */
  readonly value: Hash32;
  readonly parentSlot: bigint;
};

/**
 * The block `getBlock` returned for `slot`: an object whose `blockhash` and
 * `previousBlockhash` each decode to exactly 32 bytes, whose `blockTime` is an
 * integer (a null or missing one is refused, as the engine refuses it), and
 * whose `parentSlot` is a non-negative safe integer below `slot`.
 */
export const readBlock = (
  result: Json,
  slot: bigint,
): SolanaBlock | undefined => {
  if (!isRecord(result)) return undefined;
  const { blockhash, previousBlockhash, blockTime, parentSlot } = result;
  const value = decodeBase58Bytes32(blockhash);
  if (value === undefined) return undefined;
  if (decodeBase58Bytes32(previousBlockhash) === undefined) return undefined;
  if (typeof blockTime !== "number" || !Number.isSafeInteger(blockTime)) {
    return undefined;
  }
  if (!isSlot(parentSlot) || BigInt(parentSlot) >= slot) return undefined;
  return { value: hashFromBytes(value), parentSlot: BigInt(parentSlot) };
};

/**
 * `getBlocksWithLimit(N, 1)`'s answer: the first finalized block's slot `M`
 * after the skipped `N`; `"none"` for an empty list (no finalized block after
 * `N` yet); `"gap"` for `M ≤ N`, which contradicts the skip; `undefined` for
 * anything else.
 */
export const readNextBlock = (
  result: Json,
  skipped: bigint,
): bigint | "none" | "gap" | undefined => {
  if (!Array.isArray(result)) return undefined;
  if (result.length === 0) return "none";
  const [slot]: readonly Json[] = result;
  if (result.length !== 1 || !isSlot(slot)) return undefined;
  return BigInt(slot) > skipped ? BigInt(slot) : "gap";
};
