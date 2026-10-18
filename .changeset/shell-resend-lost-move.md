---
"@intraverse/se-client-shell": patch
---

A move or cash-out whose send was lost is now sent again once, with the same
signed bytes and idempotency key, when a later read of the round (the newest by
`version`; a late, older read decides nothing) shows it `active` at the step
before the action, the action not applied (W-16, decided in human review,
2026-10-18). The backend recognises the repeat by its signed action (sequence
and bytes) in the round's action log. The one resend is shared with `resend`:
after either path sent it again, `resend` answers `not_active`, so an action is
sent at most twice. It is never re-signed; a read that shows the action applied,
the step moved on, or the round no longer `active` sends nothing, a 409 or a 400
to the resend is a refusal with no further send, and a re-issue does not stop it
(W-26). If the resend fails too, the action stays pending and the round ends by
a read that shows it applied or by its expiry rule.

A lost send now has one definition for every signed action, the required
cancel included: no answer, or a 503 not marked `retryable: false` (a 503 with
no problem body included). A 503 marked `retryable: false` is never resent
(W-42); for the cancel it is no proof of a refusal (a 503 may come with the
cancel stored), so the reads decide as after a 422, and a failed read leaves it
settling.
