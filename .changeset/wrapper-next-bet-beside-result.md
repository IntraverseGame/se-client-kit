---
"@intraverse/se-client-wrapper": patch
---

A round that ended (`won`, `lost`, `canceled`, or the shell's cancel `ended`)
now shows its result with the next bet beside it: the bet selector and the
start button, drawn from that Snapshot's own `bet`. The separate "New round"
control is gone. The Play API's Snapshot read keeps answering the ended round
until the next start, so a second round in one session no longer waits for an
`idle` read that never comes. The round id and the verify link stay until the
round the player started from them is shown; a refused start keeps them.
