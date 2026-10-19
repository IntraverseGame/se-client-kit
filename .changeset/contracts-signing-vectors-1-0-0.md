---
"@intraverse/se-client-contracts": minor
---

Sync the signing vectors of the contracts repository's release `1.0.0`
(`test/vectors/signing.json`). The test-only entry (`signingVectors`) adds a
`PlayerCancel` entry in `types`, `payoutTerms` (six named terms with their
hashes), and `closes` (nine full rounds, one per way a round ends, each ending
in `closed`, or in `canceled` for the player's cancel). The older fields are
unchanged.
