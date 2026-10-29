---
"@intraverse/se-client-shell": patch
---

The session refuses a book Snapshot at `active`, `resolving`, or `canceled`
through the `snapshot` validator, which now takes the rule from the synced
schema (W-54), instead of through a rule of its own: the shell's interim check
is removed. What the session does is unchanged: such a Snapshot, read, answered
to an action, or embedded in a `ROUND_ACTIVE` typed error, fails validation
(W-28).
