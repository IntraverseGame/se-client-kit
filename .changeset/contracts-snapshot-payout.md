---
"@intraverse/se-client-contracts": minor
"@intraverse/se-client-snapshot": minor
---

Sync the Snapshot schema `se.snapshot/1` and the Play API document `/play/v1`
to the version with the Snapshot's top-level `payout`: an optional `Amount`,
computed by the server, that a `won` or `lost` round carries (0 when nothing is
credited) and that `idle`, `starting`, `active`, `resolving`, and `canceled`
never carry. The generated `Snapshot` and `PlayApiComponents` types gain
`payout`; no public type name is added (the generator's copy of `Amount` for
`payout`, `Amount1`, is not exported). `@intraverse/se-client-snapshot`
validates against the synced schema: `payout` is accepted on `won` and `lost`
and refused on every other status. The test-only entry of `contracts` adds the
valid Snapshot vectors `coinflip-won-payout`, `coinflip-lost-payout-zero`,
`cashorcrash-won-cashout-payout`, `cashorcrash-won-expired-payout`,
`steps-lost-expired-payout`, and `book-playback-won-payout`, and the invalid
ones `payout-on-idle`, `payout-on-starting`, `payout-on-active`,
`payout-on-resolving`, `payout-on-canceled`, and `payout-value-number`.
