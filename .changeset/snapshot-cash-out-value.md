---
"@intraverse/se-client-snapshot": minor
---

The per-status types of a validated Snapshot anticipate `cashOutValue`, the
field an update of `@intraverse/se-client-contracts` brings to the
Snapshot schema `se.snapshot/1`: on `active` an optional `Amount`, the server's
quote of what cashing out now credits (served on an `active` steps round after
its first step), and `cashOutValue?: never` on `idle`, `starting`, `resolving`,
`won`, `lost`, `canceled`, and the `playback` presentation, as the schema allows
it on `active` only. The validator is unchanged: it accepts the field once the
schema in `@intraverse/se-client-contracts` carries it, and rejects it until
then.
