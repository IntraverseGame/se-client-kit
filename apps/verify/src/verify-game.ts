// The verify API's `game` (`Game` and `PayoutTerms` of the vendored
// document): the package hash, the terms' nodes the shape test reads (A-3),
// and the house edge and multiplier cap check 7's payout reads (OQ-B9). `terms`
// is optional here; whether a body may leave it out is V-18's rule, which needs
// the body's `book` (`verify-book.ts`).

import {
  Bad,
  int,
  list,
  nested,
  optional,
  PATTERN,
  shape,
  text,
} from "./verify-readers.ts";

const termsNode = nested(s =>
  shape(s, {
    options: v => int(v, 1, 25),
    losers: v => int(v, 0, 24),
    next: list(v => int(v, 0)),
  }),
);

const terms = nested(t =>
  shape(t, {
    nodes: list(termsNode),
    houseEdgeWad: v => text(v, PATTERN.amount),
    maxMultiplierMilli: v => int(v, 1),
  }),
);

export const game = nested(s => {
  const read = shape(s, {
    gameCode: v => text(v),
    gameId: v => int(v, 0),
    gameVersion: v => int(v, 0),
    packageHash: v => text(v, PATTERN.hex32),
    terms: v => optional(v, terms),
  });
  if (read === Bad) return Bad;
  const { packageHash } = read;
  // A book round has no terms: no nodes, so A-3's shape test never holds for it.
  if (read.terms === undefined) return { terms: [], packageHash };
  const { nodes, ...payoutTerms } = read.terms;
  return { terms: nodes, payoutTerms, packageHash };
});
