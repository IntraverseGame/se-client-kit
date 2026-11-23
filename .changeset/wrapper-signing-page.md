---
"@intraverse/se-client-wrapper": minor
---

The wallet signing page ships inside the Wrapper's release, under `signer/`,
for the wallet delegation (RFC-006, ADR-012). It is the only page of the kit
that talks to a wallet, and each environment serves it on its own origin, on
another registrable domain than the Wrapper's; the Wrapper's own site never
serves it. Opened by the Wrapper as a popup, it answers only its opener, reads
its own configuration document (`environment`, `wrapperOrigins`, and the
optional `acceptPendingNotices`, refused in production), takes one request,
and signs only a notice its own copy of the `key-delegation/v1` notices holds.
It finds wallets through EIP-6963 only, lists them by name, and asks the one
the player picks for `eth_requestAccounts` and `eth_signTypedData_v4` over
the `KeyDelegation` typed data, then asks it to forget the connection, and
posts the signature (or the reason there is none) to the Wrapper. A wallet
port allows those calls and `wallet_revokePermissions` with exactly their
expected parameters, and nothing else. The page keeps and logs nothing, its
policy has no image source and no frame ancestor, and the release build
refuses a `Cross-Origin-Opener-Policy` header in any rule of `headers.json`,
which would cut the signing window's opener. The release adds the page's files
to its integrity manifest, puts SRI on its script and stylesheet, allows
`signer/index.html` as a third HTML file, and holds the page to a size budget
of its own.
