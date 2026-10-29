---
"@intraverse/se-client-contracts": minor
---

Sync the Snapshot schema `se.snapshot/1` and the Snapshot vectors to the
version with a book round's status flow (#146). The schema refuses a `playback`
Snapshot whose `status` is `active`, `resolving`, or `canceled`: a book round
shows `idle`, `starting` (no `proofs`, then `randomnessProof` once bound), then
`won` or `lost`. Its descriptions also state that a session keeps one
`presentation`, `config.kind`, and `config.model`; the generated types change
only in those descriptions. The test-only entry adds one book round of one
session, the valid vectors `book-lifecycle-idle` (with `config.rtp`),
`book-lifecycle-starting-funded`, `book-lifecycle-starting-bound`, and
`book-lifecycle-lost`, and the invalid vectors `book-status-active`,
`book-status-resolving`, and `book-status-canceled`. The valid vector
`book-playback-resolving-placeholder`, which the new schema refuses, is
removed: a pre-release change of a vendored vector, made at its source, which
replaced it with the `invalid/book-status-*` vectors. The vectors are then
synced to the backend's follow-up: `book-lifecycle-won`, the same round's
`won` ending (payout 200), is added; `invalid/blindness-draw-before-resolution`,
`invalid/blindness-draw-on-canceled`, and `invalid/create-round-auth-on-book`,
which the status rule made fail first at `/status`, are removed, and
`invalid/blindness-draw-before-resolution-starting` and
`invalid/create-round-auth-on-book-starting` replace two of them with one
failure each.

The Play API document `/play/v1` and the verify API document `/verify/v1` are
synced too. `PlayApiComponents` gains `BookRtp` and the optional
`rtp` of `BookConfig`; the Play document's descriptions state the book status
flow, the one presentation per session, and that `INSUFFICIENT_FUNDS`,
`LIMIT_EXCEEDED`, and `PLAYER_RESTRICTED` (422) name a book round's refused
debit. `PlayApiComponents` also gains the optional `gamePath` of
`RedeemResponse` (the path of the game's page on `gameOrigin`; absent reads as
`/`). `VerifyApiComponents` gains the optional `book` of `RoundVerification`
(`BookVerification`) and `draw` of `Recomputation` (`DrawnRow`). No public type
name is added.
