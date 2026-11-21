---
"@intraverse/se-client-snapshot": minor
---

The validator follows the synced Snapshot schema `se.snapshot/1` in
`@intraverse/se-client-contracts`: it accepts the optional
`proofs.keyDelegation` (in the schema's `FairnessContext`) on a config round, a
closed object whose hex values are lowercase, refused on a `book` round and
never `null` or empty; and it accepts a Play API problem whose `code` is
`KEY_DELEGATION_INVALID`, `KEY_DELEGATION_EXPIRED`, or
`KEY_DELEGATION_NOTICE_UNKNOWN`, which it refused before.
