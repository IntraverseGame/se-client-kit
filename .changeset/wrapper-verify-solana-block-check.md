---
"@intraverse/se-client-wrapper": minor
---

The verify page in the release artifact reads a Solana entropy source (RFC-007,
#235). For a round whose source is of kind `solana`, check 6 asks every
configured endpoint for the cluster's genesis hash and for the block at slot N
(finalized, no transactions, no rewards), and decodes its base58 `blockhash` to
the 32-byte value check 7 uses, with no Solana or base58 library. A skipped slot
takes the value of the first finalized block after it, by the backend's rule,
and an endpoint whose ledger shows a gap fails the check (`ledger-gap`, "An
endpoint's ledger has a gap at slot N."). The quorum, the comparison with
`entropy.value`, and the "could not be verified" wording are as for an EVM
source, and a round older than a provider's history is "could not be verified"
with the detail "this provider does not serve slot N". The Solana requests
send no credentials, cache, or referrer, follow no redirect, and take only an
HTTP 200 as an answer. An EVM source is read exactly as before.
