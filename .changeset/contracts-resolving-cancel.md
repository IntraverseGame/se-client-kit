---
"@intraverse/se-client-contracts": patch
"@intraverse/se-client-play-client": patch
---

Sync the Play API document `/play/v1`: the cancel's description now says that
`canceled` is final, that a cancel the engine has not answered yet is answered
`resolving` (read the Snapshot again), and that a cancel of a round still
`resolving` is `FAILED_PRECONDITION`. No schema, field, or status changed; the
generated types change only in their doc comments. The test-only entry of
`contracts` adds the valid Snapshot vector
`snapshotVectors.valid["coinflip-resolving-cancel"]`: a Coin Flip round whose
cancel is waiting for the engine's answer. The doc comment of `play-client`'s
`cancelRound` now lists these answers; its behaviour is unchanged.
