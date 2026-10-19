---
"@intraverse/se-client-contracts": patch
"@intraverse/se-client-play-client": patch
---

Sync the Play API document `/play/v1` (from se-backend `b47b286`, then
`65504f5`): the cancel's description now says that
when the engine had already closed the round before the cancel arrived (a final
move whose answer was lost, or the time limit), the round ends as the engine
closed it and the cancel is never honored. The answer is the round's Snapshot
with no error: `won` or `lost` with its `payout`, or `canceled` with
`closeReason: "expired"` (the bet refunded); a read after `resolving` can end on
those too, that after a lost response, `UNAVAILABLE`, or `INTERNAL` the cancel
may already have been taken (read the Snapshot before sending it again), and
that a round the engine cannot settle on its own stays `resolving` until it is
resolved manually. The Snapshot read's description now says that the round and
`bet.balance` are read separately, so `bet.balance` may be newer than the
round, and the next read shows both. No schema, field, or status changed; the
generated types change only in their doc comments. The doc comments of
`play-client`'s `cancelRound` and `getSnapshot` follow; their behaviour is
unchanged.
