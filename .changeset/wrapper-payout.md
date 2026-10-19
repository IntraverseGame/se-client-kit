---
"@intraverse/se-client-wrapper": patch
---

The Wrapper shows a finished round's payout: beside a `won` result, "Payout"
with the Snapshot's `payout.formatted`, and beside a `lost` result only when
`payout.value` is above 0 (compared as a `bigint`). It shows the same beside a
round that closed before the shell's required cancel arrived. An absent
`payout` shows nothing, with no error, and no amount is ever computed from
`currentMultiplier` or anything else.
