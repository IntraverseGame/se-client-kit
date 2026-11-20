---
"@intraverse/se-client-shell": minor
---

The chain configuration requires each entropy source's kind, `entropyChainKind`:
`"evm"` or `"solana"`, one entry for each source and no other
(`invalid-entropy-chain-kind` otherwise). It is cross-checked
(`entropy-chain-kind-mismatch`): a `solana` source must be keyed `solana` and
pinned on cluster 101, 102, or 103, and an `evm` source must not be keyed
`solana` or use one of those numbers. A `production` document refuses a `solana`
source on a test cluster, 102 or 103 (`production-cluster`, at
`entropyChainId.<source>`): production's entropy is mainnet-beta, 101. A
document may mix sources of both kinds. `SourceConfig` is now a union on `kind`;
a `solana` source carries its cluster's `genesisHash`, which the package pins,
never read from the configuration.
