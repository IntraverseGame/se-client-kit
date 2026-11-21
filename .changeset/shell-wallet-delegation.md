---
"@intraverse/se-client-shell": minor
---

The session holds an opt-in wallet delegation (RFC-006): `delegationOffer` says
whether a "Link a wallet" entry may be offered and with which notice (the last
`approved` notice of the vendored `key-delegation/v1` list, or, with
`acceptPendingNotices`, the last `pending` one; none without the new
`signingPageOrigin` option); `beginDelegation` takes the signing window's handle
and speaks `se.delegation/1` with it (a 10 s wait for `ready`, the window's
`closed` read every 500 ms, one `request` posted to the signing page's origin
only, messages taken only from that handle and origin); `receiveDelegation`,
`dropDelegation`, `delegation`, and `onDelegation` give the rest. A wallet's
answer is registered, in memory only, once the shell has recovered its signer
itself; every start then carries it as `keyDelegation`, its resend included, and
a start refused with a 422 `KEY_DELEGATION_*` code makes the state `refused`, in
which, and during a "Sign again" attempt begun from it, `start` answers
`delegation-refused` with nothing sent. A round's evidence is checked for the
delegation the start sent (`RoundState.failure` `delegation`, with
`delegationFailure`). The action key is now drawn when the session opens, once
the page holds the signer lock, and `openPlaySession` resolves `key-generation`
when it cannot be drawn. The package now depends on
`@intraverse/se-client-contracts`' runtime entry, for the notices only. Nothing
about the delegation is stored or logged.
