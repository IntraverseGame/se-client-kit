// A book round's fields of the verify API's body (V-18, V-21): `book`
// (`BookVerification`), the `DrawnRow` it and `recomputed.draw` share, and the
// book round's own evidence the page's checks take. Validated by the readers
// of `verify-readers.ts`; every index, count, and weight is read as `bigint`,
// never a JS `number`. Pure; `verify-body.ts` reads the rest of the body.

import type { BookEvidence } from "./round-evidence.ts";
import {
  AMOUNT_MAX_LENGTH,
  Bad,
  BOOK_TABLE_MAX_ROWS,
  int,
  nested,
  optional,
  PATTERN,
  type Read,
  shape,
  text,
} from "./verify-readers.ts";

/**
 * Base-10 text matching `pattern`, at most an amount's 78 digits: the
 * multiplier and the total weight are read as `bigint`, so no unbounded text
 * reaches `BigInt` (V-21); a table row's values have the same cap.
 */
const digits =
  (pattern: RegExp) =>
  (v: unknown): Read<string> =>
    typeof v === "string" && v.length <= AMOUNT_MAX_LENGTH
      ? text(v, pattern)
      : Bad;

/** `DrawnRow`'s fields, each with its reader (held to the document). */
export const DRAWN_ROW_FIELDS = {
  index: (v: unknown) => int(v, 0),
  // Capped as an amount is (78 digits), so no unbounded text reaches `BigInt`.
  multiplierMilli: digits(PATTERN.amount),
};
/** A `DrawnRow` (V-21): an `int64` index from 0, read as `bigint`. */
export const drawnRow = nested(s => {
  const read = shape(s, DRAWN_ROW_FIELDS);
  return read === Bad
    ? Bad
    : { index: BigInt(read.index), multiplierMilli: read.multiplierMilli };
});

/** `BookTableRow`'s fields, each with its reader (held to the document). */
export const BOOK_TABLE_ROW_FIELDS = {
  id: digits(PATTERN.amount),
  weight: digits(PATTERN.amount),
  multiplierMilli: digits(PATTERN.amount),
};
/** A `BookTableRow` (V-21): three base-10 strings, each at most 78 digits. */
const tableRow = nested(s => shape(s, BOOK_TABLE_ROW_FIELDS));

/**
 * `book.table` (V-21): at most 250,000 rows, each a `BookTableRow`. Validated,
 * so a malformed table fails the body (V-10), and never kept: no check reads
 * the rows yet (redrawing the row and recomputing `merkleRoot` from them is a
 * later increment).
 */
const isBookTable = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length <= BOOK_TABLE_MAX_ROWS &&
  (v as readonly unknown[]).every(row => tableRow(row) !== Bad);

/** `BookVerification`'s fields, each with its reader (see the document). */
export const BOOK_VERIFICATION_FIELDS = {
  mode: (v: unknown) => text(v),
  // Validated and not kept: an absent or valid table reads as nothing.
  table: (v: unknown) => (v === undefined || isBookTable(v) ? undefined : Bad),
  drawn: (v: unknown) => optional(v, drawnRow),
  cost: (v: unknown) => optional(v, x => text(x, PATTERN.cost)),
  merkleRoot: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
  entryCount: (v: unknown) => optional(v, x => int(x, 1)),
  // Capped as the multiplier is: it is read as `bigint` below.
  totalWeight: (v: unknown) => optional(v, digits(PATTERN.positive)),
};
/**
 * `BookVerification` (V-21): `mode` always; the drawn row and the table's
 * fields are optional on every status. Counts and weights are `bigint`.
 */
export const book = nested(s => {
  const read = shape(s, BOOK_VERIFICATION_FIELDS);
  if (read === Bad) return Bad;
  const { entryCount, totalWeight, ...rest } = read;
  return {
    ...rest,
    ...(entryCount === undefined ? {} : { entryCount: BigInt(entryCount) }),
    ...(totalWeight === undefined ? {} : { totalWeight: BigInt(totalWeight) }),
  };
});

/** A book round's own evidence, from `book` and the fields its checks read. */
export const bookOf = (
  read: Omit<
    BookEvidence,
    "packageHash" | "apiDraw" | "entropyChainId" | "seed"
  >,
  packageHash: string,
  top: {
    readonly recomputed?:
      | { readonly draw?: BookEvidence["apiDraw"] | undefined }
      | undefined;
    readonly entropy?: { readonly chainId?: number | undefined } | undefined;
    readonly reveal?: { readonly seed?: string | undefined } | undefined;
  },
): BookEvidence => ({
  ...read,
  packageHash,
  ...(top.recomputed?.draw === undefined
    ? {}
    : { apiDraw: top.recomputed.draw }),
  ...(top.entropy?.chainId === undefined
    ? {}
    : { entropyChainId: top.entropy.chainId }),
  ...(top.reveal?.seed === undefined ? {} : { seed: top.reveal.seed }),
});

/**
 * V-18: the document says a book round has no signed creation authorization, no
 * ready evidence, no signed actions, and no `game.terms`; and it never carries
 * a key delegation (V-22). A body with `book` and any of them is contradictory,
 * a malformed body (V-10): the page never picks a kind of round for the API, so
 * `book` cannot drop checks 2 to 4 or 9 of a config round.
 */
export const contradictsBook = (top: {
  readonly book?: unknown;
  readonly game: { readonly payoutTerms?: unknown };
  readonly commitment?: { readonly createRoundAuth?: unknown } | undefined;
  readonly readyHash?: string | undefined;
  readonly actions: readonly unknown[];
  readonly keyDelegation?: unknown;
}): boolean =>
  top.book !== undefined &&
  (top.game.payoutTerms !== undefined ||
    top.commitment?.createRoundAuth !== undefined ||
    top.readyHash !== undefined ||
    top.actions.length > 0 ||
    top.keyDelegation !== undefined);

/**
 * V-18: the document leaves `game.terms` out exactly when the body has `book`.
 * A body with neither is no kind of round, a malformed body (V-10).
 */
export const hasNoRoundKind = (top: {
  readonly book?: unknown;
  readonly game: { readonly payoutTerms?: unknown };
}): boolean => top.book === undefined && top.game.payoutTerms === undefined;
