---
"@intraverse/se-client-contracts": minor
---

Sync the verify API document (`/verify/v1`) to the version where `Game.terms`
is optional: it is set for a config-model round and absent exactly when the
answer carries `book`. `PayoutTerms` is unchanged. In `VerifyApiComponents`,
`Game.terms` becomes optional and `Game` gains a description; no public type
name is added.
