---
"@intraverse/se-client-contracts": patch
---

Sync the Snapshot vectors `se.snapshot/1` to the version with a Cash or Crash
round won on its last row. The test-only entry adds one Cash or Crash `[3,3,4]`
round played through its last row on one signed chain: the valid Snapshot
vectors `cashorcrash-last-row-active-step0`, `cashorcrash-last-row-active-step1`,
`cashorcrash-last-row-active-step2`, and `cashorcrash-last-row-won` (payout
289), and the typed-data vectors `cashorcrash-last-row-pick-row0`,
`cashorcrash-last-row-pick-row1`, and `cashorcrash-last-row-pick-row2`, each
pick's `previous` the struct hash of the one before it. The round ends `won` on
its last pick, so no cash-out or signed-action vector follows it. The schema,
the Play API document, and the generated types did not change, and no vendored
vector changed.
