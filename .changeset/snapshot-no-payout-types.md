---
"@intraverse/se-client-snapshot": patch
---

The per-status types of a validated Snapshot now say `payout?: never` on
`idle`, `starting`, `active`, `resolving`, and `canceled`, as the
`se.snapshot/1` schema does: `payout` is allowed on `won` and `lost` only. The
validator is unchanged.
