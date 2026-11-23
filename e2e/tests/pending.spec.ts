// The browser rows of the Wrapper's test plan (specs/wrapper.md, T-10 to T-19)
// that cannot run yet. Each is declared with `test.fixme`, so it is reported as
// skipped, never as passed, and has no body. The round rows run on the
// vendored Coin Flip round (harness/round-play.ts): T-10, T-11, T-14, T-15's
// signed action and its resend of a move lost offline, T-16's round errors,
// and T-19 have their own spec files. T-9a's operator embedding, the built
// `se.operator/1` contract (W-49 to W-49f, #42), runs in the Chromium,
// Firefox, and WebKit projects (t9a-embedding, t9a-navigations, and
// t9a-operator-round). T-12's fake (hermetic) row runs on the vendored Cash or
// Crash rounds (t12-cash-out.spec.ts): the cash-out, and the last surviving
// move, after which the round is `won` and nothing is signed. T-12's preview
// row (preview/t12-cash-out.spec.ts) plays the cash-out only.
// Pending: the part of T-42 that replays a Solana signature vector (the
// backend has published none yet, se-backend#613). When a row cannot run yet,
// it is declared here with its reason; when it becomes runnable, it moves to its own spec file with a
// real body on the harness (fixtures.ts) and leaves this list.

import { test } from "./harness/fixtures.ts";

const PENDING: readonly (readonly [string, string])[] = [
  [
    "T-42",
    "a Solana round's cancel and picks compared byte for byte with a vendored Solana signed-action vector; waits for the backend's Solana signature vectors (se-backend#613)",
  ],
];

test.describe("pending: the Wrapper's browser test plan", () => {
  for (const [id, what] of PENDING) {
    test.fixme(`${id}: ${what}`, () => {
      // Pending: see the file comment. No assertion is made, so nothing passes.
    });
  }
});
