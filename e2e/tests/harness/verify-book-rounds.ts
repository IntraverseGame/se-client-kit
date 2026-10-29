// The canned book rounds the fake verify API serves (VT-5, VT-6, #156): the
// vendored `valid/book-lifecycle-won` and `-lost` Snapshot vectors, read at run
// time through `contracts`' test-only entry, written as the verify API
// document's `RoundVerification` body for a book round: their round id,
// randomness proof, payout, and draw, with `book` and `recomputed.draw`. No
// vendored vector is a verify API body, so two values are computed here with
// SHA-256: `commitment.roundSecretHash` is `SHA-256(roundSecret)` (the
// vector's own `roundSecretHash` is a placeholder no secret hashes to), and
// `reveal.seed` is `SHA-256(blockValue || roundSecret)`. Block N's hash is the
// vector's `blockValue` (the `book` rounds of verify-page.ts give it on the fake
// RPC endpoints), or another one a test passes (VT-6: the round fixtures' fake
// RPC). The table's fields and the mode's cost are made-up values of the right
// shape: no vector carries them, and the page shows them without checking
// them. A tampered round is a change of one field of the matching one.

import { createHash } from "node:crypto";

import { validVector } from "./vectors.ts";
import { KERNEL_V1_VECTOR_SETS, VERIFY_PINS } from "./verify-rounds.ts";

type Json = Record<string, unknown>;

export type BookEnding = "book-lifecycle-won" | "book-lifecycle-lost";

export const BOOK_ENDINGS: readonly BookEnding[] = [
  "book-lifecycle-won",
  "book-lifecycle-lost",
];

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const field = (root: Json, key: string, where: string): Json => {
  const next = root[key];
  if (!isRecord(next)) throw new Error(`${where}: no ${key}`);
  return next;
};

/** A deep, mutable copy of a vendored book round. */
const copy = (ending: BookEnding): Json => {
  const copied: unknown = JSON.parse(
    JSON.stringify(validVector(ending, "Snapshot").input),
  );
  if (!isRecord(copied)) throw new Error(`${ending}: not an object`);
  return copied;
};

const randomnessOf = (round: Json, where: string): Json =>
  field(field(round, "proofs", where), "randomnessProof", where);

/** SHA-256 of the raw bytes of `0x` hex values, concatenated, as `0x` hex. */
const sha256 = (...values: readonly string[]): string =>
  `0x${createHash("sha256")
    .update(Buffer.concat(values.map(v => Buffer.from(v.slice(2), "hex"))))
    .digest("hex")}`;

/** The book rounds' id (both endings are one round). */
export const BOOK_ROUND_ID = String(copy("book-lifecycle-won")["roundId"]);

/** The vector's block N hash, which the `book` fake RPC endpoints give. */
export const BOOK_BLOCK_VALUE = String(
  randomnessOf(copy("book-lifecycle-won"), "book-lifecycle-won")["blockValue"],
);

/** The vector's block N. */
export const BOOK_BLOCK_NUMBER = BigInt(
  Number(
    randomnessOf(copy("book-lifecycle-won"), "book-lifecycle-won")[
      "blockNumber"
    ],
  ),
);

/** What the tests read of an ending: its result, payout, draw, and mode. */
export const bookEnding = (ending: BookEnding) => {
  const round = copy(ending);
  const config = field(round, "config", ending);
  const draw = field(config, "draw", ending);
  const payout = field(round, "payout", ending);
  return {
    status: String(round["status"]),
    mode: String(config["model"]),
    packageHash: String(config["packageHash"]),
    drawIndex: Number(draw["index"]),
    // The Snapshot's whole multiplier, in thousandths as the document has it.
    multiplierMilli: (
      BigInt(String(draw["payoutMultiplier"])) * 1000n
    ).toString(),
    payout: {
      amount: String(payout["value"]),
      currency: String(payout["unit"]),
      decimals: Number(payout["decimals"]),
    },
  } as const;
};

/** The made-up table of the mode (no vector carries one). */
const TABLE = {
  cost: "1",
  merkleRoot: `0x${"5a".repeat(32)}`,
  entryCount: 3,
  totalWeight: "1000000",
} as const;

/**
 * The vendored book round, ended as `ending`, as the verify API's body, over
 * block N's hash `blockValue` (the vector's by default).
 */
export const bookRound = (
  ending: BookEnding,
  blockValue: string = BOOK_BLOCK_VALUE,
): Json => {
  const round = copy(ending);
  const randomness = randomnessOf(round, ending);
  const roundSecret = String(randomness["roundSecret"]);
  const read = bookEnding(ending);
  const row = { index: read.drawIndex, multiplierMilli: read.multiplierMilli };
  return {
    roundId: round["roundId"],
    status: read.status,
    closed: true,
    kernel: {
      name: "the SuperEngine fairness kernel",
      version: 1,
      vectorSets: [...KERNEL_V1_VECTOR_SETS],
    },
    game: {
      gameCode: "book-game",
      gameId: 2,
      gameVersion: 1,
      packageHash: read.packageHash,
      terms: {
        nodes: [],
        houseEdgeWad: "40000000000000000",
        maxMultiplierMilli: 100_000,
      },
    },
    shape: [],
    bet: { amount: "100", currency: "EUR", decimals: 2 },
    payout: read.payout,
    commitment: { roundSecretHash: sha256(roundSecret) },
    entropy: {
      source: randomness["source"],
      chainId: VERIFY_PINS.entropyChainId,
      block: randomness["blockNumber"],
      value: blockValue,
    },
    reveal: { roundSecret, seed: sha256(blockValue, roundSecret) },
    actions: [],
    recomputed: { kind: read.status, steps: [], draw: { ...row } },
    book: { mode: read.mode, drawn: { ...row }, ...TABLE },
    checks: [],
  };
};

/** The checks a tampered book round fails. */
export type TamperedBookCheck = 5 | 6 | 7 | 8;

/** A hash that is not the one given: every digit changed. */
const other = (hash: string): string =>
  `0x${hash
    .slice(2)
    .replaceAll(/[0-9a-f]/giu, digit => (digit === "0" ? "1" : "0"))}`;

/**
 * The matching book round with one field changed, so the check fails: check 5
 * by another `commitment.roundSecretHash`, check 6 by an `entropy.chainId` that
 * is not the pinned one, check 7 by another `reveal.seed`, check 8 by a
 * `recomputed.draw` row other than `book.drawn`.
 */
export const tamperedBookRound = (
  ending: BookEnding,
  check: TamperedBookCheck,
): Json => {
  const round = bookRound(ending);
  if (check === 5) {
    const commitment = field(round, "commitment", ending);
    commitment["roundSecretHash"] = other(
      String(commitment["roundSecretHash"]),
    );
  } else if (check === 6) {
    field(round, "entropy", ending)["chainId"] = VERIFY_PINS.entropyChainId + 1;
  } else if (check === 7) {
    const reveal = field(round, "reveal", ending);
    reveal["seed"] = other(String(reveal["seed"]));
  } else {
    const draw = field(field(round, "recomputed", ending), "draw", ending);
    draw["index"] = Number(draw["index"]) + 1;
  }
  return round;
};
