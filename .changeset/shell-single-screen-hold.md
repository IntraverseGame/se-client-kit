---
"@intraverse/se-client-shell": minor
---

The session now applies W-38's hold (RFC-004): the game is never sent an
`active` Snapshot whose round the shell has not found `ready` (W-26). At both
hand-offs to the game's bridge, every read and action answer (`show`) and the
mount (`mountGame`), an `active` Snapshot is given only when its round is the
session's current round, its verdict is `ready`, and it is not out of sync,
evaluated after the round observed it. A round being checked, failed,
re-issued, or out of sync, a `ROUND_ACTIVE` resume, and a round an earlier page
left open are held; every Snapshot that is not `active` is given as before, and
a book round is unaffected. A game now sees a round go from `starting` to
`active` once it is ready, and the `hello` is answered with the last copy given.
`ControllerBridge`'s type and `se.controller/1` are unchanged.

`RoundState` adds `pending` (`"move"` or `"cash-out"`), read only: the round's
pending move or cash-out from its signature until a Snapshot shows it applied,
while signing is open. It is absent after a 400 or a 409 holds signing, once
the round is out of sync, re-issued, failed, or over, once the session has
ended, and for a cancel; it stays set beside `unconfirmed` after the lost
resend. It carries no signature, key, or bytes.
