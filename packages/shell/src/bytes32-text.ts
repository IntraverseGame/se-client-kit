// Text in the `bytes32` forms the round's `newRound` uses (W-26, check 3):
// the bet's unit and the entropy source as ASCII, and the round id as its 16
// UUID bytes, each left-aligned and zero-padded to 32 bytes.

import type { Bytes32 } from "@intraverse/se-client-signing";

const WORD_BYTES = 32;
const MAX_ASCII = 0x7f;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Text as `bytes32`: ASCII, left-aligned, zero-padded. `undefined` for text
 * that is not ASCII or is longer than 32 bytes.
 */
export const asciiBytes32 = (text: string): Bytes32 | undefined => {
  if (text.length > WORD_BYTES) return undefined;
  let hex = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i) ?? 0;
    if (code > MAX_ASCII) return undefined;
    hex += code.toString(16).padStart(2, "0");
  }
  return `0x${hex.padEnd(WORD_BYTES * 2, "0")}`;
};

/**
 * A Snapshot `roundId` (UUIDv7 text) in its `bytes32` form: the 16 bytes,
 * left-aligned and zero-padded. `undefined` for text that is not a UUID.
 */
export const roundIdBytes32 = (roundId: string): Bytes32 | undefined => {
  const lower = roundId.toLowerCase();
  if (!UUID.test(lower)) return undefined;
  return `0x${lower.replaceAll("-", "").padEnd(WORD_BYTES * 2, "0")}`;
};
