// T-1 (specs/wrapper.md, W-20, W-21): the vendored Cash or Crash round played
// through its last row (`valid/cashorcrash-last-row-*`): its three picks
// (`typed-data/cashorcrash-last-row-pick-row0` to `-row2`), replayed byte for
// byte, and their chain: the first pick's `previous` is the round's
// `readyHash` (T_0), and each later pick's is the struct hash of the pick
// before it on that round (T_1, T_2). No vector holds a signature of these
// picks, and nothing follows the last one: the round ends `won`.

import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  lastRowReadyHash,
  roundIdOf,
  type TypedDataVector,
  typedDataVectors,
} from "./fixtures/typed-data-vectors.ts";
import type { Bytes32 } from "./hex.ts";
import { hashPlayerAction } from "./messages.ts";
import { encodeTypedData } from "./typed-data.ts";

const PICKS = [
  "cashorcrash-last-row-pick-row0",
  "cashorcrash-last-row-pick-row1",
  "cashorcrash-last-row-pick-row2",
] as const;

/**
 * A Snapshot `roundId` (UUID text) as the round's EIP-712 `bytes32`, as the
 * shell encodes it: its 16 bytes, left-aligned, then 16 zero bytes.
 */
const roundBytes32 = (roundId: string): Bytes32 =>
  `0x${roundId.toLowerCase().replaceAll("-", "").padEnd(64, "0")}`;

const typedData = (name: string): TypedDataVector => {
  const found = typedDataVectors.find(each => each.name === name);
  if (found === undefined) throw new Error(`no typed-data/${name}`);
  return found;
};

const round = roundBytes32(roundIdOf("cashorcrash-last-row-active-step0"));
const [ROW0, ROW1, ROW2] = PICKS;
const row0 = typedData(ROW0);
const row1 = typedData(ROW1);
const row2 = typedData(ROW2);
const picks = [row0, row1, row2];

/** `T_n` of the pick `vector` on the round. */
const structHashOf = (vector: TypedDataVector): Bytes32 =>
  hashPlayerAction({
    action: vector.fields.action,
    path: vector.fields.path,
    sequence: vector.fields.sequence,
    round,
    previous: vector.fields.previous,
  });

describe("the Cash or Crash round won on its last row (typed-data/cashorcrash-last-row-pick-*)", () => {
  it("is one round in every Snapshot", () => {
    for (const name of [
      "cashorcrash-last-row-active-step1",
      "cashorcrash-last-row-active-step2",
      "cashorcrash-last-row-won",
    ]) {
      expect(roundBytes32(roundIdOf(name))).toBe(round);
    }
  });

  it("holds three moves of sequence 1, 2, and 3, one per row", () => {
    expect(
      picks.map(({ fields }) => [
        fields.kind,
        fields.action,
        fields.path,
        fields.sequence,
      ]),
    ).toEqual([
      ["action", "pick row 0 tile 0", [0], 1],
      ["action", "pick row 1 tile 2", [0, 1], 2],
      ["action", "pick row 2 tile 1", [0, 1, 2], 3],
    ]);
  });

  // The base64 form of the same bytes is replayed with every typed-data
  // vector in typed-data.test.ts.
  it.each(PICKS)("replays %s byte for byte", name => {
    const vector = typedData(name);
    expect(`0x${bytesToHex(encodeTypedData(vector.fields))}`).toBe(vector.hex);
  });

  it("chains on the round: T_0 is the ready hash, then each pick's previous is the struct hash of the pick before it", () => {
    expect(row0.fields.previous).toBe(lastRowReadyHash);
    expect(row1.fields.previous).toBe(structHashOf(row0));
    expect(row2.fields.previous).toBe(structHashOf(row1));
  });

  it("does not chain on another round's id", () => {
    const other = hashPlayerAction({
      action: row0.fields.action,
      path: row0.fields.path,
      sequence: row0.fields.sequence,
      round: roundBytes32(roundIdOf("cashorcrash-cash-out-active-step0")),
      previous: row0.fields.previous,
    });
    expect(other).not.toBe(row1.fields.previous);
  });
});
