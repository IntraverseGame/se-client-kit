---
"@intraverse/se-client-play-client": patch
---

The Play API types follow the synced Play API document `/play/v1`: the start's
body may carry the optional `keyDelegation`, the error codes include
`KEY_DELEGATION_INVALID`, `KEY_DELEGATION_EXPIRED`, and
`KEY_DELEGATION_NOTICE_UNKNOWN`, and the Snapshot's copy carries the optional
`keyDelegation`; the verify API types carry the round's optional
`keyDelegation` and the check `key_delegation`. These type changes alone change
no behavior.
