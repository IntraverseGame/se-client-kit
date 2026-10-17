---
"@intraverse/se-client-shell": minor
---

The chain configuration pins a chain id per entropy source: `entropyChainId`
is required for each source (`invalid-entropy-chain-id` otherwise). The tip
check asks every endpoint for `eth_chainId` beside its final block, and fails
when any endpoint reports another chain, answering or not
(`chain-id-mismatch`), or an answering one reports none
(`chain-id-unavailable`). `RpcCall` now also covers `eth_chainId`.
