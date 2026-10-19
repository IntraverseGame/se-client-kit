---
"@intraverse/se-client-shell": patch
---

A start whose round may exist although its answer was lost is now sent once
more, right away, with the same idempotency key and body (W-22, W-36; decided
in human review, 2026-10-19): after no response, a 503 `UNAVAILABLE` whatever
its `retryable`, a 503 with no problem body, or a 500 `INTERNAL`. The Play API
document answers the same key and body with the stored round, even when it has
ended, so the round the server holds becomes the round the shell holds, instead
of a round the player's next start would meet as `ROUND_ACTIVE` and the shell
could not sign in. The resend's answer is read as a first answer is, and its
failure is handled as a first failure is (a `ROUND_ACTIVE` answer shows that
round); the shell never sends it a third time, the transport's own repeats
aside. The signer lock is checked again before the resend: a page that lost it
(`lock-not-held`), or a session that ended, sends nothing more. A 500 with
another code, a 400, a 409, a 422, an answer that is not a Snapshot of a round,
and a start voided before any money moved (`FUNDING_UNCONFIRMED`,
`ENTROPY_UNAVAILABLE`, which the document says to retry with a new key) are not
resent.
