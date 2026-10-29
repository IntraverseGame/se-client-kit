// The verify API's `game` (`Game` and `PayoutTerms` of the vendored
// document): the package hash, the terms' nodes the shape test reads (A-3),
// and the house edge and multiplier cap check 7's payout reads (OQ-B9).

import {
  Bad,
  int,
  list,
  nested,
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

export const game = nested(s => {
  const read = shape(s, {
    gameCode: v => text(v),
    gameId: v => int(v, 0),
    gameVersion: v => int(v, 0),
    packageHash: v => text(v, PATTERN.hex32),
  });
  const terms = nested(t =>
    shape(t, {
      nodes: list(termsNode),
      houseEdgeWad: v => text(v, PATTERN.amount),
      maxMultiplierMilli: v => int(v, 1),
    }),
  )(s["terms"]);
  if (read === Bad || terms === Bad) return Bad;
  const { nodes, ...payoutTerms } = terms;
  return { terms: nodes, payoutTerms, packageHash: read.packageHash };
});
