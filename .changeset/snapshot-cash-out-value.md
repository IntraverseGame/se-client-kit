---
"@intraverse/se-client-snapshot": minor
---

The per-status types of a validated Snapshot carry `cashOutValue`, a field of
the Snapshot schema `se.snapshot/1` in `@intraverse/se-client-contracts`: on
`active` an optional `Amount`, the server's quote of what cashing out now
credits (served on an `active` steps round after its first step), and
`cashOutValue?: never` on `idle`, `starting`, `resolving`, `won`, `lost`,
`canceled`, and the `playback` presentation, as the schema allows it on `active`
only. The validator accepts the field where the schema allows it.
