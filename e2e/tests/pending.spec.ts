// The browser rows of the Wrapper's test plan (specs/wrapper.md, T-10 to T-18)
// that cannot run yet. Each is declared with `test.fixme`, so it is reported as
// skipped, never as passed, and has no body. The reference game they play
// exists (#10, reference-game-smoke.spec.ts runs it on its own), but the
// Wrapper mounts it only once the redeem answer carries its game origin D
// (TODO(Play API): gameOrigin on redeem); the fake's vectors cannot issue a
// round W-26 passes for the session's own key; and the operator handshake
// (RFC-001) is not built. T-13, T-14a, T-17, W-49's minimum (T-9a's browser
// half on Chromium), and the runnable parts of T-15 and T-16 have their own
// spec files.
// When a row becomes runnable, it moves to its own spec file with a real body
// on the harness (fixtures.ts) and leaves this list.

import { test } from "./harness/fixtures.ts";

const PENDING: readonly (readonly [string, string])[] = [
  [
    "T-10",
    "a win: the start, the move, the CreateRoundAuth and tip checks, and the round id and verify link (needs the game mounted, D on the redeem answer, and a round W-26 passes)",
  ],
  ["T-11", "a loss (needs the game mounted, and a round W-26 passes)"],
  [
    "T-12",
    "a cash-out on a multi-step game, and the last surviving move (needs the game mounted, and a multi-step game)",
  ],
  [
    "T-14",
    "an axe audit of every status and error state, and keyboard-only play (needs the game mounted)",
  ],
  [
    "T-15 (signed action)",
    "offline during a signed action, and no second action at its sequence (needs a round W-26 passes, which the fake's vectors cannot issue for the session's key)",
  ],
  [
    "T-16 (rest)",
    "the out-of-sync state, the session-ending codes, and a rejected Snapshot (needs a round W-26 passes, and answers the fake's vectors do not hold)",
  ],
  [
    "T-18",
    "the sandbox: a malicious game gets nothing (needs the game mounted)",
  ],
  [
    "T-9a (handshake)",
    "the operator handshake that lets a page without location.ancestorOrigins unlock signing, its message rules, and the Firefox and WebKit projects (needs RFC-001, the operator launch contract, accepted and built; the W-49 minimum runs in t9a-embedding.spec.ts)",
  ],
];

test.describe("pending: the Wrapper's browser test plan", () => {
  for (const [id, what] of PENDING) {
    test.fixme(`${id}: ${what}`, () => {
      // Pending: see the file comment. No assertion is made, so nothing passes.
    });
  }
});
