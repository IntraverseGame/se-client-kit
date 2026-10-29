// The rounds the verify page's harness (verify-page.ts) can be configured
// for, and what each needs: the pins of its configuration, and block N with
// the hash the fake RPC endpoints give it (check 6).
// - `canned`: the vendored round the round tests play (verify-rounds.ts), its
//   block N with the fake's synthetic hash;
// - `recorded`: the backend's recorded rounds (recorded-rounds.ts), their pins
//   and their recorded block hash;
// - `book`: the canned book rounds (verify-book-rounds.ts, #156), the round
//   tests' pins and the book vector's `blockValue`.

import type { RoundPins } from "./environment-config.ts";
import { recordedBlock, recordedPins } from "./recorded-rounds.ts";
import { ROUND, ROUND_PINS } from "./round-vector.ts";
import { BOOK_BLOCK_NUMBER, BOOK_BLOCK_VALUE } from "./verify-book-rounds.ts";

export type VerifyRounds = "canned" | "recorded" | "book";

/** The pins of the page's configuration for `rounds`. */
export const pinsFor = (rounds: VerifyRounds): RoundPins =>
  rounds === "recorded" ? recordedPins() : ROUND_PINS;

/** Block N for `rounds`, with its hash when it is not the fake's synthetic one. */
export const blockFor = (
  rounds: VerifyRounds,
): { readonly number: bigint; readonly hash?: string } => {
  if (rounds === "recorded") return recordedBlock();
  return rounds === "book"
    ? { number: BOOK_BLOCK_NUMBER, hash: BOOK_BLOCK_VALUE }
    : { number: ROUND.blockNumber };
};
