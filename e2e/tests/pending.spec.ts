// The browser rows of the Wrapper's test plan (specs/wrapper.md, T-10 to T-18)
// that cannot run yet. Each is declared with `test.fixme`, so it is reported as
// skipped, never as passed, and has no body: the Wrapper does not open a
// session or render a state yet (#9). The reference game they play exists
// (#10, reference-game-smoke.spec.ts runs it on its own).
// When a row becomes runnable, it moves to its own spec file with a real body
// on the harness (fixtures.ts) and leaves this list.

import { test } from "./harness/fixtures.ts";

const PENDING: readonly (readonly [string, string])[] = [
  [
    "T-10",
    "a win: the start, the move, the CreateRoundAuth and tip checks, and the round id and verify link (needs #9)",
  ],
  ["T-11", "a loss (needs #9)"],
  [
    "T-12",
    "a cash-out on a multi-step game, and the last surviving move (needs #9 and a multi-step game)",
  ],
  [
    "T-13",
    "no secret after a whole session, a reload, and the session's end; and going back (page.goBack) after the launch does not return to the launch URL, since the generic scan cannot see history entries (needs #9: a session to scan)",
  ],
  [
    "T-14",
    "an axe audit of every status and error state, and keyboard-only play (needs #9)",
  ],
  [
    "T-14a",
    "live regions, focus, colour and icon, reduced motion, 200 % zoom (needs #9)",
  ],
  [
    "T-15",
    "offline during starting, resolving, and a signed action (needs #9)",
  ],
  [
    "T-16",
    "each typed error of W-42 and each degraded state of W-44 (needs #9)",
  ],
  [
    "T-17",
    "two tabs: the second does not get the lock and does not sign (needs #9)",
  ],
  ["T-18", "the sandbox: a malicious game gets nothing (needs #9)"],
  [
    "T-9a",
    "operator embedding, with and without location.ancestorOrigins, on Chromium, Firefox, and WebKit (needs #9)",
  ],
];

test.describe("pending: the Wrapper's browser test plan", () => {
  for (const [id, what] of PENDING) {
    test.fixme(`${id}: ${what}`, () => {
      // Pending: see the file comment. No assertion is made, so nothing passes.
    });
  }
});
