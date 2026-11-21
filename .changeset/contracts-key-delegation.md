---
"@intraverse/se-client-contracts": minor
---

Add the key-delegation contract `key-delegation/v1` and sync the Play API
document, the verify API document, and the Snapshot schema to the version that
carries it. The runtime entry adds `keyDelegationNotices`, the published list
of consent texts a wallet may sign, as data of unknown shape (read it with
`@intraverse/se-client-signing`'s `readKeyDelegationNotices`); it holds one
notice today, `en-draft-1`, with status `pending`. The Snapshot schema's
`FairnessContext` gains the optional `keyDelegation` (exported as the type
`SnapshotKeyDelegation`, with its domain as `KeyDelegationDomain`), a `book`
round carries none, and the closed `ErrorCode` list gains
`KEY_DELEGATION_INVALID`, `KEY_DELEGATION_EXPIRED`, and
`KEY_DELEGATION_NOTICE_UNKNOWN`. The Play API document's `StartRoundRequest`
gains the optional `keyDelegation` (`KeyDelegationRequest`, in
`PlayApiComponents`), and the verify API document's `RoundVerification` gains
the optional `keyDelegation` (`KeyDelegationEvidence`, in
`VerifyApiComponents`) and the check `key_delegation`; no other public type
name is added. The documents also bring description-only changes: the bets
`suggestedBets` offers, and the entropy fields' reading on Solana. The
test-only entry adds `keyDelegationVectors` (`v1`: one accepted and eight
refused delegations) and the Snapshot vectors
`valid/coinflip-active-key-delegation` and
`invalid/key-delegation-domain-with-chain`, `-empty`, `-missing-notice`,
`-null`, `-on-book`, `-signature-uppercase`, and `-unknown-field`. No vendored
vector changed.
