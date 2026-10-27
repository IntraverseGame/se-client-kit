---
"@intraverse/se-client-contracts": minor
"@intraverse/se-client-snapshot": minor
---

Sync the Snapshot vectors and the Snapshot schema `se.snapshot/1` to the
version with the Cash or Crash cash-out vectors. The test-only entry adds one
Cash or Crash `[3,3,4]` round played to a cash-out on one signed chain: the
valid Snapshot vectors `cashorcrash-cash-out-active-step0`,
`cashorcrash-cash-out-active-step1`, `cashorcrash-cash-out-resolving`, and
`cashorcrash-cash-out-won` (payout 145), the typed-data vectors
`cashorcrash-pick` and `cashorcrash-cash-out`, and the signed-action vector
`cashorcrash-cash-out`, a `PlayerCashOut` signed with the same public test key
as `coinflip-cancel`. The schema gains an optional `rtp` on a book game's
`config` (`fraction`, the exact return to player as a reduced fraction of 1,
and `decimal`, a display value rounded down to 4 places); the generated
`BookConfig` type carries it, the new `BookRtp` type is exported, and `@intraverse/se-client-snapshot` validates it
as the schema says. The test-only entry adds the valid vector
`book-playback-won-rtp` and the invalid ones `book-rtp-decimal-above-one`,
`book-rtp-decimal-missing`, `book-rtp-decimal-number`,
`book-rtp-decimal-two-places`, and `book-rtp-fraction-decimal`. No vendored
vector changed.
