---
"@intraverse/se-client-wrapper": patch
---

A start voided or refused before any money moved (`FUNDING_UNCONFIRMED`,
`ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, `ROUND_VOIDED`) now shows "Back to
start" instead of "Try again". The control reads the Snapshot again, as before,
and the player starts a new round with the start control; it never repeats the
start.
