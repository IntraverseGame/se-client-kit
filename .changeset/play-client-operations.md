---
"@intraverse/se-client-play-client": minor
---

Add one function per Play API operation, typed from the vendored document:
`redeemLaunchCode` (no credential, never repeated), `refreshPlayToken`,
`startRound`, `continueRound`, `cashOutRound`, and `getSnapshot`. A Snapshot
answer stays `unknown`; the redeem and refresh answers are checked and typed,
and hand the new play token to a `seal` the caller passes, returning only the
sealed value.
`PLAY_ROUTES` holds each operation's route, checked against the document at
compile time. The bearer header form, the RFC 3339 deadlines, and the
idempotency key's limits are now the document's, no longer provisional.
