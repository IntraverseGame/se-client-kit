---
"@intraverse/se-client-shell": minor
"@intraverse/se-client-signing": minor
---

`signing` adds `hashNewRound` (a round's `created`,
`keccak256(abi.encode(newRound))`), `hashRandomnessTarget`, and `hashReady`
(`T_0`, `keccak256(abi.encode(created, seedHash))`), with the types
`NewRound`, `RandomnessTarget`, and `Ready`. Inside `shell`: the round's
`CreateRoundAuth` checks (present, pinned values, cross-field including the
pinned entropy chain id, the signature, and the ready evidence), the re-issue
rule, and the round's verdict, which settles `T_0` only when every check
passes and says when a `PlayerCancel` must be signed.
