---
"@intraverse/se-client-contracts": minor
"@intraverse/se-client-play-client": minor
---

Sync the Play API document `/play/v1`: the launch-code redeem answer
(`RedeemResponse`) now has a required `gameOrigin`, the origin to frame the game
at, of 1 to 267 characters, and the generated `PlayApiComponents` and
`PlayApiOperations` types carry it. `redeemLaunchCode` returns `gameOrigin` and
throws a `ProtocolError` for an answer without it, or with one that is empty or
longer than 267 characters. The test-only entry of `contracts` adds the
`signed-action` Snapshot vectors (`snapshotVectors.signedAction`): a PlayerCancel
signed by an independent signer, with its EIP-712 message, hashes, and
signature.
