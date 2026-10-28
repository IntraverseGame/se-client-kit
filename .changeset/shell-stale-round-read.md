---
"@intraverse/se-client-shell": patch
---

A Snapshot of the round the shell holds whose `version` is lower than the
round's latest is now ignored before the round's tracking, its checks, and its
transcript state see it (W-29), for a config round as for a book round. A stale
read, from requests that overlapped, could before move the round back: send its
verdict back to `checking`, make a legal next move look illegal, reopen an ended
round (`round-exists` on the next start), or reach the game's copy at the
mount. An equal `version` is still read, and the W-16 resend keeps its own rule.
