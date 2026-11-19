---
"@intraverse/se-client-contracts": minor
---

Sync the verify API document (`/verify/v1`) to the version whose
`BookVerification` carries the mode's table: the optional `table` lists every
row in table order, at most 250,000 (a larger table answers its commitments
only), each a `BookTableRow` of `id`, `weight`, and `multiplierMilli`, base-10
strings. Its `kernel.vectorSets` example appends
`kernel/public/v1/book-table-commitment`. In `VerifyApiComponents`,
`BookVerification` gains `table` and the schemas gain `BookTableRow`; no public
type name is added. The test-only entry adds the fairness kernel's public set
`kernel/public/v1/book-table-commitment` (`kernelVectors.v1`, 9 vectors: a book
table's leaves, Merkle root, entry count, and total weight); the eight earlier
sets are unchanged.
