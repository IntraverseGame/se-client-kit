// Test-only: the vendored book round (`valid/book-lifecycle-won` and `-lost`,
// read through the `contracts` test-only entry) written as the verify API's
// `RoundVerification` body for a book round (V-18 to V-21): its round id,
// randomness proof, payout, and draw, with `book` and `recomputed.draw`. No
// vendored vector is a verify API body, so the commitment and the seed are
// computed here with Web Crypto's SHA-256: the vector's `roundSecretHash` is a
// placeholder that no secret hashes to, so `commitment.roundSecretHash` is
// `SHA-256(roundSecret)`, and `reveal.seed` is
// `SHA-256(blockValue || roundSecret)` over the block hash the test's chain
// gives. The table's fields (`merkleRoot`, `entryCount`, `totalWeight`) and
// `cost` are made-up values of the right shape: no vector carries them, and
// the page shows them without checking them.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

import { bytesFromHash, hashFromBytes } from "../hex.ts";
import { asRecord } from "./verify-body.ts";

type Json = Record<string, unknown>;

export type BookEnding = "book-lifecycle-won" | "book-lifecycle-lost";

/** The book table's made-up values (no vector carries them). */
export const BOOK_TABLE = {
  cost: "1",
  merkleRoot: `0x${"5a".repeat(32)}`,
  entryCount: 3,
  totalWeight: "1000000",
} as const;

const ENTROPY_CHAIN_ID = 1;

const inputOf = (name: string): Json => {
  const vector = snapshotVectors.valid[name] as { input: Json } | undefined;
  if (vector === undefined) throw new TypeError(`no vector ${name}`);
  return structuredClone(vector.input);
};

const sha256 = async (...parts: readonly string[]): Promise<string> => {
  const bytes = parts.map(part => {
    const decoded = bytesFromHash(part);
    if (decoded === undefined) throw new TypeError(`not a hash: ${part}`);
    return decoded;
  });
  const preimage = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bytes) {
    preimage.set(b, at);
    at += b.length;
  }
  return hashFromBytes(
    new Uint8Array(await crypto.subtle.digest("SHA-256", preimage)),
  );
};

/** The block hash of the vector's block N (`randomnessProof.blockValue`). */
export const bookBlockValue = (ending: BookEnding = "book-lifecycle-won") =>
  String(
    asRecord(asRecord(inputOf(ending)["proofs"])["randomnessProof"])[
      "blockValue"
    ],
  );

/** What the tests read of the vendored round: its id, draw, and payout. */
export const bookVector = (ending: BookEnding) => {
  const input = inputOf(ending);
  const config = asRecord(input["config"]);
  const draw = asRecord(config["draw"]);
  return {
    roundId: String(input["roundId"]),
    mode: String(config["model"]),
    packageHash: String(config["packageHash"]),
    drawIndex: Number(draw["index"]),
    // The Snapshot's whole multiplier, in thousandths as the document has it.
    multiplierMilli: (
      BigInt(String(draw["payoutMultiplier"])) * 1000n
    ).toString(),
    payout: asRecord(input["payout"]),
  };
};

/**
 * The vendored book round, ended as `ending`, as the verify API's body, with
 * block N's hash `blockValue` (the vector's own by default).
 */
export const bookBody = async (
  ending: BookEnding = "book-lifecycle-won",
  blockValue: string = bookBlockValue(ending),
): Promise<Json> => {
  const input = inputOf(ending);
  const randomness = asRecord(asRecord(input["proofs"])["randomnessProof"]);
  const roundSecret = String(randomness["roundSecret"]);
  const vector = bookVector(ending);
  const row = {
    index: vector.drawIndex,
    multiplierMilli: vector.multiplierMilli,
  };
  const status = String(input["status"]);
  return {
    roundId: vector.roundId,
    status,
    closed: true,
    kernel: {
      name: "the SuperEngine fairness kernel",
      version: 1,
      vectorSets: [],
    },
    game: {
      gameCode: "book-game",
      gameId: 2,
      gameVersion: 1,
      packageHash: vector.packageHash,
      terms: {
        nodes: [],
        houseEdgeWad: "40000000000000000",
        maxMultiplierMilli: 100_000,
      },
    },
    shape: [],
    bet: { amount: "100", currency: "EUR", decimals: 2 },
    payout: {
      amount: String(vector.payout["value"]),
      currency: String(vector.payout["unit"]),
      decimals: Number(vector.payout["decimals"]),
    },
    commitment: { roundSecretHash: await sha256(roundSecret) },
    entropy: {
      source: randomness["source"],
      chainId: ENTROPY_CHAIN_ID,
      block: randomness["blockNumber"],
      value: blockValue,
    },
    reveal: { roundSecret, seed: await sha256(blockValue, roundSecret) },
    actions: [],
    recomputed: { kind: status, steps: [], draw: { ...row } },
    book: { mode: vector.mode, drawn: { ...row }, ...BOOK_TABLE },
    checks: [],
  };
};
