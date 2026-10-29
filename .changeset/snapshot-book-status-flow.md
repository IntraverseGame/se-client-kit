---
"@intraverse/se-client-snapshot": minor
---

`validateSnapshot` and `validatePlayProblem` follow the synced `se.snapshot/1`
schema: a `playback` (book) Snapshot at `active`, `resolving`, or `canceled`,
on its own or embedded in a typed error, is now refused, with its first issue
at `/status` (`/snapshot/status` in a typed error). A `steps` Snapshot at those
statuses is validated as before. The validator's code is unchanged; the rule is
the schema's.
