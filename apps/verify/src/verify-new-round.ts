// `newRound` of the verify API's `CreateRoundAuth`: `abi.encode(NewRound)`, 352
// bytes, decoded to the fields the checks compare (specs/verify-page.md, V-12).

import { hashNewRound, keccak256 } from "@intraverse/se-client-signing";

import { asciiBytes32 } from "./ascii-bytes32.ts";
import { bytesFromHash, hashFromBytes } from "./hex.ts";
import type { NewRoundEvidence } from "./round-evidence.ts";
import { Bad, PATTERN, type Read, text } from "./verify-readers.ts";

const WORD = 32;
const NEW_ROUND_WORDS = 11;
const UINT128_BYTES = 16;
const UINT32_BYTES = 4;
const ADDRESS_BYTES = 20;

const word = (bytes: Uint8Array, index: number): Uint8Array =>
  bytes.slice(index * WORD, (index + 1) * WORD);
const lowBytes = (bytes: Uint8Array, count: number): bigint =>
  BigInt(`0x${hashFromBytes(bytes.slice(WORD - count)).slice(2)}`);

/**
 * `abi.encode(NewRound)` (352 bytes: eleven words) as the fields the checks
 * compare. The page decodes the bytes it was given and encodes the result
 * again: bytes that are not the canonical encoding of what they decode to
 * (non-zero padding, a unit that is not ASCII) fail, so no check reads a field
 * the signed bytes do not carry.
 */
export const newRound = (v: unknown): Read<NewRoundEvidence> => {
  const hex = text(v, PATTERN.hexBytes);
  const bytes = hex === Bad ? undefined : bytesFromHash(hex);
  if (bytes?.length !== NEW_ROUND_WORDS * WORD) return Bad;
  const hash = (index: number): `0x${string}` =>
    hashFromBytes(word(bytes, index));
  const unit = new TextDecoder().decode(word(bytes, 2)).replace(/\0+$/u, "");
  const decoded: NewRoundEvidence = {
    roundId: hash(0),
    playerRef: hash(1),
    currency: unit,
    betAmount: lowBytes(word(bytes, 3), UINT128_BYTES),
    gameId: Number(lowBytes(word(bytes, 4), UINT32_BYTES)),
    gameVersion: Number(lowBytes(word(bytes, 5), UINT32_BYTES)),
    circuitVersion: Number(lowBytes(word(bytes, 6), UINT32_BYTES)),
    roundSecretHash: hash(7),
    randomnessTarget: hash(8),
    actionKey: `0x${hash(9).slice(2 + (WORD - ADDRESS_BYTES) * 2)}`,
    payoutTermsHash: hash(10),
  };
  const currency = asciiBytes32(unit);
  if (currency === undefined) return Bad;
  const encoded = hashNewRound({
    ...decoded,
    roundId: decoded.roundId as `0x${string}`,
    playerRef: decoded.playerRef as `0x${string}`,
    currency,
    roundSecretHash: decoded.roundSecretHash as `0x${string}`,
    randomnessTarget: decoded.randomnessTarget as `0x${string}`,
    actionKey: decoded.actionKey as `0x${string}`,
    payoutTermsHash: decoded.payoutTermsHash as `0x${string}`,
  });
  return encoded === hashFromBytes(keccak256(bytes)) ? decoded : Bad;
};
