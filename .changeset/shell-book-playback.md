---
"@intraverse/se-client-shell": minor
---

Book playback (#146, W-50 to W-56). The session starts a book round
(`playback`) like any round, with the bet and the action key's address, and
signs nothing after the start: a pick or a cash-out of a book round is refused
`not_legal` with no request sent. W-26's checks, the tip check, and the
re-issue rule do not run on a book round; instead a later Snapshot of the round
with another `randomnessProof` `source`, `blockNumber`, or `roundSecretHash`,
or another `config.packageHash`, is a changed round, failed verification, and
kept in the round's evidence (W-52). A Snapshot whose `presentation`, `model`,
`config.kind`, or `config.model` differs from the session's first is a changed
session (W-53): it is not read in, the game's bridge is closed, and every use
case then answers the new `SessionRead` kind `session-changed`, reading,
starting, and signing nothing until the page is reloaded. Until the Snapshot
schema is re-vendored, the shell refuses a book Snapshot at `active`,
`resolving`, or `canceled` as failing validation at `/status` (W-54).

The game bridge forwards a book round as its `playback` copy (W-38, RFC-003):
only to a game that declared `playback`, and a Snapshot in a presentation the
game did not declare ends in "game not compatible"; a `hello` no longer needs
`steps`. An event's `data` is a deep copy with null-prototype objects, at most
32 levels and 10 000 values; a copy that fails is not forwarded, and the new
optional bridge option `onCopy` tells the Wrapper. A pick while the latest
Snapshot sent is a book round's is `not_legal` before the status check. The
type-only `@intraverse/se-client-shell/controller` entry adds
`GamePlaybackSnapshot`, `GameBookDraw`, `GameBookEvent`, `GameEventData`, and
`GameJsonValue`; `SnapshotMessage.snapshot` is now `GameSnapshot |
GamePlaybackSnapshot`.
