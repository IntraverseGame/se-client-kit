# RFC-006 — The wallet-delegated action key

- Status: draft
- Author: the documenter agent, for human review
- Created: 2026-11-17
- Relates to: se-client-kit#220 (the kit's part of se-backend#88); W-9, W-11,
  and W-12 of
  [the action key](../../specs/wrapper/the-action-key-and-what-may-be-stored.md);
  W-21, W-22, and W-26 of
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md); W-37
  and [ADR-007](../../decisions/ADR-007-no-public-suffix-list.md) (the
  registrable-domain comparison); W-49b and W-49g of
  [operator embedding](../../specs/wrapper/operator-embedding.md); the Wrapper's
  [scope](../../specs/wrapper.md#scope),
  [boundary](../../specs/wrapper.md#boundary), and
  [configuration](../../specs/wrapper.md#configuration); V-3, V-10, V-12, V-16,
  and V-17 of [the verify page](../../specs/verify-page.md);
  [ADR-012](../../decisions/ADR-012-the-signing-page-on-its-own-origin.md) (the
  signing page on its own origin);
  [ADR-009](../../decisions/ADR-009-production-pages-deploy-trigger-and-source.md)
  (what production deploys);
  [ADR-001](../../decisions/ADR-001-toolchain-and-signing.md) (no new runtime
  dependency)

This RFC brings the wallet-delegated action key into the Wrapper's scope. A
player who opts in signs, once per session and with their browser wallet, a
`KeyDelegation`: a statement that the shell's own action key acts for that
wallet in this session. The kit sends it with every start. The design was
decided by the human on 2026-11-17 (#220's Design section, and the further
points in [Decisions](#decisions-2026-11-17)); this RFC records it, with the
spike's evidence and the slices that build it. Every question this draft raised
was answered by the code owner the same day (Q1 to Q8 and Q-a to Q-e in
[Decisions](#decisions-2026-11-17)); none is open.

A player-supplied key (a key the player imports) stays out of scope.

**Status** (Q-a). This RFC stays `draft` and ADR-012 stays `proposed` until the
human accepts them. Every spec line and `AGENTS.md` rule that relies on them
says so: "(proposed, RFC-006)" or "(proposed, ADR-012)".

**Where the rules live.** The spec edits of slice S0 are small: the Wrapper's
scope and boundary, W-9, W-11, W-12, the dispatch rule of W-49b, the operator's
opener policy (W-49g), the apps list and dependency direction of the client-kit
spec, and the lists of contracts the kit may copy, in the specs and in
`AGENTS.md` (Q3). The detailed rules (the consent flow, `se.delegation/1`, the
wallet port, the signing page) stay in this RFC until the slices that build them
write them into the specs: S5 and S6 into the Wrapper spec (new rules from W-62,
tests from T-37 once S1's T-36 is merged), and S6b into a new
`specs/signing-page.md`.

## Problem

- The shell makes a fresh action key for every session (W-9), and nothing ties
  that key to the player. The backend now accepts, on a start, an optional
  statement signed by the player's wallet that the session's action key acts for
  it (se-backend#88). The round's evidence then names the wallet
  (`FairnessContext.keyDelegation`), and the verify page can check it.
- The kit has none of it: no `KeyDelegation` type, no wallet code, no consent
  screen. Until this change the Wrapper spec put wallet-delegated keys out of
  scope (its Scope and W-9).
- A wallet cannot simply be added to the Wrapper. The Wrapper's origin holds the
  player's key and token (W-10, W-11). A wallet connection is a standing grant
  to an origin: until it is revoked, any script on that origin can read the
  account without a prompt and ask for signatures. The Wrapper also runs in the
  operator's iframe, where opening a window and keeping a link to it depend on
  the operator page's headers.

## Motivation

- Opt-in. A player without a wallet, or who declines, plays exactly as today, on
  the shell's key.
- The delegation is evidence that this wallet signed for this key, carried by
  every round the player starts in the session and checkable on the verify page
  (what it does not prove: [Residual risk](#residual-risk)).
- The code that talks to a wallet is small, public, on its own origin, and can
  ask the wallet for one kind of signature only.

## Proposed solution

### 1. What the player signs

The contract is the backend's published `key-delegation/v1`, vendored in S2.
This RFC cites its values; it does not redefine them.

- **Type.**
  `KeyDelegation(string notice,address actionKey,bytes32 sessionId,uint64 expiry)`,
  type hash
  `0x3f61f038833be2c4a751a98b54b11d874f7683ea8d0c052705a241abd33c0daf`.
- **Domain.** `EIP712Domain(string name,string version)` =
  `{ name: "SuperEngine KeyDelegation", version: "1" }`, domain separator
  `0xdf1a3469adcdcfcc9f3bbd698fd36df7cee6c4dddad538d44b80ab537d6fdabf`. No
  `chainId` and no `verifyingContract`, so the player never switches networks
  (the spike: a wallet refuses a domain whose `chainId` is not its active one).
  Both values were recomputed in this repository from the type string and the
  domain, with the `@noble/hashes` that `signing` uses, on 2026-11-17, and
  match.
- **Fields.**
  - `notice`: the notice's text, picked by `id` from the kit's copy of the
    notices list (below).
  - `actionKey`: the shell's action key's address (W-9).
  - `sessionId`: the session id's 16 raw bytes, left-aligned in 32 bytes and
    zero-padded. The redeem's `sessionId` is `ses_` and 32 hex digits (the
    vendored Play API document), so the shell takes it from the redeem, never
    from the Snapshot's `context.sessionId`, whose pattern is wider. S2's
    vectors pin the exact bytes.
  - `expiry`: `floor(sessionExpiresAt)` in unix seconds: the session's hard end,
    which no token outlives (W-2), so a delegation lasts exactly the session.
- **Signature.** 65 bytes `r ‖ s ‖ v`, low `s`, `v` 27 or 28, from an ordinary
  account (EOA) only: a contract wallet's signature does not recover to it and
  is refused. The shell normalizes the wallet's signature, and only that one:
  `v` 0 or 1 to 27 or 28, and a high `s` to `n − s` with `v` flipped, before it
  checks or sends it. `signing`'s strict recovery (65 bytes, low `s`, `v` 27 or
  28, no zero address) stays unchanged for every other signature it checks
  (W-21, W-26, the verify page's check 3 of V-12).
- **Hex on the wire.** The backend publishes every hex value of a delegation as
  `0x` and lowercase hex, whatever case the request used; `wallet` and
  `actionKey` carry no EIP-55 checksum.
- **On the start.** An optional `StartRoundRequest.keyDelegation`:
  `{ wallet, expiry, noticeHash, signature }` (S4). The backend checks it while
  it accepts the start, before any round exists: 422 `KEY_DELEGATION_INVALID`,
  `KEY_DELEGATION_EXPIRED`, or `KEY_DELEGATION_NOTICE_UNKNOWN`, and 409
  `CONFLICT` when one `idempotencyKey` comes with a different delegation.
- **In the evidence.** The Snapshot's `FairnessContext.keyDelegation`
  (`proofs.keyDelegation`); the evidence carries `acceptedAt`, `noticeHash`, and
  the notice's canonical text. The verify API adds
  `RoundVerification.keyDelegation` and a `key_delegation` check (S7).

**Notices.**

- One append-only list, published by the backend in its contracts manifest as
  `key-delegation/v1 notices` (its test vectors as `key-delegation/v1 vectors`):
  entries `{ id, text, keccak256, status }`, `status` `pending`, `approved`, or
  `retired` (kept for old evidence, never offered or accepted for a new start).
  The three statuses are the backend's published contract; `retired` was added
  to it on 2026-11-17. The kit vendors the same bytes (S2), on `contracts`'
  runtime entry: the shell and the signing page read them there (Q2). English
  only in the first increment, each notice one plain paragraph.
- The first entry is `en-draft-1`, status `pending`. Its text is not copied
  here: it may still change, and S2 vendors the bytes.
- Production accepts only `approved` notices (the backend), so a production
  build offers delegation only once its copy holds one. The production wording
  waits for se-backend#56.
- The signing page signs only a notice it picks by `id` from its own copy, never
  text the Wrapper sends.

### 2. The flow

1. The bar's menu offers the entry (section 7's conditions).
2. The consent dialog explains the delegation in the player's language and shows
   the exact English text that will be signed. The player confirms.
3. In that click handler, synchronously, the Wrapper opens the signing page as a
   popup (section 3).
4. The signing page loads and checks `window.opener`. It posts `ready`; the
   Wrapper answers with `request` (section 4).
5. The signing page finds the notice by `id`, discovers the wallets (EIP-6963),
   lets the player pick one, connects, and asks it to sign (section 6).
6. It revokes the connection, best effort, waiting at most about 3 s, then posts
   `result { wallet, signature }` (or `failed { reason }`) and drops its
   `window.opener`. The Wrapper closes the window when the answer arrives.
7. The shell normalizes the signature, recovers the signer, and compares it with
   `wallet`. On a match the delegation is registered, in memory only, and every
   later start of the session carries it.
8. A start answered 422 `KEY_DELEGATION_*` started nothing. The Wrapper tells
   the player and offers to sign again or to continue without; it never drops
   the delegation silently. Any other refusal of a delegated start is handled as
   section 7 says.
9. At the W-26 point, the shell checks that the round's evidence carries the
   delegation it sent (the delegation check, section 7, Q-d). It sits beside the
   tip check and follows W-26's `T_0` rule: the shell signs `PlayerCancel` only
   once `T_0` is settled, and nothing at all when one of checks 1 to 5 failed.

### 3. Opening the signing window

- **Under the click.** The Wrapper calls `window.open(url, "_blank", "popup,…")`
  synchronously in the confirm click handler of the consent dialog, with no
  `await` before it, so it runs under the click's transient user activation. The
  window is unnamed, so the operator page cannot reach it by name. The Wrapper
  keeps the returned handle (no `noopener`).
- **`null` is blocked.** A `null` return is treated as a blocked window, whether
  a popup blocker or the opener policy below caused it. The Wrapper tells the
  player the signing window could not connect (and to close it if it opened),
  and play goes on undelegated.
- **The orphaned window.** When the operator page sends
  `Cross-Origin-Opener-Policy: same-origin`, `window.open` returns `null`, yet
  the window still opens, with `window.opener === null` (the spike). So the
  signing page checks `window.opener` at load. When it is missing, the page
  shows "This window lost its connection to the game. Close it." and does
  nothing else: no wallet discovery, no connection, no signature.
- **The operator's opener policy.** The page that embeds the Wrapper must not
  send COOP `same-origin`; `same-origin-allow-popups`, or no such header, is
  fine (W-49g, in the operator guidance too). The guidance already asks for no
  `sandbox` on the Wrapper's iframe; the spike shows why: a sandbox without
  `allow-popups` blocks the window.
- **The two SE pages.** The signing page sends no COOP (ADR-012): its own would
  cut its opener the same way. The Wrapper sends none today; it is the top page
  on a standalone launch, so it must never send `same-origin` either (proposed:
  S6's header check refuses it).
- **Nothing in the URL.** The popup's URL is the signing page's address with no
  query and no fragment. The signing page never reads its URL's parameters or
  fragment (section 5). The spike passed the Wrapper's origin in the fragment;
  the design does not.
- **The wait for `ready`** (Q6). The Wrapper waits 10 s for `ready` after the
  window opens, the same as the operator handshake (W-49c). With no `ready` in
  time, it says the signing window could not connect, and play goes on
  undelegated.
- **A window the player closes** before it answers is `declined`: no error, and
  the menu entry stays available (Q6). The Wrapper sees it by polling its
  handle's `closed`.
- **The answer's timing.** The signing page revokes its connection before it
  answers (section 6), so the answer can arrive up to about 3 s after the player
  signs. The 10 s wait above is not affected: it ends at `ready`, before any
  signing.
- **The Wrapper closes the window** when the answer (`result` or `failed`)
  arrives, which also ends the window's reference to the Wrapper's frame
  (Residual risk).
- **Proposed for S5 and S6.** One window at a time: while one is open, the entry
  focuses it rather than opening another.

### 4. `se.delegation/1`

A closed protocol of its own, beside `se.operator/1` and `se.controller/1`.

| Direction               | `type`    | Fields                                                           | Meaning                                    |
| ----------------------- | --------- | ---------------------------------------------------------------- | ------------------------------------------ |
| signing page to Wrapper | `ready`   | `schema`, `type`                                                 | the page loaded with an opener and listens |
| Wrapper to signing page | `request` | `schema`, `type`, `actionKey`, `sessionId`, `expiry`, `noticeId` | what to sign                               |
| signing page to Wrapper | `result`  | `schema`, `type`, `wallet`, `signature`                          | the wallet's signature                     |
| signing page to Wrapper | `failed`  | `schema`, `type`, `reason`                                       | no signature; `reason` from a closed list  |

- **Message rules**, as for the other two protocols: a plain object with exactly
  its fields; anything else is ignored and never answered. The message set and
  fields are frozen within `/1`.
- **The signing page's checks.** It takes the allowed Wrapper origins from its
  own environment configuration. It posts `ready` to `window.opener` once for
  each origin on that list, each time with that origin as `targetOrigin` (never
  `"*"`): the browser drops every copy whose origin is not the opener's. It
  accepts a message only when `event.source === window.opener` and
  `event.origin` is on the list, fixes that origin for the page's life, and
  posts `result` or `failed` only to it. It takes one `request`; later ones are
  ignored.
- **The page's own wait.** With no `request` within 10 s of `ready`, the page
  stops waiting and shows "Close this window and try again from the game." This
  also covers a popup the player reloaded: the Wrapper sends its one `request`
  only once.
- **Input only by message.** The signing page takes its request only by
  `postMessage` from an allowed Wrapper origin. It never reads anything from its
  URL's parameters or fragment, or from storage; its one fetch is its own
  configuration document (section 5).
- **The order of its answer.** The page revokes first (best effort, at most
  about 3 s, section 6), then posts `result` or `failed`, then sets
  `window.opener = null`, so it holds no reference to the Wrapper's frame from
  then on (Residual risk).
- **The Wrapper's checks.** It accepts a message only when `event.source` is the
  popup's handle and `event.origin` equals `signingPageOrigin` (its environment
  configuration, exact match). It posts `request` only to that handle, with
  `targetOrigin` `signingPageOrigin`, once, after the first valid `ready`.
- **Same-window messages are ignored.** The Wrapper's one `message` listener
  routes by `event.source` before anything parses (W-49b); the popup's handle
  becomes a third route, beside the operator page and the game frame, and
  anything else is dropped. Wallet extensions inject into the Wrapper's iframe
  too (MetaMask and Rabby in the spike), and their content scripts'
  `window.postMessage` traffic reaches the listener with
  `event.source === window`: it is dropped, framed or not. W-49b now says so; it
  is today's behavior. Today's tests cover it in general
  (`apps/wrapper/src/message-dispatch.test.ts`: "routes the parent to the
  operator and the frame to the game, nothing else" drops any other source, and
  "has no operator route on a standalone page" drops the page's own); S5 adds an
  explicit case for the page's own window on a framed page.
- **The shell checks the answer itself.** A `result` is never trusted for where
  it came from: the shell normalizes `v` and `s`, recovers the signer from the
  digest it computed, and compares it with `wallet` before it uses the
  delegation.
- **Shapes (proposed for S5 and S6b).** `actionKey` and `wallet`: `0x` and 40
  hex digits, never the zero address; `sessionId`: the redeem's string;
  `expiry`: a safe integer; `noticeId`: a string; `signature`: `0x` and 130 hex
  digits; `reason`: one of `no-wallet`, `rejected` (the player refused in the
  wallet), `unknown-notice`, `invalid-request`, and `wallet-error`. The Wrapper
  shows each as a player label, never the wallet's own message.
- **What crosses.** The action key's address, the session id, the expiry, the
  notice id, the wallet's address, and the signature, between two SE origins
  only. Never the private key (W-10), the play token, or the launch code, and no
  money.
- **The game never reaches it.** No `se.controller/1` message opens the dialog
  or the window, and the game frame is not a route of this channel.

### 5. The signing page (ADR-012)

- **The app.** `apps/signing-page`, private, its source public in this
  repository, served from its own origin, opened only as the Wrapper's popup.
- **Its origin** (Q-e). On a different registrable domain from the Wrapper's, by
  the same comparison as W-37 (the last two labels, ADR-007). The reason is site
  isolation: in a browser with site isolation (desktop Chrome and Firefox),
  another site runs in another process, so the popup, and the wallet code in it,
  stay out of the process that holds the action key. The guarantee that holds
  everywhere is the same-origin policy: another origin's memory is not readable.
  The separate process is defense in depth; Safari is untested. This replaces
  the same-site allowance an earlier draft proposed.
- **Dependencies** (Q2). `signing` at run time, for the exact typed data the
  shell verifies, and `contracts`' runtime entry, for its copy of the notices,
  as the `verify` app takes it; no third-party runtime dependency (ADR-001).
- **Release** (Q5). The same release, SRI, and attestation pipeline as the
  Wrapper and the verify page: it ships inside the Wrapper's release artifact,
  under a directory of its own, as the verify page does (V-16), so one digest
  and one attestation cover all three. The Wrapper's site must not serve that
  directory, or the Wrapper's origin would serve the wallet page: the deploy
  lays out the signing page's site from it and leaves it out of the Wrapper's,
  and a check refuses it there (S6b).
- **Headers** (Q1). A Content Security Policy with `connect-src 'self'` and
  `frame-ancestors 'none'` (the rest proposed as the Wrapper's own policy:
  `default-src 'none'`, `'self'` scripts and styles, `base-uri`, `form-action`,
  and `object-src` `'none'`, Trusted Types required); no COOP header;
  `Referrer-Policy: no-referrer`. Why `'self'`: the page fetches its own
  `environment-config.json`, written next to it by the deploy, so one attested
  build serves every environment, like the Wrapper and the verify page (V-17).
  `'none'` would mean writing the configuration into the attested page, or a
  build per environment.
- **No API on its site** (ADR-012). The site gets no `_worker.js`,
  `_routes.json`, or `_redirects`, and the deploy refuses an artifact that holds
  one, as it does for the game's site. So `'self'` reaches nothing but the
  page's static files and its configuration document. What this contains: no
  request from the page's scripts can reach another origin. Navigations are not
  limited by CSP.
- **Configuration** (Q4). Its own document: `environment`, the list of Wrapper
  origins it serves, and the same pending-notice flag as the Wrapper's, under
  the Wrapper's rule: its validator refuses the flag with
  `environment: "production"`, so it never signs a `pending` notice in
  production. The Wrapper's gains `signingPageOrigin`. Infrastructure adds a
  Pages project and a custom domain per environment.
  <!-- TODO(infra, #220): owner: infrastructure owner. The signing page's Pages project and custom domain for staging and for production; its origins are configuration values (the Wrapper's `signingPageOrigin`, the signing page's list of Wrapper origins), set by the infrastructure owner and never written in this repository. -->
- **One input for both documents.** The Wrapper's `signingPageOrigin`, the
  signing page's list of Wrapper origins, and both pending flags are built from
  one input by the Pages configuration job, as it already builds the sites'
  policies from the Wrapper's document, so the two cannot disagree. The two
  sites deploy together and roll back together.
- **It keeps and sends nothing.** No storage, cookie, or service worker; no log;
  no telemetry. Its one request is its configuration document, on its own
  origin. The wallet talks to its own extension, not over the page's network.
- **The notice it signs.** Only one its copy holds, by `id`: `approved`, or
  `pending` where its own flag allows it; any other `id` is `unknown-notice`.
- **States (proposed for S6b).** Lost connection (no opener); waiting for the
  game (10 s, section 4); choose a wallet; waiting for the wallet; finishing
  (the revoke, up to about 3 s). Every outcome that answers the Wrapper (a
  signature, a refusal, no browser wallet found, an error) ends with the Wrapper
  closing the window and telling the player, so the page has no "you can close
  this window" state.
- **It shows what will be signed** before it asks the wallet: the notice and the
  expiry as a date and time the player can read (the wallet shows raw unix
  seconds, below).

### 6. The wallet port

The only code in the kit that calls a wallet provider, in the signing page only.
The Wrapper has no wallet code.

- **Allow-list.**
  - `eth_requestAccounts`.
  - `eth_signTypedData_v4`, only as `[connected account, typed data]`: the
    account is the one `eth_requestAccounts` returned, and the typed data is
    `KeyDelegation` as primary type, exactly the chainless domain, and exactly
    the four-field type, built by `signing` and compared before the call.
  - `wallet_revokePermissions`, only with `[{ eth_accounts: {} }]`.
  - Anything else throws before it reaches the provider.
- **The test.** A stub provider records zero calls for `eth_sendTransaction`,
  `personal_sign`, `eth_sign`, `eth_signTypedData_v3`,
  `wallet_switchEthereumChain`, `eth_accounts`, and an `eth_signTypedData_v4`
  call with another type or another domain.
- **Discovery.** EIP-6963 only (`eip6963:requestProvider`,
  `eip6963:announceProvider`), with no `window.ethereum` fallback. Announcements
  are de-duplicated by `info.uuid`: wallets announce on load and again on each
  request (the spike listed four entries for two wallets). None found: "No
  browser wallet found". Several: the player picks one by its announced name
  (whether to show the announced icon, which needs `img-src data:`, is S6b's).
- **One request at a time.** The page disables the wallet buttons while a
  request is pending: a second click got MetaMask's -32002 ("Request of type
  'wallet_requestPermissions' already pending").
- **Revoke first, best effort.** Once the wallet has answered, and before the
  page posts its own answer, it calls `wallet_revokePermissions` and waits for
  it at most about 3 s; error 4200 (method not supported), any other failure,
  and a timeout are ignored. Then it answers the Wrapper and drops its opener
  (section 4). The kit cannot guarantee that a wallet forgets the page's
  connection.

### 7. The consent flow in the Wrapper

- **The menu entry** is offered only when all of these hold:
  - no round is open;
  - the game is not a book game (the latest Snapshot is not `playback`, the test
    autoplay's `not-book` uses): the backend refuses a book start with a
    delegation until se-backend#73;
  - `matchMedia("(pointer: fine)")` and `matchMedia("(hover: hover)")` match;
  - an accepted notice exists for the build: `approved`, or `pending` where the
    environment allows it (below).
- **Which notice** (Q7). The most recent `approved` notice (the last in the
  append-only list's order). A `pending` one only when none is approved and the
  environment's pending flag allows it; never a `retired` one. The shell reads
  the notices, their status and their `keccak256` (the delegation's
  `noticeHash`), from `contracts`' runtime entry (Q2).
- **The consent dialog** explains, in the player's language (W-48), what the
  player signs and what it allows, and shows the exact English notice text that
  will be signed. While the notice is `pending` it is marked "pending legal
  review" (se-backend#56 tracks the review).
- **Pending notices.** A per-environment configuration flag lets the build offer
  a `pending` notice (its name is S6's). The Wrapper's configuration validator
  refuses it with `environment: "production"`.
- **`signingPageOrigin`.** An optional field of the Wrapper's configuration;
  without it no entry is offered (fail closed). It is an origin on a different
  registrable domain from the Wrapper's (Q-e, section 5), which the validator
  checks as W-37 does, and never the verify page's origin (`verifyBaseUrl`'s
  origin), as ADR-012's Decision 2 says; proposed: never an operator or game
  origin either.
- **The key (W-9).** The shell generates the action key at session open, once it
  holds the signer lock, or when the player chooses to delegate, so its address
  exists before the delegation is signed and before the first start.
- **Memory only (W-11).** The delegation, the wallet's address, and the
  signature live in the shell's memory for the session. Nothing is stored; the
  player signs again in each session.
- **The shell's states** (S5): `offered`, `signing`, `registered`, `declined`,
  and `failed` (with the reason). A window closed before it answers is
  `declined`; no `ready` within 10 s is `failed` (section 3).
- **Every start carries it**, W-22's resend included: the resend repeats the
  same body, so the kit never causes a 409 `CONFLICT`.
- **On 422 `KEY_DELEGATION_*`**, the Wrapper tells the player and offers to sign
  again or to continue without; the choice is the player's, and the delegation
  is never dropped silently.
- **Any other refusal of a delegated start**, such as a schema error from a
  backend that does not take the field yet, is shown as that refusal is today
  (W-42), with "continue without" offered beside it. The delegation is dropped
  only when the player chooses that, never silently.
- **The delegation check** (Q-d). At the W-26 point of a round, the shell
  compares the Snapshot's `proofs.keyDelegation` with the delegation it sent:
  `wallet`, `expiry`, `noticeHash`, `signature` (against the normalized
  signature the shell sent), the action key, and the session. When it is missing
  or differs, the round fails the delegation check. The check sits beside the
  tip check (W-26b) and follows W-26's `T_0` rule (decided):
  - **`T_0` settled** (checks 1 to 5 passed) and the delegation check failed:
    the shell signs `PlayerCancel` (W-25) once the round is `active`, as for a
    failed tip check.
  - **Before check 5 has run**, a delegation failure waits for it; if check 5
    then fails, the next branch applies.
  - **`T_0` not settled** (one of checks 1 to 5 failed): the shell signs nothing
    for the round, not even `PlayerCancel`, as W-26 and W-15 already say.
- **Its edge cases** (decided):
  - a round started without a delegation whose evidence carries one fails the
    delegation check too;
  - "missing" is judged once the Snapshot is `active`, as W-26's check 1 is;
  - a later read whose `proofs.keyDelegation` differs from the one checked is
    handled as W-26's re-issue rule: the shell signs nothing more for the round.
- **By value, not by string.** The compare is by value: `wallet`, `actionKey`,
  `noticeHash`, `signature`, and the session's `bytes32` compare as the bytes
  their hex decodes to, and `expiry` as an integer. The backend echoes every hex
  value in lowercase, and `wallet` and `actionKey` carry no EIP-55 checksum, so
  a string compare against a checksummed `wallet` would fail the check and
  cancel every delegated round.

### 8. The verify page (S7)

The page shows a round's `RoundVerification.keyDelegation` and recomputes its
check: the notice text's `keccak256` is `noticeHash`, and the signature recovers
to the wallet over the `KeyDelegation` digest of the round's action key, session
id, and expiry, as the vendored verify API document carries them. It looks the
notice up by `noticeHash` in the whole vendored list, `retired` entries included
(the evidence carries `noticeHash` and the text, but no id): a round delegated
under a notice that was later retired still verifies. Only the Wrapper and the
signing page filter by status, and they only ever offer an accepted notice (Q7).

- **A notice not in the vendored list** (Q-b), looked up by hash: the page still
  checks that the evidence's canonical text hashes to `noticeHash` and that the
  signature recovers to the wallet. Only whether it is a published notice is
  shown as "not checked"; that is never a V-7 mismatch. A newer list in the
  kit's next release then checks it in full.
- **Its place on the page.** A new check of V-12, with its display, written into
  the verify page's spec by S7.

### 9. What is stored, logged, and emitted

- Nothing is stored, on either origin.
- Nothing is logged with the wallet's address, the signature, or the session id;
  the shell's redacting logger stays the only way to log near them.
- No telemetry.

## Spike evidence

Run by hand for #220's spike task: a popup opened from the Wrapper's
cross-origin iframe inside an operator page.

- **Setups.** MetaMask 13.57.0 in Chrome for Testing 156; then a headed Chrome
  157 with MetaMask and Rabby Wallet (rdns `io.rabby`) both enabled.
- **Discovery.** EIP-6963 found both wallets in the popup. Both also inject into
  the cross-origin Wrapper iframe. Each wallet announced more than once, so the
  list held four entries for two wallets.
- **Signing.** The chainless domain signed with no chain warning, on both
  wallets. MetaMask signed while its active network was a network other than
  mainnet, and the signature still verified: a chainless domain works on any
  network. Every signature recovered to the wallet, with `v` 27 or 28 and low
  `s`; Rabby's under the pinned types and `en-draft-1`.
- **A domain with a `chainId` is refused** when it is not the active one:
  MetaMask with -32603 ("Provided chainId … must match the active chainId"),
  Rabby with -32602 ("chainId should be same as current chainId", for 11155111).
  This is why the domain is chainless.
- **Revoke.** `wallet_revokePermissions` is silent on both (Rabby returns
  `null`), and `eth_accounts` is empty afterwards.
- **Double click.** A second request while one was pending got MetaMask's
  -32002.
- **Opener policy and sandbox.** No COOP, and `same-origin-allow-popups`, work.
  COOP `same-origin` orphans the popup: in the headed run both wallets were
  listed and clickable in the orphaned window, which is why the page must check
  its opener first. A sandbox without `allow-popups` blocks the popup; a sandbox
  with `allow-popups` works, with or without `allow-popups-to-escape-sandbox`.
- **What MetaMask's prompt shows** (for the legal wording and the dialog): the
  notice first and in full; the expiry as raw unix seconds; the session id as
  full hex and the action key truncated; and "Network: Ethereum" in its header,
  though nothing touches a chain.
- **Not tested for the first increment:** Coinbase Wallet, Firefox, and Safari.
  The spike's popup page did not carry the signing page's final headers; S6b's
  browser test checks discovery under them.

## Alternatives

- **Wallet code in the Wrapper.** The key-holding origin would hold a standing
  wallet grant, and the Wrapper's bundle would carry wallet code. Rejected
  (ADR-012).
- **The signing page under a path of the Wrapper's origin, or on the same
  site.** A wallet's grant is per origin, so a path is the same as the Wrapper
  holding it; a same-site origin may share the Wrapper's process. Rejected
  (ADR-012, Q-e).
- **The signing page in a frame.** It would add a third level of framing under
  the operator page and depend on each wallet's handling of framed pages, which
  the spike did not test. Rejected (ADR-012).
- **A full-page redirect, or WalletConnect.** Navigating away ends the session
  (the key and token are in memory only); WalletConnect is out of the first
  increment.
- **A wallet library.** A new runtime dependency (ADR-001) for three calls the
  port can make itself.
- **A domain with a `chainId`.** Wallets refuse it unless the player switches
  networks (the spike).
- **Signing text the Wrapper sends.** The Wrapper could then make the player
  sign anything; the page signs only its own copy, by `id`.
- **Remembering the wallet across sessions.** Decided no: nothing about the
  player outlives a session (W-12), and the player signs again each session.

## Tradeoffs

- A third origin to host, configure, release, and monitor.
- A popup: blockers and the operator's opener policy can stop it. The player
  then plays on, undelegated, and is told why.
- A new integration rule for operators (W-49g).
- Desktop only: the entry needs a fine pointer and hover.
- One signature per session is friction, by design.
- The wallet's own prompt is not ours: MetaMask shows raw seconds and an
  "Ethereum" network for a statement that touches no chain. The consent dialog
  and the signing page have to say so before the wallet does.

### Residual risk

- **A compromised Wrapper can still ask the wallet.** Wallets inject their
  provider into the Wrapper's own document too, so code on the Wrapper's origin
  could ask the wallet for a connection of its own; the wallet's prompt would
  show the Wrapper's origin. This design guarantees only that no standing wallet
  grant exists for the Wrapper's origin to use silently: the Wrapper never
  connects, and the signing page revokes its own connection, best effort.
- **Extensions run with the page's power.** An extension that injects into the
  Wrapper's page could already read anything there; this design neither adds nor
  removes that.
- **The signing page's origin holds a grant** between the connection and the
  revoke, and longer if a wallet ignores the revoke. That origin serves only
  this page, whose code is public and attested.
- **The signing page can navigate the Wrapper's frame.** With no COOP and no
  `noopener`, a compromised signing page holds `window.opener`, the Wrapper's
  frame, and can navigate it (`window.opener.location`). That ends the session,
  and it can put a page of its own inside the operator's frame. CSP does not
  limit navigations. The decided order narrows the window: the page drops
  `window.opener` as soon as it has posted its answer, and the Wrapper closes
  the popup when the answer arrives (sections 3 and 4).
- **A delegation does not prove where it was signed.** The domain is chainless
  and names no origin, and the approved notice text is public, so any site can
  ask a player's wallet for a valid `KeyDelegation` for that site's own key. A
  delegation proves "this wallet signed for this key", not "this was signed on
  SE's signing page". The wallet's prompt shows the asking origin; the kit
  cannot prevent the request.

## Impact

- **In S0** (this change):
  - the Wrapper's scope, boundary, and traceability table; W-9, W-11, and W-12;
    W-49b's dispatch sentence; W-49g and the operator guidance;
  - the client-kit spec's apps list, the backend contracts it names, what it
    never holds, and its references; the dependency direction in
    [packages](../../specs/client-kit/packages.md); the runtime entry's
    consumers in
    [the `contracts` package](../../specs/client-kit/the-contracts-package.md);
    the contracts table in
    [how the kit gets its contracts](../../specs/client-kit/how-the-kit-gets-its-contracts.md);
    the specs' README;
  - `AGENTS.md` (Q3): `key-delegation/v1` in its two lists of copied contracts
    and in what the runtime entry holds, the `signing-page` app in its
    dependency direction, and the shell's `contracts` runtime entry from S5,
    each marked proposed;
  - the other copies of the dependency direction: `CONTRIBUTING.md`, the
    reviewer agent, and the add-a-package skill; the release runbook's "Copy
    only" list;
  - the architecture and overview memories, and the RFC and ADR indexes.
- **Specs, later**: S2 the contracts' sync; S3
  [the cryptography](../../specs/client-kit/the-cryptography.md); S4
  [the request layer](../../specs/client-kit/the-play-client-request-layer.md)
  and W-42's table; S5 [the shell](../../specs/client-kit/the-shell-package.md),
  W-25's closed list of cancel cases and W-26's "`T_0` settled" branch (the
  delegation check beside the tip check), W-49b's third route, and the
  configuration (`signingPageOrigin`, the pending flag, also validated by the
  verify page under V-3); S6
  [the single screen](../../specs/wrapper/the-single-screen.md) (the menu entry
  and the dialog), W-46 to W-48, and the release headers; S6b a new
  `specs/signing-page.md`, the release artifact and the Pages layout and headers
  in the client-kit spec, and the release runbook; S7
  [the verify page](../../specs/verify-page.md) (V-10's two named additions, and
  a new check of V-12 with its display).
- **Lint**: the import-direction rules and their fixture cases change with the
  code: S5 lets `shell` take `contracts`' runtime entry (today
  `tools/fixtures/import-direction-cases.ts` requires that import to fail), and
  S6b adds the `signing-page` app's entry.
- **Code**: a new app; in `apps/wrapper`, the menu entry, the dialog, the popup,
  the configuration fields, and the release build that carries the signing page;
  in `packages/shell`, the delegation use case, the delegation check, and the
  Wrapper side of `se.delegation/1`; in `signing`, the `KeyDelegation` typed
  data, recovery, and normalization; in `play-client`, the start's new field and
  codes; in `apps/verify`, the delegation's display and check.
- **Dependencies**: none new (ADR-001).
- **Size**: the dialog adds little to the Wrapper; the signing page ships in the
  Wrapper's artifact and gets its own size measurement, as the verify page has.
- **Telemetry**: none.
- **Tests expected** (no real wallet and no real network; the wallet is a stub
  provider):
  - S3: the type hash and domain separator; digest and recovery against S2's
    vectors; `v` and `s` normalization of the wallet's signature, and every
    other signature refused, as today, when it is not canonical.
  - S4: `keyDelegation` on a start; the three 422 codes and the 409 mapped; the
    fake Play API answers them.
  - S5: the delegation's states; `se.delegation/1`'s source and origin checks
    both ways; the page's own window dropped on a framed page; a `null` from
    `window.open` as blocked; the 10 s wait for `ready` and the polling of
    `closed`, on the injected clock as T-9a's case 4 does it; a window closed
    before it answers as `declined`, with the entry still offered; a recovered
    signer that is not `wallet` refused; the resend carrying the same
    delegation; the most recent `approved` notice chosen, never a `retired` one;
    the delegation check: with `T_0` settled, a missing or different
    `proofs.keyDelegation` (the signature included) signs `PlayerCancel`, and
    the cancel happens only once `T_0` is settled; a failure seen before check 5
    waits for it; with one of checks 1 to 5 failed nothing is signed, not even a
    cancel; a round started without a delegation whose evidence carries one
    fails; "missing" judged only once the Snapshot is `active`; a later read
    with a different `proofs.keyDelegation` signs nothing more; a checksummed
    `wallet` sent and echoed in lowercase passes; nothing stored.
  - S6: the entry's four conditions; the dialog's text and pending mark; the
    validator refusing the pending flag in production and a `signingPageOrigin`
    on the Wrapper's registrable domain; the 422 path (sign again, or continue
    without); another refusal of a delegated start offering "continue without";
    a11y.
  - S6b: the port's zero-call test (section 6); EIP-6963 only, de-duplicated by
    `uuid`; "No browser wallet found"; buttons disabled while pending; the
    missing-opener state doing nothing; `ready` per listed origin; no `request`
    within 10 s, on the injected clock; the revoke before the answer, given up
    after about 3 s on the injected clock, then `window.opener` dropped; a
    request from another source or origin ignored; nothing read from the URL;
    revoke failures ignored; its validator refusing the pending flag in
    production and a `pending` notice refused without the flag; the headers; the
    deploy refusing `_worker.js`, `_routes.json`, and `_redirects` on its site;
    the Wrapper's site not serving the signing page's directory.
  - S7 (or S2): the delegation shown and checked; a notice not in the vendored
    list checked for hash and signature with "not checked" for publication, and
    a retired one verified; `RoundVerification.keyDelegation` and the
    `key_delegation` check name accepted, and any other unknown field or check
    name refused (the kit-first rule below).

### Plan: the slices after S0

S1 is #220's browser token tests (T-36, committed on branch
`test/browser-token-lifecycle`, not yet merged); it is outside this RFC, and
this RFC's tests number from T-37 once it is merged.

- **S2.** Vendor `key-delegation/v1` (the notices on `contracts`' runtime entry,
  the vectors on its test-only entry), and the Play, Snapshot, and verify API
  documents that carry the new fields and codes. Waits for se-backend#88's
  contract.
- **S3.** `signing`: the `KeyDelegation` typed data, recovery, and normalization
  of the wallet's signature only.
- **S4.** `play-client`: `StartRoundRequest.keyDelegation`, and the new codes
  mapped in the Wrapper's errors.
- **S5.** The shell's delegation use case; the delegation check beside the tip
  check, under W-26's `T_0` rule and with its three edge cases (compared by
  bytes and integer, section 7), written into W-25's cancel cases and W-26's
  branch; and the Wrapper side of `se.delegation/1`.
- **S6.** The Wrapper's consent dialog and menu entry.
- **S6b.** The signing-page app, in the Wrapper's release artifact.
- **S7.** The verify page showing and checking `keyDelegation`.

**The kit-first rule** (Q8). The backend rolls out an addition in an environment
only after the kit deployed in that environment accepts it: the three
`KEY_DELEGATION_*` codes, the `key_delegation` value of the verify API's closed
check list, and `RoundVerification.keyDelegation`.

- **Per environment and per release, not per slice.** "Shipped" means deployed
  in that environment's Wrapper and verify page. Staging deploys `main` on every
  push; production deploys only an attested release (ADR-009). So an addition
  may be emitted on staging once the slice is merged and deployed, and in
  production only once a release that holds it is deployed there.
- **Rollbacks.** A per-project Pages rollback must not take the Wrapper or the
  verify page below S2 or S7 while the backend emits the additions in that
  environment.
- **The codes are accepted from S2.** The closed `ErrorCode` list lives in the
  vendored Snapshot schema's `PlayProblem`, which the Wrapper validates under
  W-28; a problem with a code not on it shows the generic error (W-42). S2's
  sync of the schema accepts the three codes; S4 only maps them.
- **Targeted, not general.** The verify page accepts exactly the two named
  additions, `RoundVerification.keyDelegation` and the `key_delegation` check
  name, pinned by tests in S7 (or S2). It refuses any other unknown field or
  check name, so V-10's closed schema keeps its meaning.
- **Today's reader is broader than V-10.** It ignores every unknown top-level
  field and accepts any check name (checked on 2026-11-17 against
  `parseEvidence` with the test fixture), and no test pins either. S7 narrows it
  to the two additions, so it then matches V-10 for everything else.

## Migration considerations

- The Snapshot's `FairnessContext` and the Play API's `StartRoundRequest` are
  closed today: a Snapshot with `proofs.keyDelegation` fails the validator
  (W-28), and the start cannot carry the field. So S2 and S4 land before S5
  sends any delegation. The backend adds the field only to a delegated start, so
  nothing breaks before.
- **The switch, per environment.** An environment's `signingPageOrigin`, the
  field that makes the Wrapper offer the menu entry, is set only once that
  environment's backend accepts `keyDelegation`. `StartRoundRequest` is closed,
  so an older backend refuses a delegated start as a schema error, not a 422;
  the Wrapper then offers "continue without" (section 7).
- The configuration gains optional fields; existing documents stay valid and
  offer no delegation. The verify page's validator (V-3) and the Pages
  configuration job learn them in the same slice.
- Operators that send no COOP, or `same-origin-allow-popups`, change nothing.
  One that sends `same-origin` keeps working; its players cannot delegate.
- Players see nothing new until a build holds an accepted notice and the
  environment names a signing page.

## Unresolved questions

None. Every question this draft raised was answered by the code owner on
2026-11-17; the answers are under [Decisions](#decisions-2026-11-17).

## Decisions (2026-11-17)

Decided by the human before this draft, in #220's Design section and after it:

- **The transport, the typed data, the notices, the signing page, the wallet
  calls, the scope rules, and the operator requirements** of #220's Design
  section (sections 1 to 7 above, except the points marked proposed).
- **The orphaned popup** is handled in three places: the Wrapper treats a `null`
  from `window.open` as blocked and plays on undelegated; the signing page does
  nothing without an opener; operator pages must not send COOP `same-origin`
  (W-49g).
- **The popup** is opened synchronously in the confirm click, under transient
  activation.
- **`se.delegation/1`**: the closed message set and the checks on both sides
  (section 4), `ready` posted per allowed origin, input only by `postMessage`,
  and same-window messages ignored.
- **The signing page** is an app of this repository on its own origin, with no
  third-party runtime dependency, the same release pipeline,
  `frame-ancestors 'none'`, no COOP, and `Referrer-Policy: no-referrer`
  (ADR-012).
- **The wallet port's allow-list**, EIP-6963 only and de-duplicated by `uuid`,
  buttons disabled while a request is pending, and the best-effort revoke.
- **The consent flow**: the menu entry's conditions, the dialog, the pending
  mark and flag, the 422 path, W-9's earlier key, and W-11's memory-only rule,
  extended to the delegation.
- **The slices** S2 to S7, and the kit-first rollout of the codes and the verify
  additions.

A contract update from the backend the same day:

- **`retired`** is a third notice status in the backend's published
  `key-delegation/v1`: kept for old evidence, never offered or accepted for a
  new start. The verify page looks a notice up in the whole list, `retired`
  included (section 8).

Answered by the code owner the same day, on this draft's open questions:

- **Q1. The signing page's configuration.** It fetches its own
  `environment-config.json` under `connect-src 'self'`, so one attested build
  serves every environment, like the Wrapper and the verify page; this replaces
  the earlier `connect-src 'none'` (section 5, ADR-012).
- **Q2. The notices at run time.** The signing page and the shell take
  `contracts`' runtime entry for the notices, as the `verify` app does.
- **Q3. The contracts the kit may copy.** `key-delegation/v1` (the notices and
  their vectors) is a player-facing contract the kit may copy. This change names
  it in every list of them: `AGENTS.md` (Contracts are documents; Public
  repository), the specs' README, the client-kit spec, which also says that its
  "no operator, wallet, or admin API document" does not exclude it, the
  contracts table, and the release runbook. `AGENTS.md`'s architecture rules
  gain the `signing-page` app, depending on nothing but `signing` and
  `contracts`' runtime entry.
- **Q4. Pending notices on the signing page.** Its configuration carries
  `environment` and the same pending-notice flag, under the Wrapper's rule: its
  validator refuses the flag in production.
- **Q5. The release artifact.** The signing page ships inside the Wrapper's
  release artifact, as the verify page does (V-16), and the Wrapper's site must
  not serve its directory.
- **Q6. The waits.** The Wrapper waits 10 s for `ready`, as the operator
  handshake does (W-49c); with none in time it says the signing window could not
  connect, and play goes on undelegated. A window the player closes before it
  answers is `declined`: no error, and the entry stays available.
- **Q7. Which notice.** The most recent `approved` one; a `pending` one only
  when none is approved and the environment's pending flag allows it.
- **Q8. The kit-first rule, targeted.** The verify page accepts exactly
  `RoundVerification.keyDelegation` and the `key_delegation` check name, pinned
  by tests in S7 (or S2), and refuses any other unknown field or check name, so
  V-10's closed schema keeps its meaning.
- **Q-a. Status.** RFC-006 stays `draft` and ADR-012 `proposed`; every spec and
  `AGENTS.md` reference that relies on them says "(proposed, RFC-006)" or
  "(proposed, ADR-012)".
- **Q-b. A notice not in the vendored list** on the verify page: the hash and
  the signature are still checked; only publication is "not checked", never a
  V-7 mismatch (section 8).
- **Q-c. The spike's network** is written as "a network other than mainnet".
- **Q-d. The delegation check.** At the W-26 point, a round whose
  `proofs.keyDelegation` is missing or differs from the delegation the shell
  sent fails the delegation check. It sits beside the tip check under W-26's
  `T_0` rule: `PlayerCancel` only once checks 1 to 5 have passed, a failure seen
  before check 5 waits for it, and nothing signed when one of checks 1 to 5
  failed. Hex values compare as bytes and `expiry` as an integer; three edge
  cases are decided (section 7).
- **The answer's order** (decided the same day). The signing page revokes first,
  best effort and for at most about 3 s, then posts its answer, then drops
  `window.opener`; the Wrapper closes the window when the answer arrives.
- **Q-e. The signing page's site.** Its origin is on a different registrable
  domain from the Wrapper's, by W-37's comparison (ADR-007), for site isolation
  where the browser has it, with the same-origin policy as the guarantee
  everywhere (section 5, ADR-012).
