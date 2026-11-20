---
"@intraverse/se-client-wrapper": minor
---

The environment configuration document has a new required field,
`entropyChainKind`: each entropy source's kind, `"evm"` or `"solana"`,
cross-checked with the source's key and `entropyChainId` (a `solana` source is
keyed `solana` on cluster 101, 102, or 103; an `evm` source never uses those
numbers). The Wrapper and the verify page refuse a document without it, and a
`production` document whose `solana` source is not on mainnet-beta, 101
(`production-cluster`). The Pages configuration tool takes the field in
`PAGES_CHAIN_PINS`, and its production mode applies the same rule through the
validator. Update every environment's configuration document in the same
release as this one.
