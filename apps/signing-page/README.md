# `@intraverse/se-client-signing-page`

The SuperEngine wallet signing page: the one page of the kit that talks to a
browser wallet. When a player chooses to link a wallet to a game session, the
Wrapper opens this page in a popup on an origin of its own; the page lets the
player pick an injected wallet, asks that wallet for one `KeyDelegation`
signature, and hands the signature back to the Wrapper.

**Status:** pre-release. It is an application, not an npm package, and is never
published on its own: it ships inside the Wrapper's release, under `signer/`,
and each environment serves it from its own site, on another registrable domain
than the Wrapper's. Its texts are drafts used on staging; production offers the
wallet link only once its texts and the notice it signs are approved.

## What it does

- It answers only the window that opened it. Opened by hand, or after the
  opening page cut its opener, it says the window lost its connection to the
  game and does nothing else.
- It reads its own configuration document (the Wrapper origins it serves, and
  whether a notice still pending legal review may be signed) from its own
  origin, once, and makes no other request.
- It takes one request from the Wrapper, over the `se.delegation/1` messages:
  the session's action key address, session id, expiry, and the id of the notice
  to sign. It signs only a notice its own copy of the `key-delegation/v1`
  notices holds, never text the Wrapper sends.
- It finds wallets through EIP-6963 only, lists them by name, and asks the one
  the player picks for `eth_requestAccounts`, then `eth_signTypedData_v4` over
  the `KeyDelegation` typed data. A wallet port allows those two calls and
  `wallet_revokePermissions`, with exactly their expected parameters, and
  nothing else: no transaction, no other signature, no chain switch.
- Once the wallet has answered, it asks the wallet to forget the connection
  (best effort), posts the signature or the reason there is none to the Wrapper
  that asked, drops its reference to the Wrapper's window, and then closes its
  own window. The Wrapper checks the signature itself.

## What it keeps

Nothing. The page writes no storage, sets no cookie, registers no service
worker, logs nothing, and sends no telemetry. It never receives the action key,
the play token, the launch code, a round, or an amount. Its policy allows
same-origin scripts, styles, and one fetch only, and no page may frame it.

## More

- [The signing page](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/signing-page.md)
  in the kit specification
- [The wallet delegation](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-wallet-delegation.md),
  the Wrapper's side

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
