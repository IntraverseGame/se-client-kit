---
"@intraverse/se-client-contracts": patch
"@intraverse/se-client-play-client": patch
---

Sync the Play API document `/play/v1`: the Snapshot read's description now says
that it answers the session's most recent round, ended rounds included (a `won`
or `lost` one with its `payout`), until the next `rounds:start`, and that `idle`
means no round has ended since that start (no round yet, or the last one voided
or refused, whose reason the start's own answer carries). The cancel's
description now says a read after `resolving` shows `canceled` or `active`, and
that the round stays the session's last round once it has ended. No schema,
field, or status changed; the generated types change only in their doc comments.
The doc comments of `play-client`'s `getSnapshot` and `cancelRound` follow; their
behaviour is unchanged.
