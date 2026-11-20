---
"@intraverse/se-client-shell": minor
---

The tip check reads a `solana` entropy source (RFC-007): it asks every
configured endpoint `getGenesisHash` and `getSlot` at `finalized`, both at
once, compares each genesis hash with the one the package pins for the
source's cluster, and judges the final slots with the source's quorum and lag
margin, in slots. There is no second pass at `h_low`. Its failures are the EVM
check's codes (`chain-id-mismatch`, `too-few-answered`, `chain-id-unavailable`,
`lagging`), so their labels and decisions do not change. `RpcCall` gains the
two Solana calls, `getGenesisHash` with `[]` and `getSlot` with
`[{ commitment: "finalized" }]`: a transport sends any call's `method` and
`params` as given.
