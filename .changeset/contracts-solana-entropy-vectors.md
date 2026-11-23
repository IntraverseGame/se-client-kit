---
"@intraverse/se-client-contracts": patch
---

Vendor the backend's Solana vectors on the test-only entry: four entropy reads
under `entropyVectors.solana` (`produced-slot`, `skipped-slot`,
`skipped-slots-long-term-storage`, and `skipped-slot-ledger-gap`) and the two
Snapshot vectors `valid/coinflip-won-solana` and
`valid/coinflip-won-solana-skipped-slot`. No released vector changes.
