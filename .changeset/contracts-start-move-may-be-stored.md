---
"@intraverse/se-client-contracts": patch
"@intraverse/se-client-play-client": patch
---

Sync the Play API document `/play/v1` (from se-backend `075b850`): the start's
description now says that after a lost response, `UNAVAILABLE`, or `INTERNAL`
the round may already have been started, and the same key and body answer it,
so sending them again is safe; the move's description (which the cash-out
follows) says the same of the move, and of the same request (key and signed
action). A resend may fail the same way, and `GET /play/v1/snapshot` shows the
round either way. No schema, route, field, or status changed; the generated
types change only in their doc comments. The doc comments of `play-client`'s
`startRound`, `continueRound`, and `cashOutRound` follow; their behaviour is
unchanged.
