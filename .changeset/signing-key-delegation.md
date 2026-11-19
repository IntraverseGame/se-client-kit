---
"@intraverse/se-client-signing": minor
---

Add `KeyDelegation`, the statement a player's wallet signs that an action key
acts for it in one session, under the chainless domain
`{ name: "SuperEngine KeyDelegation", version: "1" }`:
`keyDelegationTypedData` builds the exact `eth_signTypedData_v4` typed data;
`recoverKeyDelegation` recovers the wallet over the digest computed from the
notice's hash, after making the wallet's signature canonical (`v` 0 or 1 to 27
or 28, a high `s` to `n - s` with `v` flipped), and returns that canonical
signature; `noticeHash` is the Keccak-256 of a notice's exact UTF-8 bytes;
`sessionIdBytes32` maps a `ses_` session id to `bytes32`; and `sameHex`
compares two hex values by their bytes. With the types `KeyDelegation`,
`KeyDelegationMessage`, `KeyDelegationTypedData`, and `RecoveredKeyDelegation`.
`recoverAddress` is unchanged and still refuses every non-canonical signature.
