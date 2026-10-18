---
"@intraverse/se-client-shell": minor
---

The session knows the required cancel's states (W-25, W-33, W-35). New public
API: `RoundState.cancel` (the cancel's state, `none` until it is reached),
`PlaySession.checkAgain` (from `check-later`, one read under the cancel's
settling rules; otherwise the same as `read`), and the `CancelState` type.
While the cancel is `in-flight`, `settling`, or `check-later`, the round is
open whatever the session read (a start is refused `round-exists`, also after
an `idle` or another round's read), picks and the cash-out are refused, and the
UI gets the round's own latest Snapshot, never one read from elsewhere, which
the game is not sent either (also while the start itself has the cancel in
flight); while it is `settling`, `read` is one of the cancel's counted reads,
and from `check-later` its "check again" read. `ended` is over and lets a new
round start. An action whose cancel moved to a state its own reads decide
(`settling`, `check-later`, `sent`, `not-taken`, `ended`) answers with the
round's Snapshot, not with the failure of the cancel's call or of a read on the
way.
