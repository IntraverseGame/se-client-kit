---
"@intraverse/se-client-contracts": patch
---

Sync the Snapshot schema `se.snapshot/1` and the Snapshot vectors to the
version in which every invalid vector breaks only its own rule. The schema's
`idle` rule rejects `proofs` at `/proofs` only, no longer also at the document
itself; validity is unchanged, so an idle Snapshot with `proofs` is still
refused, and a validator that reports every issue now reports one fewer for it.
In the test-only entry, the invalid vector
`presentation-playback-with-config-model` (a config round at `resolving`, which
also failed at `/status` and `/proofs`) is removed and
`presentation-playback-with-config-model-starting` (the same rule on a
`starting` round, failing only at `/model`) is added: a pre-release change of a
vendored vector, made at its source. No other vector changed, and the generated
types did not change.
