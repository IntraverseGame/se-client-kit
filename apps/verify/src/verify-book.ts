// A book round's fields of the verify API's body (V-18, V-21): `book`
// (`BookVerification`), the `DrawnRow` it and `recomputed.draw` share, and the
// book round's own evidence the page's checks take. Validated by the readers
// of `verify-readers.ts`; every index, count, and weight is read as `bigint`,
// never a JS `number`. Pure; `verify-body.ts` reads the rest of the body.

import type { BookEvidence } from "./round-evidence.ts";
import {
  AMOUNT_MAX_LENGTH,
  Bad,
  int,
  nested,
  optional,
  PATTERN,
  shape,
  text,
} from "./verify-readers.ts";

/** A `DrawnRow` (V-21): an `int64` index from 0, read as `bigint`. */
export const drawnRow = nested(s => {
  const read = shape(s, {
    index: v => int(v, 0),
    // Capped as an amount is (78 digits), so no unbounded text reaches `BigInt`.
    multiplierMilli: v =>
      typeof v === "string" && v.length <= AMOUNT_MAX_LENGTH
        ? text(v, PATTERN.amount)
        : Bad,
  });
  return read === Bad
    ? Bad
    : { index: BigInt(read.index), multiplierMilli: read.multiplierMilli };
});

/**
 * `BookVerification` (V-21): `mode` always; the drawn row and the table's
 * fields are optional on every status. Counts and weights are `bigint`.
 */
export const book = nested(s => {
  const read = shape(s, {
    mode: v => text(v),
    drawn: v => optional(v, drawnRow),
    cost: v => optional(v, x => text(x, PATTERN.cost)),
    merkleRoot: v => optional(v, x => text(x, PATTERN.hex32)),
    entryCount: v => optional(v, x => int(x, 1)),
    totalWeight: v => optional(v, x => text(x, PATTERN.positive)),
  });
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
 * ready evidence, and no signed actions. A body with `book` and any of them is
 * contradictory, a malformed body (V-10): the page never picks a kind of round
 * for the API, so `book` cannot drop checks 2 to 4 of a config round.
 */
export const contradictsBook = (top: {
  readonly book?: unknown;
  readonly commitment?: { readonly createRoundAuth?: unknown } | undefined;
  readonly readyHash?: string | undefined;
  readonly actions: readonly unknown[];
}): boolean =>
  top.book !== undefined &&
  (top.commitment?.createRoundAuth !== undefined ||
    top.readyHash !== undefined ||
    top.actions.length > 0);
