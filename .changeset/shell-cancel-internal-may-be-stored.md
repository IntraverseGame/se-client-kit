---
"@intraverse/se-client-shell": patch
---

A 500 `INTERNAL` marked `retryable: false` to the required cancel is no longer
read as a refusal. The Play API document does not describe that answer for the
cancel, so the shell reads it defensively, as it reads a 503 marked
`retryable: false`: the cancel may be stored, the reads decide, a failed read
after it leaves the cancel `settling`, and a round that stays `resolving` ends
in `check-later`. Nothing is resent. A 400 `INVALID_ARGUMENT`, and a 500 with
another code, stay refusals.
