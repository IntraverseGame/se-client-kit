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

/** `TermsNode`'s fields, each with its reader (held to the document). */
export const TERMS_NODE_FIELDS = {
  options: (v: unknown) => int(v, 1, 25),
  losers: (v: unknown) => int(v, 0, 24),
  next: list(v => int(v, 0)),
};
const termsNode = nested(s => shape(s, TERMS_NODE_FIELDS));

/** `PayoutTerms`'s fields, each with its reader (held to the document). */
export const PAYOUT_TERMS_FIELDS = {
  nodes: list(termsNode),
  houseEdgeWad: (v: unknown) => text(v, PATTERN.amount),
  maxMultiplierMilli: (v: unknown) => int(v, 1),
};
const terms = nested(t => shape(t, PAYOUT_TERMS_FIELDS));

/** `Game`'s fields, each with its reader (held to the document). */
export const GAME_FIELDS = {
  gameCode: (v: unknown) => text(v),
  gameId: (v: unknown) => int(v, 0),
  gameVersion: (v: unknown) => int(v, 0),
  packageHash: (v: unknown) => text(v, PATTERN.hex32),
  terms: (v: unknown) => optional(v, terms),
};
export const game = nested(s => {
  const read = shape(s, GAME_FIELDS);
  if (read === Bad) return Bad;
  const { packageHash } = read;
  // A book round has no terms: no nodes, so A-3's shape test never holds for it.
  if (read.terms === undefined) return { terms: [], packageHash };
  const { nodes, ...payoutTerms } = read.terms;
  return { terms: nodes, payoutTerms, packageHash };
});
