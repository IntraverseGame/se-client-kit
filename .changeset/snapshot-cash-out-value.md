---
"@intraverse/se-client-snapshot": minor
---

The per-status types of a validated Snapshot anticipate `cashOutValue`, the
field the contracts sync of this release brings to `se.snapshot/1` (se-backend's
ADR-050): on `active` an optional `Amount`, the server's quote of what cashing
out now credits (served on an `active` steps round after its first step), and
`cashOutValue?: never` on `idle`, `starting`, `resolving`, `won`, `lost`,
`canceled`, and the `playback` presentation, as the schema allows it on `active`
only. The validator is unchanged: it accepts the field once the vendored schema
carries it, and rejects it until then.
