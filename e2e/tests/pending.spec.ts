// The browser rows of the Wrapper's test plan (specs/wrapper.md, T-10 to T-19)
// that cannot run yet. Each is declared with `test.fixme`, so it is reported as
// skipped, never as passed, and has no body. The round rows run on the
// vendored Coin Flip round (harness/round-play.ts): T-10, T-11, T-14, T-15's
// signed action, T-16's round errors, and T-19 have their own spec files. What
// is left needs a multi-step game (T-12), the shell's resend of a move lost
// offline (T-15, its own pull request), or the operator handshake (RFC-001).
// When a row becomes runnable, it moves to its own spec file with a real body
// on the harness (fixtures.ts) and leaves this list.

import { test } from "./harness/fixtures.ts";

const PENDING: readonly (readonly [string, string])[] = [
  [
    "T-12",
    "a cash-out on a multi-step game, and the last surviving move (needs a multi-step game; the reference game is Coin Flip, one step)",
  ],
  [
    "T-15 (resend of a lost move)",
    "after the connection returns and the Snapshot read shows the move not applied (the same step, the round still active), the shell sends the same signed bytes with the same idempotencyKey again, once, and never a new signature (the resend change: W-16, decided in human review 2026-10-18)",
  ],
  [
    "T-9a (handshake)",
    "the operator handshake that lets a page without location.ancestorOrigins unlock signing, and its message rules (needs RFC-001, the operator launch contract, accepted and built; the W-49 minimum runs in t9a-embedding.spec.ts in every project)",
  ],
];

test.describe("pending: the Wrapper's browser test plan", () => {
  for (const [id, what] of PENDING) {
    test.fixme(`${id}: ${what}`, () => {
      // Pending: see the file comment. No assertion is made, so nothing passes.
    });
  }
});
