---
"@intraverse/se-client-shell": minor
---

A read that causes the W-16 resend of a lost move or cash-out now answers with
the resend's answer, and the game is sent it too. Before, `read()` answered with
the read's own older Snapshot (the round still `active`), so the Wrapper and the
game kept showing the round in play after the resend's answer showed it settled.
A read whose resend is lost too still answers with the read.

`RoundState` adds `unconfirmed` (`"move"` or `"cash-out"`), set only while the
pending move or cash-out had its one resend and that resend was lost too, with
the round still `active` and the action neither applied nor refused. A read
clears it; nothing more is sent or signed for the action, so `checkAgain` is a
read only.
