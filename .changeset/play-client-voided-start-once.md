---
"@intraverse/se-client-play-client": minor
---

`startRound` is no longer repeated with the same `idempotencyKey` after a start
voided or refused before any money moved (`FUNDING_UNCONFIRMED`,
`ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, `ROUND_VOIDED`), whatever the
problem's `retryable`: the Play API document says to retry such a start with a
new key. A new retry class, `start`, repeats a lost response and a retryable
`UNAVAILABLE` only (an allow-list, so a code added later is sent once). Other
routes' retries are unchanged.
