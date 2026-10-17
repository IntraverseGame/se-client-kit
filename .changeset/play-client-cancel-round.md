---
"@intraverse/se-client-play-client": minor
"@intraverse/se-client-contracts": minor
---

Add `cancelRound` (`POST /play/v1/rounds:cancel`), which passes a signed
`PlayerCancel` in a `RoundActionRequest` body and answers the round's Snapshot
as `unknown`. It is never repeated (retry class `never`): a cancel is not
answered from a log as a repeated move is, so after a lost response or a `503`
the caller reads the Snapshot before it sends the cancel again. The vendored
Play API document now has the `cancelRound` operation, and its generated types
and `PlayApiOperationRoutes` include it.
