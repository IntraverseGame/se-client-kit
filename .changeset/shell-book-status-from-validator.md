---
"@intraverse/se-client-shell": patch
---

The session refuses a book Snapshot at `active`, `resolving`, or `canceled`
through the `snapshot` validator, which takes the rule from the vendored schema
(W-54); the shell has no rule of its own for it. Such a Snapshot, read, answered
to an action, or embedded in a `ROUND_ACTIVE` typed error, fails validation
(W-28).
