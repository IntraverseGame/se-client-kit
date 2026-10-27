// The browser rows of the Wrapper's test plan (specs/wrapper.md, T-10 to T-19)
// that cannot run yet. Each is declared with `test.fixme`, so it is reported as
// skipped, never as passed, and has no body. The round rows run on the
// vendored Coin Flip round (harness/round-play.ts): T-10, T-11, T-14, T-15's
// signed action and its resend of a move lost offline, T-16's round errors,
// and T-19 have their own spec files. T-9a's operator embedding, the built
// `se.operator/1` contract (W-49 to W-49f, #42), runs in the Chromium,
// Firefox, and WebKit projects (t9a-embedding, t9a-navigations, and
// t9a-operator-round). T-12's cash-out runs on the vendored Cash or Crash
// round (t12-cash-out.spec.ts). What is left is the other half of T-12's fake
// (hermetic) row: the last surviving move, after which the round is `won` and
// nothing is signed. No vendored round ends on its last row (the Cash or Crash
// vectors end by a cash-out after the first row), and the fake answers only
// from vendored vectors. T-12's preview row (preview/t12-cash-out.spec.ts)
// plays the cash-out only, too.
// When a row becomes runnable, it moves to its own spec file with a real body
// on the harness (fixtures.ts) and leaves this list.

import { test } from "./harness/fixtures.ts";

const PENDING: readonly (readonly [string, string])[] = [
  [
    "T-12",
    "the hermetic (fake) row's last surviving move, after which the round is won and nothing is signed; waits for a vendored round that ends on its last row (the cash-out runs in t12-cash-out.spec.ts)",
  ],
];

test.describe("pending: the Wrapper's browser test plan", () => {
  for (const [id, what] of PENDING) {
    test.fixme(`${id}: ${what}`, () => {
      // Pending: see the file comment. No assertion is made, so nothing passes.
    });
  }
});
