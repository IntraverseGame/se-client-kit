# Signing page

Status: **accepted with RFC-006 and ADR-012 on 2026-11-20; built in slice S6b of
se-client-kit#220.** This is the contract the signing page is built and tested
to. The design was decided by the human on 2026-11-17
([RFC-006](../rfcs/archived/RFC-006-wallet-delegated-action-key.md), archived:
its sections 3 to 6, the spike's evidence, and the residual risk;
[ADR-012](../decisions/ADR-012-the-signing-page-on-its-own-origin.md),
accepted).

## Purpose

- The signing page is the only code in the kit that talks to a browser wallet.
  It is opened by the Wrapper as a popup when a player chooses to link a wallet
  to the session ([The wallet delegation](./wrapper/the-wallet-delegation.md)),
  lets the player pick an injected wallet, asks that wallet for one
  `KeyDelegation` signature, and hands the signature back to the Wrapper.
- It lives on an origin of its own, on another registrable domain than the
  Wrapper's, so that a wallet's standing grant is never given to the origin that
  holds the player's action key and play token, and so that, in a browser with
  site isolation, the wallet code runs in another process from the key
  (ADR-012).
- Its source is public in this repository, like everything that touches the
  player's key, and it ships inside the Wrapper's attested release artifact.

## Scope

In scope: the `apps/signing-page` app; its configuration document; its side of
`se.delegation/1`; the wallet port and the EIP-6963 discovery; its states,
texts, and accessibility; its headers; its build, release, and deploy.

Out of scope: any wallet other than an injected browser wallet found through
EIP-6963 (no WalletConnect, no `window.ethereum` fallback); a contract wallet
(ERC-1271: its signature does not recover to it, so the shell refuses it); any
other signature or transaction; mobile (the Wrapper offers the entry on a fine
pointer with hover only, W-64); a designed visual layout (se-client-kit#256, a
follow-up change); languages other than English.

## Boundary

- **It owns:** the wallet connection, for the length of one signature; the
  wallet port's allow-list; the choice of the notice it signs, from its own
  copy, by `id`.
- **It does not own:** the action key, the play token, the launch code, the
  round, or any amount; it never receives any of them. It does not decide
  whether a delegation is valid: the shell checks the signature itself (W-68),
  and the backend checks it again at the start.
- **It consumes:** `signing` at run time, for the exact `KeyDelegation` typed
  data the shell verifies; `contracts`' runtime entry, for its copy of the
  `key-delegation/v1` notices; its own configuration document; and the `request`
  the Wrapper posts.
- **It talks to:** the Wrapper's frame, over `se.delegation/1`, and an injected
  wallet provider (EIP-1193), through the wallet port only.

## Vocabulary

| Term           | Meaning                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| signing page   | This app, served from `signingPageOrigin`, opened by the Wrapper as an unnamed popup.                                                                                 |
| Wrapper origin | An origin the signing page serves, from its configuration's `wrapperOrigins`; the origin of the Wrapper's site in that environment.                                   |
| wallet         | A browser extension that injects an EIP-1193 provider and announces it through EIP-6963 (`eip6963:announceProvider`).                                                 |
| wallet port    | The one module that calls a wallet provider, and only with its allow-listed methods.                                                                                  |
| notice         | An entry of the `key-delegation/v1` notices list: `{ id, text, keccak256, status }`, `status` `pending`, `approved`, or `retired`; the text is what the wallet signs. |

## Contract

### The app and its origin (SP-1, SP-2)

- **SP-1. The app.** `apps/signing-page` (`@intraverse/se-client-signing-page`,
  private, never published or versioned on its own): plain TypeScript and Vite
  like the Wrapper and the verify page, `publicDir: false`, one HTML file. At
  run time it takes nothing but `signing` and `contracts`' runtime entry: no
  third-party runtime dependency (ADR-001), never `shell`, never `contracts`'
  test-only entry outside its tests, and no package or app imports it. The
  import-direction lint and its fixture cases hold it to that
  ([Packages](./client-kit/packages.md)). Its release notes go in the Wrapper's
  changesets, and `.changeset/config.json` ignores it, as it does `verify` and
  the reference game.
- **SP-2. Its origin.** It is served from an origin of its own: never from the
  Wrapper's origin (under a path or otherwise), the verify page's, or a game's.
  That origin is on a different registrable domain from the Wrapper's, by W-37's
  comparison (the last two labels, ADR-007). The Wrapper's validator refuses a
  `signingPageOrigin` that shares that key with the Wrapper's own origin, equals
  the verify page's origin, or is an entry of `operatorOrigins` or `gameOrigins`
  ([Configuration](./wrapper.md#configuration)). A `signingPageOrigin` equal to
  the Wrapper's own origin is refused (`signing-page-same-site`) in every
  environment, loopback included: `local`'s loopback exception covers only two
  different loopback origins (decided by the human, 2026-11-21).
  - **Hosting** (decided by the human, 2026-11-20): Cloudflare Pages, the
    project `se-signer-stage` for staging and, for production, the production
    project (the `pages-prod` secret `PAGES_SIGNER_PROJECT`), each served at its
    own `pages.dev` origin, with **no custom domain**. A `pages.dev` origin's
    comparison key is `pages.dev`, which the Wrapper's custom hostname does not
    share, so it passes the rule above. The staging game's origin is also a
    `pages.dev` origin; that is allowed (the rule compares the signing page with
    the Wrapper, and with the game origins exactly), and browsers treat
    `pages.dev` as a public suffix, so the game and the signing page are
    different sites to the browser too.
  - **The origins are configuration values**, set by the infrastructure owner
    (the Wrapper's `signingPageOrigin`, the signing page's `wrapperOrigins`),
    never written in this repository.

### Its configuration (SP-3)

- **SP-3. The configuration document.** One attested build serves every
  environment: the page reads its environment's values from
  `environment-config.json` at its own origin's root
  (`/environment-config.json`), written next to it by the deploy (SP-15). It is
  fetched once, at load, with `credentials: "omit"`, `cache: "no-store"`,
  `redirect: "error"`, and an 8 s timeout, below the Wrapper's 10 s wait for
  `ready` (W-66), which bounds it: a configuration that has not arrived when the
  Wrapper stops waiting is of no use; it is the page's only request. The
  document is exactly:

  | Field                  | Shape                                                                                                                                                                          |
  | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `environment`          | `production`, `preview`, or `local` (the Wrapper's values)                                                                                                                     |
  | `wrapperOrigins`       | a non-empty list of distinct origins, each written as `URL.origin` serializes it, `https:` (or `http:` on a loopback host in `local` only), none of them the page's own origin |
  | `acceptPendingNotices` | optional, a boolean, `false` when absent: whether a `pending` notice may be signed (SP-7)                                                                                      |

  Any other field, a missing one, or a value of another shape refuses the
  document; so does `acceptPendingNotices: true` with
  `environment: "production"` (`pending-notices-in-production`), the Wrapper's
  rule, so the page never signs a `pending` notice in production. Each issue
  names the field, never a value. A document that cannot be fetched, is not
  JSON, or is refused leaves the page in its configuration error state (SP-10):
  it posts nothing to the Wrapper (with no `ready`, the Wrapper's own 10 s wait
  ends it, W-66).

### The protocol, its side (SP-4 to SP-6)

`se.delegation/1`'s messages, fields, and shapes are W-67's
([The wallet delegation](./wrapper/the-wallet-delegation.md)).

- **SP-4. The opener first.** At load, before anything else (before its
  configuration is fetched, before any wallet discovery), the page reads
  `window.opener`. When it is `null` (the window was opened under the operator
  page's COOP `same-origin`, W-49g, or opened by hand, or reloaded after it
  dropped its opener), the page shows "This window lost its connection to the
  game. Close it." and does nothing else, for good: no configuration read, no
  wallet discovery, no connection, no signature, no message.
- **SP-5. `ready`, per allowed origin.** Once its configuration is valid, the
  page adds its `message` listener, then posts
  `{ schema: "se.delegation/1", type: "ready" }` to `window.opener` once for
  each origin of `wrapperOrigins`, each time with that origin as `targetOrigin`
  (never `"*"`): the browser drops every copy whose origin is not the opener's,
  so only the real Wrapper receives one.
- **SP-6. The request.**
  - It accepts a message only when `event.source === window.opener` and
    `event.origin` is on `wrapperOrigins`; it fixes that origin for the page's
    life, and posts its answer only to it, through `window.opener`, with that
    origin as `targetOrigin`.
  - It takes **one** `request`; every later message is ignored. A message that
    is not a well-formed `request` (W-67's message rules) is ignored and never
    answered. A well-formed `request` whose values break W-67's shapes (an
    `actionKey` that is not `0x` and 40 hex digits or is the zero address, a
    `sessionId` not `^ses_[0-9a-f]{32}$`, an `expiry` that is not a safe integer
    of at least 1, a `noticeId` not `^[a-z0-9-]{1,64}$`) is answered `failed`
    with `invalid-request` (SP-9's order). So is an `expiry` later than
    8640000000000 (unix seconds), the latest a JavaScript `Date` can hold: the
    page shows the expiry as a date and time (SP-10) and never as raw seconds,
    so it refuses one it cannot show (decided by the human, 2026-11-21).
  - **Its own wait.** With no `request` within 10 s of `ready` (on its own
    clock, injected in tests), the page stops listening and shows "Close this
    window and try again from the game." This also covers a popup the player
    reloaded while it still had its opener: the Wrapper sends its one `request`
    only once.
  - **Input only by message.** The page takes its request only by `postMessage`
    from an allowed Wrapper origin. It never reads its URL's query or fragment,
    `document.referrer`, `window.name`, or any storage; its one fetch is its
    configuration document (SP-3).

### The notice it signs (SP-7)

- **SP-7.** The page signs only a notice its own copy holds (`contracts`'
  runtime entry, read with `signing`'s notice reader), found by the request's
  `noticeId`, never text the Wrapper sends: an `approved` one, or a `pending`
  one where its own `acceptPendingNotices` is `true`. Any other `id` (not in the
  list, `retired`, or `pending` without the flag) is answered `failed` with
  `unknown-notice`, before any wallet is discovered or asked.

### The wallet (SP-8, SP-9)

- **SP-8. Discovery and choice.** EIP-6963 only: the page listens for
  `eip6963:announceProvider` and dispatches one `eip6963:requestProvider`; there
  is no `window.ethereum` fallback. An announcement is read only from an event
  whose `detail` holds an `info` with a string `uuid`, a string `name` (shown as
  text, never markup, at most 64 characters, cut beyond), and a `provider` with
  a `request` function; anything else is ignored. Wallets announce on load and
  again on each request (the spike listed four entries for two wallets), so
  announcements are de-duplicated by `info.uuid`, the first kept. The page waits
  1 s, on its clock, after its request: with none announced by then, it answers
  `failed` with `no-wallet` (SP-9's order; the Wrapper says "No browser wallet
  was found.", W-69). With one or more, it lists them by their announced names,
  one button each, in the order announced; a wallet announced later is added to
  the list. The announced icon is not shown (no `img-src` in the page's policy,
  SP-13): a name is enough to choose, and an icon is only the wallet's own
  claim. **One request at a time:** once the player picks a wallet, every wallet
  button is disabled until the page answers (a second click got MetaMask's
  -32002, "Request of type 'wallet_requestPermissions' already pending", in the
  spike).
- **SP-9. The wallet port, and the order of the answer.**
  - **The allow-list.** The port is the only code that calls a provider's
    `request`, and it calls nothing else: `eth_requestAccounts` (no params);
    `eth_signTypedData_v4`, only as `[account, typedData]`, where `account` is
    the first account `eth_requestAccounts` returned (`0x` and 40 hex digits,
    never the zero address, W-67's shape of `wallet`, else `wallet-error`) and
    `typedData` is the JSON text of the object `signing`'s
    `keyDelegationTypedData` built from the notice's text, the request's
    `actionKey`, `sessionIdBytes32` of its `sessionId`, and its `expiry`,
    compared before the call with exactly the `KeyDelegation` primary type, the
    chainless domain (`name` and `version` only), and the four-field type; and
    `wallet_revokePermissions`, only with `[{ eth_accounts: {} }]`. Any other
    method, or one of these with other params, throws before it reaches the
    provider. If `keyDelegationTypedData` refuses a request that has already
    passed SP-6's shape checks, the page answers `failed` `invalid-request`, in
    this order, and asks no wallet.
  - **The signature.** The page calls `eth_requestAccounts`, then
    `eth_signTypedData_v4`. An answer that is a string of `0x` and 130 hex
    digits is the signature; the page does not normalize or recover it (the
    shell does, W-68). A rejection with EIP-1193 code 4001 (the user rejected
    the request), at either call, is `rejected`; any other error, a timeout of
    the provider's own, or an answer of another shape is `wallet-error`. The
    page shows no message of the wallet's own.
  - **Revoke first, best effort.** Once the wallet has answered (a signature or
    an error), and before the page posts anything, it calls
    `wallet_revokePermissions` with `[{ eth_accounts: {} }]` and waits for it at
    most 3 s, on its clock; error 4200 (method not supported), any other
    failure, and the timeout are ignored. It does so whenever
    `eth_requestAccounts` was called, whatever it answered. The kit cannot
    guarantee that a wallet forgets the page's connection.
  - **Then the answer, then the opener, then the window.** The page posts
    `result` (with `wallet`, the account in lowercase, and the signature as the
    wallet gave it) or `failed` (with its `reason`) to the fixed Wrapper origin,
    then sets `window.opener = null`, so it holds no reference to the Wrapper's
    frame from then on, then calls `window.close()` on its own window. Every
    answer follows this order: `invalid-request` and `unknown-notice` (no wallet
    was asked, so there is nothing to revoke), `no-wallet`, `rejected`,
    `wallet-error`, and `result`. The page closes itself because Chromium and
    WebKit no longer let the opener close a window that has dropped its opener
    (the Wrapper's `close()` on its handle then does nothing; Firefox still
    closes it); the Wrapper's close when the answer arrives (W-66) stays as the
    fallback (decided by the human, 2026-11-21). A page that never answers (no
    opener, a refused configuration, no request in time) never closes itself;
    the player or the Wrapper closes it.

### States and texts (SP-10, SP-11)

- **SP-10. States.** Each state's text, in English (the page has no session
  language; English only in the first increment). The texts are **staging
  drafts** (decided by the human, 2026-11-20), as W-65's are: used on staging as
  written and reviewed before production offers the delegation; the notice
  itself is the backend's and is never reworded. Every outcome that answers the
  Wrapper ends with the page closing its own window (SP-9; the Wrapper's close
  is the fallback, W-66) and the Wrapper telling the player (W-69), so the page
  has no "you can close this window" state.

  | State                  | When                                                    | The page shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | lost connection        | no opener at load (SP-4)                                | "This window lost its connection to the game. Close it."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | configuration error    | its configuration could not be read or is refused       | "This page could not load its settings. Close this window and try again from the game."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | waiting for the game   | `ready` posted, no `request` yet                        | "Connecting to the game…"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
  | timed out              | no `request` within 10 s (SP-6)                         | "Close this window and try again from the game."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | choose a wallet        | a valid request, its notice found, wallets announced    | heading "Link a wallet to your game session"; "Your wallet will ask you to sign this text:" then the notice's text, exactly, as text (marked "Pending legal review" while `pending`); "This link lasts until <expiry>." with the expiry as a date and time in the browser's locale and time zone (`Intl.DateTimeFormat`, date and time styles `long` and `short`), since the wallet shows raw unix seconds; "Your wallet may show a network name: nothing is sent to any chain, and no transaction is made."; "Choose your wallet:" and one button per wallet, by its announced name |
  | waiting for the wallet | a wallet was picked                                     | the same content with every button disabled, and "Confirm in your wallet…"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
  | finishing              | the wallet answered; the revoke, then the answer (SP-9) | "Finishing…"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

  Discovery (the 1 s wait of SP-8) shows "Looking for your browser wallet…". An
  answer posted with no wallet asked (`invalid-request`, `unknown-notice`,
  `no-wallet`) shows "Finishing…" too, as every answer does once it is sent. The
  look follows the Wrapper's one dark theme (its page, surface, text, label, and
  accent colors, W-47) until a designed page replaces it (se-client-kit#256, a
  follow-up change). This spec gives behavior, texts, and accessibility, not a
  visual design.

- **SP-11. Accessibility.** WCAG 2.2 level AA, as the Wrapper's own UI (W-45 to
  W-47): the page's `lang` is `en`; each state's heading is announced through a
  polite live region, and the focus moves to it on each state change, since
  every change follows the player's own action or the page's own load; the
  wallet buttons are native buttons, operable by keyboard, with a visible focus
  indicator and at least 24 by 24 CSS pixels; disabled buttons carry `disabled`,
  and the "waiting for the wallet" text is in the live region; the notice block
  is readable at 200 % zoom without loss of content; text contrast at least
  4.5:1; no motion beyond what `prefers-reduced-motion` allows. An axe audit of
  every state passes (T-47, T-50).

### What it keeps, and its headers (SP-12, SP-13)

- **SP-12. It keeps and sends nothing.** No `localStorage`, `sessionStorage`,
  IndexedDB, Cache Storage, cookie, or service worker; no log (no `console` call
  at all); no telemetry. Its one request is its configuration document, on its
  own origin. The wallet talks to its own extension, not over the page's
  network. The only data it posts is W-67's `ready`, `result`, and `failed`, to
  the fixed Wrapper origin.
- **SP-13. Headers, and no API on its site.**
  - **Content Security Policy:**
    `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'`.
    `connect-src 'self'` is for one request, its configuration document;
    `frame-ancestors 'none'`: no page can frame it and lay a decoy over the
    wallet's buttons; no `img-src` (no icon, SP-8). The page also carries the
    environment-independent part in a `<meta>` element (without
    `frame-ancestors`, which a `<meta>` cannot carry), so it holds where a
    header is missing.
  - **No `Cross-Origin-Opener-Policy` header**, on purpose: its own would cut
    its opener, as the operator's does (W-49g). The release build refuses a COOP
    header in the page's rule (T-49).
  - `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, the
    Wrapper's own `Permissions-Policy` (read from its `headers.json` `/*` rule,
    so the two cannot drift), and the Wrapper's
    `Strict-Transport-Security: max-age=31536000`.
  - **No API on its site** (ADR-012): the site gets no `_worker.js`,
    `_routes.json`, or `_redirects`, and the deploy refuses an artifact that
    holds one, as it does for the game's site. So `'self'` reaches nothing but
    the page's static files and its configuration document. Navigations are not
    limited by CSP (RFC-006, Residual risk).

### Build, release, and deploy (SP-14, SP-15)

- **SP-14. Build and release.** The page ships **inside** the Wrapper's release
  artifact, under `signer/`, as the verify page does under `verify/` (V-16), so
  one digest and one attestation cover all three. Its Vite build has the base
  `/signer/`, so its files are referenced under `/signer/`. The Wrapper's
  release build copies it into its output with the same rules
  (`release-signer.ts`, beside `release-verify.ts`): SRI on its `<script src>`
  and `<link href>`, which must lie under `signer/`; its files in
  `integrity-manifest.json`; the same file-type allow-list, with
  `signer/index.html` as a third allowed HTML file; no symbolic link or stray
  file; and a `headers.json` rule for `/signer/*` holding SP-13's headers. The
  release dry run builds it in both copies and the digests must match. **Its own
  size budget:** its bytes do not count toward the Wrapper's or the verify
  page's, and it has two measurements of its own, "signer output" (every file
  under `signer/`, uncompressed) and "signer page, gzip" (`signer/index.html`
  and every `.js` and `.css` file under `signer/`, each gzipped at zlib's
  default level and summed), checked by `pnpm check:size-budget`, the release
  dry run, and the publish step, with the Wrapper's rules (a missing measurement
  fails). Their limits are set by the human from the first build's measurement,
  about 25 % over it, as for the verify page
  ([Testing and CI](./client-kit/testing-and-ci.md)). The first build, on
  2026-11-21, measured 62565 and 23469 bytes; the limits set from it are 78848
  and 29696 bytes (approved by the human, 2026-11-21; written here, in
  [Testing and CI](./client-kit/testing-and-ci.md), and in
  `tools/size-budget.ts` together).
- **SP-15. The deploy.** Each environment's signing page site is laid out by the
  Pages deploy from the attested artifact, unchanged: the artifact's `signer/`
  directory at `/signer/`, plus a copy of its `index.html` at the root (Pages
  serves the root page for every path that is not a file), its
  `environment-config.json` at the root, and its `_headers` (`/*` gets the
  `/signer/*` rule's headers). The Wrapper opens the root,
  `<signingPageOrigin>/` (W-66). **The Wrapper's site never serves `signer/`:**
  the deploy leaves the directory out of the Wrapper's site, and of the
  verifier's, and refuses an upload of either that holds it, or the Wrapper's
  origin would serve the wallet page. **The two documents go together:** the
  layout step fails the deploy job, before any upload, when the Wrapper's
  document names a `signingPageOrigin` and the configuration job made no signing
  page document, or when there is a signing page document and the Wrapper's
  document names no `signingPageOrigin` (decided by the human, 2026-11-21), so a
  deploy never offers a delegation with no signing page behind it, nor deploys a
  signing page no Wrapper opens.
  - **One input for both documents.** The Pages configuration job builds the
    Wrapper's `signingPageOrigin` and `acceptPendingNotices`, and the signing
    page's whole document, from one set of inputs, as it builds the sites'
    policies from the Wrapper's document, so they cannot disagree:
    `signingPageOrigin` and the signing page's own origin are
    `PAGES_SIGNER_ORIGIN`; the signing page's `wrapperOrigins` is the Wrapper's
    site's origin alone (`PAGES_WRAPPER_ORIGIN`; the verifier never opens it);
    both documents carry `acceptPendingNotices: true` when
    `PAGES_ACCEPT_PENDING_NOTICES` is `true`, and no such field when it is unset
    (absent reads as `false`; the job writes an optional field only when it
    holds something, as it does `earlierPins` and `autoplay`); the signing
    page's `environment` is `PAGES_CHAIN_PINS`' `environment`. Without
    `PAGES_SIGNER_ORIGIN` the job writes no `signingPageOrigin`, no
    `acceptPendingNotices`, and no signing page document, and the deploy uploads
    no signing page site: the environment offers no delegation (W-62). The job
    validates the signing page's document with the page's own validator
    (`apps/signing-page/config-check-cli.ts`, run on the written document, since
    no app may import the page), as it validates the others
    ([The Pages sites' configuration](./client-kit.md#the-pages-sites-configuration)).
  - **Deployed and rolled back together.** The signing page's site is uploaded
    in the same deploy job as the Wrapper's, from the same artifact, and a
    rollback of one is a rollback of both to the same release (the release
    runbook). A per-project Pages rollback must not leave a Wrapper whose
    `signingPageOrigin` names a signing page of another release, nor take the
    Wrapper or the verify page below the release that accepts the backend's
    key-delegation additions while the backend emits them (RFC-006, the
    kit-first rule).

## Errors and edge cases

| Case                                                                                     | Behavior                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Opened with no opener (operator COOP `same-origin`, opened by hand)                      | The lost-connection state; nothing else (SP-4)                                                    |
| Its configuration is missing, not JSON, or refused                                       | The configuration error state; no `ready` (SP-3); the Wrapper times out (W-66)                    |
| A message from another source, another origin, or not a well-formed `request`            | Ignored, never answered (SP-6)                                                                    |
| A second `request`                                                                       | Ignored (SP-6)                                                                                    |
| No `request` within 10 s                                                                 | The timed-out state (SP-6)                                                                        |
| A notice id that is unknown, `retired`, or `pending` without the flag                    | `failed` `unknown-notice`, no wallet asked (SP-7)                                                 |
| No wallet announced within 1 s                                                           | `failed` `no-wallet` (SP-8)                                                                       |
| The player rejects in the wallet                                                         | Revoke, then `failed` `rejected` (SP-9)                                                           |
| The wallet answers an error, or a value that is not a 65-byte hex signature              | Revoke, then `failed` `wallet-error` (SP-9)                                                       |
| `wallet_revokePermissions` is not supported (4200), fails, or does not answer within 3 s | Ignored; the answer goes out (SP-9)                                                               |
| The player closes the window first                                                       | Nothing is posted; the Wrapper sees `closed` and the state is `declined` (W-66)                   |
| The wallet signs with a contract wallet, or another account than the one it connected    | The page posts it; the shell's recovery does not give `wallet`, so it is `wallet-mismatch` (W-68) |

## Security

- **What it protects.** The Wrapper's origin never holds a wallet connection, so
  no standing grant exists that code on the Wrapper's origin could use without a
  prompt; the signing page holds its own connection only for the signature and
  then revokes it, best effort (ADR-012).
- **What it does not protect** (RFC-006, Residual risk; ADR-012, Security
  reasoning): a compromised Wrapper can still ask the wallet for a connection of
  its own (wallets inject into the Wrapper's document too), with the Wrapper's
  origin in the wallet's prompt; extensions run with the page's power; a
  compromised signing page is not bound by the wallet port and can ask the
  wallet for anything it supports (the wallet prompts for each, showing the
  signing page's origin); it can navigate itself, or the Wrapper's frame while
  it holds the opener, to carry out what it holds (the action key's address, the
  session id, the expiry, the wallet's address, and the signature: none of them
  signs or spends); and a delegation does not prove where it was signed (the
  domain is chainless and names no origin, and the notice text is public). The
  answer's order (revoke, answer, drop the opener, close the window, with the
  Wrapper's close as the fallback) narrows the window in which the page holds
  the Wrapper's frame.
- **No secret reaches it.** No key, token, launch code, round id, or amount is
  ever posted to it (W-67).

## Observability

None. The page logs nothing and emits no telemetry (SP-12). Support works from
the Wrapper's states (W-69) and the round's evidence.

## Test plan

Rows T-47 (the page's unit and component tests, its validator included), T-48
(the configuration job), T-49 (the release and the deploy), and T-50 (the
browser flow, with the page served under its real headers) of the
[Wrapper's test plan](./wrapper.md#test-plan). No real wallet and no real
network: the wallet is a stub provider announced through EIP-6963.

## References

- [The wallet delegation](./wrapper/the-wallet-delegation.md) (W-62 to W-73),
  [Operator embedding](./wrapper/operator-embedding.md) (W-49b, W-49g),
  [Configuration](./wrapper.md#configuration),
  [The cryptography](./client-kit/the-cryptography.md) (`KeyDelegation`),
  [client-kit.md](./client-kit.md) (the Pages sites, the release artifact).
- [RFC-006](../rfcs/archived/RFC-006-wallet-delegated-action-key.md) (archived),
  [ADR-012](../decisions/ADR-012-the-signing-page-on-its-own-origin.md),
  [ADR-007](../decisions/ADR-007-no-public-suffix-list.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md).
- Backend-owned contract, by name: `key-delegation/v1` (its notices and their
  vectors). EIP-712, EIP-1193, EIP-6963; the HTML standard's `window.open`,
  `Cross-Origin-Opener-Policy`, and `postMessage`.
