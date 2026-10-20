// The browser rows of the Wrapper's test plan (specs/wrapper.md, T-10 to T-19)
// that cannot run yet. Each is declared with `test.fixme`, so it is reported as
// skipped, never as passed, and has no body. The round rows run on the
// vendored Coin Flip round (harness/round-play.ts): T-10, T-11, T-14, T-15's
// signed action and its resend of a move lost offline, T-16's round errors,
// and T-19 have their own spec files. T-9a's operator embedding, the built
// `se.operator/1` contract (W-49 to W-49f, #42), runs in the Chromium,
// Firefox, and WebKit projects (t9a-embedding, t9a-navigations, and
// t9a-operator-round). What is left needs a multi-step game (T-12).
// When a row becomes runnable, it moves to its own spec file with a real body
// on the harness (fixtures.ts) and leaves this list.

import { test } from "./harness/fixtures.ts";

const PENDING: readonly (readonly [string, string])[] = [
  [
    "T-12",
    "a cash-out on a multi-step game, and the last surviving move (needs a multi-step game; the reference game is Coin Flip, one step)",
  ],
];

test.describe("pending: the Wrapper's browser test plan", () => {
  for (const [id, what] of PENDING) {
    test.fixme(`${id}: ${what}`, () => {
      // Pending: see the file comment. No assertion is made, so nothing passes.
    });
  }
});
