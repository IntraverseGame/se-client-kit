// The canned book rounds of the fake verify API (specs/verify-page.md, "The
// e2e fake of the verify API", #156): the vendored `valid/book-lifecycle-won`
// and `-lost` rounds as a book round's `RoundVerification` body, their
// commitment and seed computed from the vector's secret and block value, and a
// tampered copy of each that changes one field. No page is loaded (the browser
// rows are verify-page-book.spec.ts).

import { createHash } from "node:crypto";

import { changedPaths } from "./harness/json-paths.ts";
import {
  BOOK_BLOCK_VALUE,
  BOOK_ENDINGS,
  BOOK_ROUND_ID,
  bookEnding,
  bookRound,
  tamperedBookRound,
} from "./harness/verify-book-rounds.ts";
import { expect, test } from "./harness/verify-page.ts";

/** SHA-256 of `0x` hex values' bytes, concatenated, as `0x` hex. */
const sha256 = (...values: readonly string[]): string =>
  `0x${createHash("sha256")
    .update(Buffer.concat(values.map(v => Buffer.from(v.slice(2), "hex"))))
    .digest("hex")}`;

test.describe("the canned book rounds (#156)", () => {
  for (const ending of BOOK_ENDINGS) {
    test(`${ending}: the vendored round as a book round's body, its commitment and seed computed`, () => {
      const round = bookRound(ending);
      const vector = bookEnding(ending);
      const reveal = round["reveal"] as Record<string, string>;
      const row = {
        index: vector.drawIndex,
        multiplierMilli: vector.multiplierMilli,
      };
      expect(round).toMatchObject({
        roundId: BOOK_ROUND_ID,
        status: vector.status,
        entropy: { value: BOOK_BLOCK_VALUE },
        book: { mode: vector.mode, drawn: row },
        recomputed: { draw: row },
        payout: vector.payout,
        actions: [],
      });
      // A book round has no signed authorization and no ready evidence (V-18).
      expect(round["commitment"]).toEqual({
        roundSecretHash: sha256(String(reveal["roundSecret"])),
      });
      expect(round).not.toHaveProperty("readyHash");
      expect(round).not.toHaveProperty("seedHash");
      expect(reveal["seed"]).toBe(
        sha256(BOOK_BLOCK_VALUE, String(reveal["roundSecret"])),
      );
    });

    test(`${ending}: a tampered copy changes one field`, () => {
      const paths = ([5, 6, 7, 8] as const).map(check =>
        changedPaths(bookRound(ending), tamperedBookRound(ending, check)),
      );
      expect(paths).toEqual([
        ["commitment.roundSecretHash"],
        ["entropy.chainId"],
        ["reveal.seed"],
        ["recomputed.draw.index"],
      ]);
    });
  }

  test("the two endings are one round, won with a payout and lost without", () => {
    const [won, lost] = BOOK_ENDINGS.map(ending => bookEnding(ending));
    expect(won).toMatchObject({ status: "won", multiplierMilli: "2000" });
    expect(won?.payout.amount).toBe("200");
    expect(lost).toMatchObject({ status: "lost", multiplierMilli: "0" });
    expect(lost?.payout.amount).toBe("0");
  });
});
