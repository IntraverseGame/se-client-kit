# Wrapper

Status: **Draft, for human review.** This is the contract the Wrapper is built
and tested to. It takes effect for the code when the first release lands. The
[questions it raised](#decided-questions) (OQ-1 to OQ-6) were decided by the TPO
(the Technical Product Owner) on 2026-10-15; none is open. The signed-action
grammar, `T_0`, and the signing vectors belong to the backend's signed-action
spec and are only referenced here
([What this spec does not own](#what-this-spec-does-not-own)).

## Purpose

- The Wrapper is the part of SuperEngine that runs in the player's browser and
  holds the player's credentials: the play token and the action key. It opens a
  session from a launch code, signs the player's actions, checks what the
  backend tells it about the round, renders the Snapshot, and hosts the game
  iframe.
- The player trusts this code with the one key that can cash out their round. So
  the contract is written as requirements that a test can fail, and the code is
  public ([client-kit.md](./client-kit.md)).
- The first release plays Coin Flip end to end against the SuperEngine backend:
  launch, key setup, round start (the key's address is presented in the `start`
  call; there is no signed `PlayerStart`, W-22), move, and cash-out.

## Scope

In scope (first release):

- opening a session from a launch code read from the URL fragment, the play
  token, and its refresh;
- the action key: generation, custody, and what may be stored;
- two tabs of one session (Web Locks);
- the transcript: tracking `T_n`, never signing two actions at one sequence;
- starting a round with the action key's address (no signed start, W-22), and
  signing move, cash-out, and cancel through the signed-action spec;
- verifying the bind receipt, and the tip check, before the game is shown as
  ready; `PlayerCancel` when a check fails;
- rendering from the Snapshot, validated against `se.snapshot/1`;
- the round id and the link to the verify page after a round ends;
- the sandboxed game iframe and its `postMessage` controller boundary;
- error states, including network failure;
- accessibility;
- the test plan.

Out of scope:

- native bet controls and controller API variations (later increments). The
  controller boundary below is the minimal first-release one;
- wallet-delegated keys and player-supplied keys;
- WebSocket. The first release uses the REST verbs and polls the Snapshot;
- more than one game at a time, and the `playback` presentation;
- the Play API itself, the verify API, and the verify page's content (backend
  and verifier concerns).

## Boundary

The Wrapper is the browser side of a contract whose server side the backend
owns.

- **The Wrapper owns:**
  - the player's credentials in the browser: the play token and the action key,
    for the lifetime of the page;
  - the transcript state the player has signed, in the browser;
  - the checks the player makes on the backend's claims: the bind receipt and
    the tip check;
  - rendering, and the postMessage boundary toward the game and the operator
    page.
- **The Wrapper does not own:**
  - sessions, tokens, and their validity: it holds a token and never decides
    that one is valid;
  - round state, funding, settlement, and what a Snapshot contains;
  - the signed-action grammar and the verifier;
  - the game's own rendering (the game developer);
  - money: balances and amounts are the operator's, shown as the Snapshot gives
    them.
- **The Wrapper consumes** (contracts, never backend code):
  - the Play API, `/play/v1`, as its OpenAPI document;
  - the Snapshot schema `se.snapshot/1` and its golden vectors;
  - the signed-action spec and the signing vectors; (the three above all arrive
    as vendored data in the kit's `contracts` package, never as backend code);
  - public JSON-RPC endpoints, for the tip check (a local or preview environment
    may use its own node, W-26a);
  - one environment configuration document ([Configuration](#configuration));
  - the operator launch contract, by name only: the launch URL whose fragment
    carries the launch code (W-1).
- **The Wrapper is consumed by:**
  - the player;
  - the operator page, which embeds the Wrapper and receives resize, lobby, and
    deposit messages;
  - the game iframe, which receives Snapshots and sends action requests.

How the kit obtains those contracts is in
[client-kit.md](./client-kit.md#how-the-kit-gets-its-contracts).

## Contract

### Vocabulary

| Term          | Meaning                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrapper       | The whole browser program: the shell and the UI.                                                                                                                                                                               |
| shell         | The headless part of the Wrapper that holds credentials, signs, and checks. The UI and the game cannot reach its secrets.                                                                                                      |
| game          | The developer's iframe. It renders Snapshots and asks for actions. It is untrusted.                                                                                                                                            |
| operator page | The page of the operator that embeds the Wrapper (origin A).                                                                                                                                                                   |
| SE origin     | The origin that serves the Wrapper. The Wrapper's code, its Play API calls, and its credentials live here.                                                                                                                     |
| game origin D | The origin of the game iframe. A different registrable domain from the SE origin.                                                                                                                                              |
| launch code   | The single-use, short-lived secret in the fragment of the launch URL. The Wrapper redeems it once for a session (W-1, W-2).                                                                                                    |
| action key    | The per-session secp256k1 key the shell generates. Its address is bound to the round at start.                                                                                                                                 |
| bind receipt  | The backend's signed statement (an EIP-712 `CreateRoundAuth`) over the exact arguments of the round's on-chain creation: round id, entropy source, target block `N`, round secret hash, bet, currency, action key, terms hash. |
| tip check     | The shell's check of the bind's block `N` against the final tip on independent RPCs.                                                                                                                                           |
| transcript    | The chain `T_0, T_1, ...` of hashes each signed action links to.                                                                                                                                                               |

### Requirements and traceability

Every requirement below uses MUST, SHOULD, or MAY in the RFC 2119 sense. Each is
tied to a first-release requirement (R1 to R4) or acceptance criterion (AC1 to
AC5), or to the security model the Wrapper exists to keep.

| Item | Text (short)                                                                                                                               | Requirements                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| R1   | open a session from a launch code (read from the URL fragment only), hold the token only in memory, refresh before expiry                  | W-1 to W-8                                                       |
| R2   | generate the key locally, sign start, move, and cash-out per the signing vectors, verify the bind receipt before showing the game as ready | W-9 to W-27                                                      |
| R3   | render only from a validated Snapshot; handle `starting`, `active`, `resolving`, `won`, `lost`, `idle`, and the typed error                | W-28 to W-38                                                     |
| R4   | show the round id and a verify-page link after the round ends                                                                              | W-39, W-40; T-6, T-10                                            |
| AC1  | browser e2e: a win, a loss, and a cash-out against a preview stack                                                                         | [Test plan](#test-plan) T-10 to T-12; [OQ-3](#decided-questions) |
| AC2  | the shared signature vectors pass in this repository's suite                                                                               | T-1 to T-3                                                       |
| AC3  | Snapshot golden vectors render without error                                                                                               | T-5, T-6                                                         |
| AC4  | no key or token in logs, URLs, or storage that survives the session                                                                        | W-3, W-4, W-10 to W-12, W-41; T-13                               |
| AC5  | accessibility and network-failure error states covered by tests                                                                            | W-42 to W-48; T-14, T-14a, T-15, T-16                            |

### Session open and the play token

The lifetimes of a launch code, a play token, and a session, and its idle
timeout, are the backend's configuration. The Wrapper reads every deadline from
the responses and hard-codes none, and its tests take such values from fixtures,
not from numbers written in the test. The numbers that appear below for polling,
timeouts, and retries are the **Wrapper's own configuration**, with the stated
defaults.

- **W-1.** On load the Wrapper MUST read the launch code **only from the URL
  fragment**, exactly once, and MUST remove it from the URL
  (`history.replaceState`) before any network call or log line. A launch code is
  a secret: single use and short lived. The fragment is the one place no server
  and no `Referer` header sees; a code in the query string would reach the
  server in the first document request. So the Wrapper never reads a code from
  the query string, never forwards it (in a request, a log line, a message, or
  the DOM), and never stores it: it ignores the query string and treats the
  launch as having no code (W-1a). The operator launch contract (owned
  elsewhere, named here only) must therefore place the launch code in the
  fragment.
  <!-- TODO(Play API): the parameter name and the exact fragment format come from the operator launch contract. Only the placement (the fragment) is decided here. -->
- **W-1a.** **No launch code.** When the fragment holds no launch code (it is
  absent or empty, or the code was placed only in the query string), the Wrapper
  MUST NOT call the redeem call and MUST sign nothing. It shows the
  [session-ended state](#error-and-degraded-states) with the instruction to
  relaunch from the operator, the same state W-2 shows for a rejected code.
- **W-2.** The Wrapper MUST redeem the code once, with the Play API's redeem
  call, and MUST NOT retry a redeem whose response was lost: a code cannot be
  redeemed twice, so the player needs a new launch. It shows the
  [session-ended state](#error-and-degraded-states) with the instruction to
  relaunch from the operator. A rejected code is the same for an unknown, used,
  or expired one; the Wrapper cannot tell them apart and does not try.
  <!-- TODO(Play API): the redeem call and its response shape (session id, play token, `tokenExpiresAt`, `sessionExpiresAt`). -->
- **W-3.** The play token MUST live only in a JavaScript variable inside the
  shell, for the lifetime of the page. It MUST NOT be written to any storage
  (`localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, the
  history state), to a URL, to a log, to an error message, to the DOM, or to a
  `postMessage`. It is sent only in the `Authorization` request header of Play
  API calls, with `credentials: "omit"`, `cache: "no-store"`, and
  `referrerPolicy: "no-referrer"`.
  <!-- TODO(Play API): confirm the bearer header form of the play token. -->
- **W-4.** Every type that holds a token, a launch code, or the key MUST print
  `[redacted]` under `String()`, `JSON.stringify`, template literals, and the
  runtime's inspect hook. A thrown error and a log line MUST carry the method,
  path, status, and `requestId` of a request, never its headers or body.
- **W-5.** The Wrapper MUST read the token's deadline from the response
  (`tokenExpiresAt`), not from a constant: the lifetime is the backend's
  configuration and can differ per deployment.
- **W-6.** The Wrapper MUST refresh the token before it expires: when the
  remaining time falls to a configured fraction of the token's lifetime (default
  one third), and at least a configured margin (default 60 s) before the
  deadline, whichever is earlier (Wrapper configuration). The deadline is
  corrected by the clock offset measured from the HTTP `Date` header of the
  redeem response. At most one refresh is in flight. The new token replaces the
  old one only after its response arrived; until then the old token stays in
  use. A refresh whose response was lost MAY be repeated with the same old
  token: the presented token keeps its own expiry.
- **W-7.** A refresh failing with a retryable problem MUST be retried with
  bounded backoff while the old token is valid. A refresh answered
  `SESSION_EXPIRED`, `SESSION_REVOKED`, or `UNAUTHENTICATED`, or a token that
  reached its deadline, ends the session: the Wrapper stops signing, discards
  the key and the token, and shows the session-ended state. A token that expired
  cannot be refreshed.
- **W-8.** A token refresh and a Snapshot read do not count as player activity
  on the backend. The Wrapper MUST NOT send calls only to keep a session alive:
  a tab left open expires by the backend's idle timeout, and the Wrapper shows
  the session-ended state when it learns that.

### The action key and what may be stored

- **W-9.** The shell MUST generate the action key itself, on the first need
  (before the first `start`), from the browser's cryptographic random source
  (`crypto.getRandomValues`, 32 bytes, rejected and redrawn when zero or not
  below the curve order). Its address is the Ethereum address of its public key
  (Keccak-256 of the uncompressed public key without the prefix byte, the last
  20 bytes). Importing a key, and a key delegated by a wallet, are out of scope.
- **W-10.** The private key MUST exist only inside the shell's closure, as a
  value of the redacting key type (W-4). It MUST NOT be exported, returned,
  serialized, sent in a `postMessage`, attached to `window` or any global, or
  handed to the UI layer or the game. The signing function takes a digest and
  returns a signature; nothing returns the key.
- **W-11.** **Storage rule (decided, OQ-1,
  [Decided questions](#decided-questions)).** In the first release the shell
  MUST keep the key and the token **in memory only**, and nothing in the Wrapper
  writes to persistent or tab-scoped browser storage. A reload, a closed tab, or
  the session's end destroys the key, and the shell zeroes the key bytes when
  the session ends (best effort: JavaScript cannot guarantee the memory is
  wiped). The Wrapper MUST NOT register a service worker and MUST NOT set
  cookies.
  - Why not storage that lives "for the session". `sessionStorage` survives a
    reload and is **copied into a duplicated tab**, so it would put one key in
    two live tabs. `localStorage` and IndexedDB survive the browser closing,
    outliving the session, and are readable by any script on the SE origin. A
    reload cannot be continued in any case: the token is memory-only and the
    launch code is single-use, so a reload needs a new launch and therefore a
    new session. The backend does not hand an open round to another session, so
    a key kept across a reload would not let the player move in that round. What
    a lost key costs is already the backend's rule: the round runs to its time
    limit and ends by its game's expiry rule, with no recovery path.
- **W-12.** What the Wrapper MAY keep after a page is gone: nothing. In
  particular no key, token, launch code, receipt, or signed action, and no
  identifier derived from them. The one exception is a download the **player
  starts** (the evidence export of W-27): the file goes to the player, and the
  page holds no copy of it afterwards. A persistent evidence store is deferred
  with the post-round receipt check ([OQ-1](#decided-questions)).
- **W-13.** The shell MUST serialize the key's use behind its Web Lock (W-14)
  and MUST sign only on a player action, on the automatic cash-out of W-24, or
  on the `PlayerCancel` that W-26 requires. It MUST NOT sign in response to a
  message from the game that is not a validated action request (W-37, W-38).

### Two tabs

- **W-14.** After the redeem, the shell MUST request an exclusive Web Lock named
  `se:signer:<sessionId>` (`navigator.locks.request` with `ifAvailable: true`)
  and hold it for the page's life. A tab that does not get the lock MUST NOT
  sign, refresh, or poll for the session, and MUST show the "this session is
  open in another tab" state. If the browser has no Web Locks API, the shell
  MUST NOT sign (fail closed).
- **Why it still matters with a memory-only key.** Two tabs cannot share an
  in-memory key, so two tabs of one session do not arise from normal use: a
  second launch is a second session with its own key, and a second redeem of one
  code fails. The lock is the guard that keeps a sequence from forking if a tab
  is cloned or a future design hands a session over. A fork would be
  equivocation by the key holder, and the backend rejects it (a stale `previous`
  or a wrong sequence).

### The transcript

- **W-15.** The shell MUST track, per round it signs for: the round id, the last
  accepted `T` (`T_0` at the start), the next sequence, and the digest, the
  signed bytes, and the `idempotencyKey` of any action it has signed but not
  seen applied. It MUST NEVER sign two different actions for one
  `(round, sequence)`, whatever the network does.
- **W-16.** The shell MUST record a signed action in that state **before** it
  sends it. If the send fails or its outcome is unknown, the shell MUST resend
  the **same signed bytes** with the **same** `idempotencyKey`, or read the
  Snapshot to learn the outcome. It MUST NOT build a new action at that
  sequence.
- **W-17.** `PlayerCancel` and the first `PlayerAction` of a round are both at
  sequence 1. After the shell signs one, it MUST NOT sign the other for that
  round (signing both is equivocation).
- **W-18.** Sequences start at 1, with `previous = T_0`, and each action's
  `previous` is the `T` of the one before. `T_n` is the struct hash of the
  signed message. The shell advances its `T` only when the response shows the
  action applied, which it knows from the Snapshot's `step` (and `status`), and
  never from a guess.
  <!-- TODO(signed-action spec): `T_0` is the Ready evidence hash. Its definition, the byte encoding of its inputs, and where the shell reads them from are pinned by the signed-action spec. -->
- **W-19.** On `STALE_ACTION` the shell MUST stop signing for that round, read
  the Snapshot, and adopt the outcome only if the Snapshot shows its action
  applied. Otherwise it shows the out-of-sync state and offers the verify link.
  The shell cannot recompute `T` from a Snapshot, so it never guesses a new
  `previous`.
  <!-- TODO(signed-action spec): the resynchronization rule, if the spec defines one. -->

### Signing start, move, cash-out, and cancel

- **W-20.** Every signature MUST be built by the kit's `signing` package from
  the signed-action spec and checked against its vectors. The shell MUST build
  the canonical action text and path itself from the game's request and MUST
  never sign any other spelling
  ([What this spec does not own](#what-this-spec-does-not-own)).
  <!-- TODO(signed-action spec): the action grammar for Coin Flip (`pick`, the 0-based `path`), the `PlayerCancel` fields, and the vectors. -->
- **W-21.** Every signature MUST be canonical: 65 bytes `r ‖ s ‖ v`, `v` in
  `{27, 28}`, low `s`, deterministic (RFC 6979). The shell MUST reject any other
  length, `v`, or high `s`, and a recovered zero address, when it checks a
  signature it received (the bind receipt). This is the backend verifier's rule,
  stated for the browser
  ([ADR-001](../decisions/ADR-001-toolchain-and-signing.md)).
- **W-22.** **Start.** The shell starts a round with the Play API's `start`
  verb, a fresh `idempotencyKey` (within the Play API's length limits), the bet
  as an `AmountRequest` (`value`, `unit`, copied from the Snapshot's own
  `Amount` fields, never typed or computed from a float), and the action key's
  address. A player-signed `PlayerStart` is **deferred** (a config round's bind
  needs no signed start), so the first release has no signed start. "Sign start"
  is read as: the shell generates the key and presents its address in the
  `start` call, and the bind receipt then commits to that address
  ([OQ-5](#decided-questions)).
  <!-- TODO(Play API, signed-action spec): the `start` request carries the action key address; its field name and the response's receipt envelope. -->
- **W-23.** **Move.** The game sends a validated pick request (W-38); the shell
  checks it is legal in the Snapshot it holds (the step exists, the option is in
  range, the status is `active`), builds the canonical action, signs
  `PlayerAction` at the next sequence, and sends `continue` with the signed
  bytes and a fresh `idempotencyKey`. A request that fails the check is rejected
  to the game with a `reject` message and nothing is signed.
- **W-24.** **Cash-out.** The shell signs `PlayerCashOut` when the player asks
  for it (the cash-out button, offered when the status is `active` and at least
  one step was survived), and only then, with one exception: after a move whose
  Snapshot is `active` with `step` equal to the number of steps, it signs
  `PlayerCashOut` automatically, so a win is never stranded for lack of a click.
  This applies **only if the backend leaves the round `active` at the last
  step**; when the move itself closes the round (`won`), the Wrapper signs
  nothing.
  <!-- TODO(signed-action spec): confirm what the backend does at the last step (paid by the move, or `active` until a cash-out) and fix the automatic cash-out rule to it. -->
- **W-25.** **Cancel.** The shell signs `PlayerCancel` (`action = "cancel"`,
  empty path, sequence 1, `previous = T_0`) only when a check of W-26 fails, or
  when the player cancels a round that is `active` with no move made, if the
  game offers it (config rounds only; W-31 offers the control in the `active`
  row).
- **W-26.** **Checks before the first signature and before the game is shown as
  ready.** The Snapshot is `starting` while the round prepares. The shell MUST
  NOT show the game as ready, and MUST NOT sign anything except the
  `PlayerCancel` this item requires, until the Snapshot is `active` **and** all
  of these hold:
  1. **Receipt signature.** The bind receipt is a `CreateRoundAuth` whose
     signature is canonical and recovers to the backend's signer address from
     the environment configuration (never a value taken from the response).
  2. **Receipt contents.** The receipt's round id equals the Snapshot's
     `roundId`; its action key equals the shell's own key address; its bet and
     currency equal what the player chose (`bet` against the `AmountRequest` the
     shell sent, `unit` against the currency); its source, `N`, and
     `roundSecretHash` equal the Snapshot's `proofs.randomnessProof` (`source`,
     `blockNumber`, `roundSecretHash`).
  3. **Ready evidence.** The shell recomputes `T_0` and compares it with the
     round's Ready evidence.
  4. **Tip check** (W-26b). If a check fails, the shell signs `PlayerCancel`
     (W-25) as soon as the round is `active`, keeps the receipt, shows "this
     round failed verification and was canceled", and the player's bet is
     returned by the cancel. For a book round (not in the first release) the
     check can only flag.
  <!-- TODO(Play API, signed-action spec): where the Play API returns the bind receipt and the fields to recompute `created` and `T_0` (the Snapshot schema `/1` carries none of them: its `proofs.randomnessProof` has `source`, `blockNumber`, `roundSecretHash` only), and how the shell learns the signing domain (`chainId`, `verifyingContract`) and the backend signer address (this spec assumes the environment configuration). -->
- **W-26a. Fewer than `minRpcQuorum` endpoints answer.** Decided (OQ-2,
  [Decided questions](#decided-questions)): the minimum number of endpoints that
  must answer is a configuration value, `minRpcQuorum`, and its default is
  **2**. When fewer than that answer (W-26b), the tip check is **failed**, not
  skipped: the shell signs `PlayerCancel` and shows "could not verify the
  chain". The environment configuration carries an `environment` field
  (`production`, `preview`, or `local`). A local or preview environment with one
  chain endpoint (the local anvil node) may set `minRpcQuorum` to 1, and then
  the shell MUST show a non-dismissable "chain check not independent
  (development)" indicator and MUST record `tipCheck: "degraded"` with the
  receipt. **Boot rule:** the Wrapper MUST refuse to start if `environment` is
  `production` and `minRpcQuorum` is below 2 (it shows the configuration-error
  state and signs nothing). The release build's fixture check
  ([client-kit.md](./client-kit.md#environment-configuration)) is an additional
  guard, not a replacement. **This is the single-RPC gap of the first release.**
- **W-26b. Tip check.** The shell asks **at least `minRpcQuorum` independent**
  RPC endpoints for their final block, and fails closed on any disagreement. In
  production these are public RPC endpoints from independent providers. The
  local or preview exception of W-26a (one endpoint, the local node, with
  `minRpcQuorum` = 1, the degraded indicator, and `tipCheck: "degraded"`)
  applies to everything below: "public" and the independence rule describe the
  production requirement.
  - **Definitions.** `h_top` is the maximum final block over all the endpoints
    that answered within the request timeout (W-43). `h_low` is the minimum
    final block over the same endpoints.
  - **The rule.** The check passes only if (1) at least `minRpcQuorum` endpoints
    answered **and** (2) **every** answering endpoint agrees: each is within the
    source's lag margin of `h_top`, and all return the same block hash at height
    `h_low` (the shell queries that height on each). The observed tip is
    `h_top`.
  - **Failure.** Any answering endpoint that is further than the lag margin
    behind `h_top`, or that returns a different hash at `h_low`, fails the
    check, as does too few answering. The shell does not drop an outlier and
    does not pick a side: it signs `PlayerCancel` per W-26. The receipt records
    every endpoint's answer (its provider, final block, and the hash at
    `h_low`).
  - **The bind.** The shell records the observed tip with the receipt and checks
    `N` against it: for a `future` bind `N` MUST be above that tip; for a `tip`
    bind `N` MUST NOT be older than it, within the source's lag margin.
  - **Independent** means providers run by different organizations on separate
    infrastructure: the configuration names each endpoint's provider, and the
    shell refuses a configuration in which two endpoints share a provider. The
    configuration schema also refuses an entropy source whose configured
    endpoint count is below `minRpcQuorum`, so a quorum can never be unreachable
    by configuration.
  <!-- TODO(backend entropy spec): the lag margin in blocks per chain, from the measured RPC lag; it is the `tipLagMargin` configuration value. -->
- **W-27.** The shell SHOULD keep every bind receipt and every signed action in
  memory for the page's life and SHOULD offer them as a JSON download after the
  round ends, started by the player (the only write out of the page, W-12).
  After the round's deadline the shell is also meant to check each receipt
  against the verify API and the public record chain; that check needs receipts
  that outlive the page and is deferred ([OQ-1](#decided-questions)).
  <!-- TODO(later increment): post-round receipt check against the public record. -->

### Rendering from the Snapshot

- **W-28.** The Wrapper MUST render only from a Snapshot that passed the
  `snapshot` package's validation against `se.snapshot/1` (the schema's keyword
  profile, with the golden vectors). A response that fails validation MUST NOT
  be rendered or forwarded to the game: the Wrapper shows the generic error
  state and logs the schema path of the first failure, never the document.
- **W-29.** The Snapshot is the only source of round state. The Wrapper MUST NOT
  infer hidden state from an absent field, MUST ignore fields it does not know
  (tolerant reader), and MUST ignore a Snapshot whose `version` is lower than
  the last one it accepted for the session (a stale response).
- **W-30.** The Wrapper MUST declare its capabilities when the session starts:
  presentations `["steps"]` and every `RoundStatus` it handles (all seven: the
  six of R3 and `canceled`, which the cancel path needs).
  <!-- TODO(Play API): the carrier of the capability declaration. -->
- **W-31.** Statuses. The Wrapper MUST handle each as follows:

  | `status`    | The Wrapper shows                                                                                                                                                                                          | Input                                                      |
  | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
  | `idle`      | the bet selector (`bet.suggestedBets`, defaulting to `bet.defaultBet`, within `minBet` and `maxBet`) and the start button, the balance. A typed error from the call that led here (a void) shows beside it | start enabled                                              |
  | `starting`  | "preparing the round"; the game is not shown as ready; the shell is verifying (W-26)                                                                                                                       | none; cancel is not offered                                |
  | `active`    | the game, ready, only after W-26 passed; the multiplier; cash-out when allowed                                                                                                                             | game picks, cash-out, cancel (if the game offers it, W-25) |
  | `resolving` | the game with inputs disabled, "resolving"                                                                                                                                                                 | none                                                       |
  | `won`       | the result, the payout as `formatted`, the round id and verify link (W-39)                                                                                                                                 | a new round                                                |
  | `lost`      | the result, the round id and verify link                                                                                                                                                                   | a new round                                                |
  | `canceled`  | "round canceled, your bet was returned", the round id and verify link, and with `closeReason: "expired"` the words "the time limit ended this round"                                                       | a new round                                                |
  | typed error | per [error and degraded states](#error-and-degraded-states)                                                                                                                                                | per code                                                   |

- **W-32.** `won` is final. The Wrapper MUST NOT show or wait for the operator
  credit. The balance it shows is the Snapshot's `bet.balance.formatted`.
- **W-33.** `closeReason: "expired"` is shown next to the status and is not a
  status.
- **W-34.** Money: the Wrapper MUST read `Amount.value` as a string and use
  `BigInt` for any comparison (for example the bet against the balance), and
  MUST display `Amount.formatted`. It MUST NOT compute money from `normalized`
  or from a multiplier, and MUST NOT use a floating-point number for an amount.
- **W-35.** While the status is `starting` or `resolving`, the Wrapper MUST poll
  the Snapshot read (no WebSocket in the first release) with bounded backoff
  (SHOULD: 500 ms rising to 2 s, Wrapper configuration) until the status
  changes, and MUST keep polling at the slow rate after a longer wait, with a
  "taking longer than expected" notice. It MUST stop polling when the status is
  terminal or the session ended.
- **W-36.** Idempotency. Each player intent (start, a move, cash-out, cancel)
  gets one `idempotencyKey` (`crypto.randomUUID()`), reused for every retry of
  that intent and never for another.

### The game iframe and the controller boundary

- **W-37.** The game runs in
  `<iframe sandbox="allow-scripts allow-same-origin">` served from game origin
  D, which MUST differ from the SE origin and MUST be on a different registrable
  domain, so a script in the game can never reach the Wrapper's storage or code.
  The Wrapper MUST refuse to mount a game whose origin equals its own, and MUST
  take D only from the environment configuration allow-list (never from a
  message, a URL parameter, or the Snapshot).
  <!-- TODO(Play API, catalog): where D comes from for a launched game (the game's release target or the launch response). -->
- **W-38.** A message from the game is accepted only if `event.source` is the
  game frame's `contentWindow` **and** `event.origin` is D. The Wrapper posts to
  the game only with `targetOrigin = D`. Every accepted message MUST be parsed
  against a closed, versioned schema (`se.controller/1`, below) and ignored if
  it does not match. The game never receives the key, the token, a signature, a
  receipt, or a header: the Wrapper sends it Snapshots (validated, W-28) and
  nothing else of the session.
- **`se.controller/1`, the first-release minimum.** Messages are JSON objects
  with `schema: "se.controller/1"` and a `type`. Controller variations come in
  later increments.

  | Direction       | `type`     | Fields                                           | Meaning                                                                                                                                      |
  | --------------- | ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | game to Wrapper | `hello`    | `presentations`, `statuses`                      | The game's capabilities. The Wrapper sends no variant the game did not declare.                                                              |
  | game to Wrapper | `action`   | `id`, `verb` (`pick`), `args` (`step`, `option`) | A pick request. It is not an action: the Wrapper validates it (W-23) and builds the signed action.                                           |
  | Wrapper to game | `snapshot` | `snapshot`                                       | A Snapshot that passed W-28, sent on every accepted change.                                                                                  |
  | Wrapper to game | `reject`   | `id`, `reason`                                   | An `action` request that was not accepted. `reason` is a closed list (`not_legal`, `not_active`, `busy`, `invalid`), never a server message. |

  The message set is closed: a `type` outside it is ignored. The operator page
  gets only `resize`, `lobby`, and `deposit` messages, under
  [W-49](#operator-embedding).
  <!-- TODO(later increment): the full controller API and its schema, with the variations. -->

- **W-39.** After a round ends (`won`, `lost`, or `canceled`) the Wrapper MUST
  show the **round id** (the Snapshot's `roundId`, UUIDv7 text) with a control
  to copy it, and a **link to the verify page** for that round. The verify base
  URL comes from the environment configuration, and the link opens in a new
  browsing context with `rel="noopener noreferrer"`.
  <!-- TODO(verify API): the verify page URL shape and whether it takes the round id in the path or a fragment. -->
- **W-40.** The round id and the link MUST stay visible until the player starts
  another round, and a new round MUST NOT replace them before the player acts.

### Error and degraded states

- **W-41.** No key, token, or launch code may appear in an error state, a
  notice, the document title, the DOM, the console, or the URL. The error states
  show the typed `code`'s message in the player's language and the problem's
  `requestId`, so support can find the call.
- **W-42.** Typed errors. The Wrapper branches on `code` and never on the
  message; it retries only when `retryable` is `true`, with the same
  `idempotencyKey`, a bounded number of times with backoff, then shows the
  error. For a `code` it does not know it falls back to `status` and
  `retryable`.

  | Condition                                                                                                      | The Wrapper                                                                                                                                                                                                                 |
  | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `ROUND_ACTIVE`                                                                                                 | validates the embedded `snapshot` (W-28) and resumes from it. It signs again only if its own transcript state for that round exists (W-15); a round whose state it does not hold is shown, and the player cannot move in it |
  | `INSUFFICIENT_FUNDS`                                                                                           | tells the player; offers the `context.links.deposit` link when present                                                                                                                                                      |
  | `LIMIT_EXCEEDED`, `PLAYER_RESTRICTED`                                                                          | tells the player; no retry                                                                                                                                                                                                  |
  | `SESSION_EXPIRED`, `SESSION_REVOKED`                                                                           | the session-ended state, with the `context.links.lobby` link when present                                                                                                                                                   |
  | `STALE_ACTION`                                                                                                 | W-19                                                                                                                                                                                                                        |
  | `FUNDING_UNCONFIRMED`, `ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, `ROUND_VOIDED`, `UNAVAILABLE` (retryable) | one automatic retry path with backoff; then "try again"                                                                                                                                                                     |
  | any other                                                                                                      | the generic error with `requestId`; a "try again" only if `retryable`                                                                                                                                                       |

- **W-43.** Network failure. A request that fails with no response (offline,
  DNS, TLS, timeout, reset) MUST show the "connection problem" state without
  losing the round: the Wrapper keeps polling at the slow rate, resends a
  signed-but-unconfirmed action only as W-16 says, and says so when the browser
  reports being offline. After the connection returns, it reads the Snapshot
  first and continues from it. A request MUST time out (SHOULD: 15 s, Wrapper
  configuration). The Wrapper never reports success for an action whose outcome
  it has not read.
- **W-44.** Degraded states the Wrapper MUST show distinctly: session ended;
  open in another tab; connection problem; chain check not independent (W-26a);
  round failed verification; out of sync (W-19); Snapshot rejected (W-28).

### Accessibility

The Wrapper's own UI (everything except the game's contents) targets **WCAG 2.2
level AA**.

- **W-45.** Every control MUST be operable by keyboard alone, with a visible
  focus indicator and a logical order; the game iframe has a `title`. No
  keyboard trap, including around the iframe.
- **W-46.** A status change MUST be announced to assistive technology through a
  polite live region (`aria-live="polite"`), and an error through
  `role="alert"`. Focus moves to the result or error heading only when the
  player's own action caused the change, never when a poll did.
- **W-47.** Color MUST NOT carry meaning alone (win, loss, and error have text
  and an icon with a text alternative). Text contrast SHOULD be at least 4.5:1
  and the UI SHOULD honor `prefers-reduced-motion` and 200 % zoom without loss
  of function. Targets SHOULD be at least 24 by 24 CSS pixels.
- **W-48.** Every control and state has a text label in the session's `language`
  (the Snapshot's `context.language`), with a fallback language. Money is shown
  as the Snapshot's `formatted` string.

### Operator embedding

- **W-49.** **Operator embedding.** `frame-ancestors`, a response header set by
  the host
  ([client-kit.md](./client-kit.md#how-the-wrapper-reaches-the-superengine-origin)),
  is the primary control; this requirement is defense in depth. The Wrapper
  accepts a handshake or message from the operator page only if
  `event.source === window.parent` **and** `event.origin` is in
  `operatorOrigins` (as W-38 does for the game frame), replies only with
  `targetOrigin` set to that origin, and parses every message against a closed
  schema.
  - Where `location.ancestorOrigins` exists, the Wrapper MUST refuse to start
    (the configuration-error state, no signing) if any ancestor origin is not in
    `operatorOrigins`.
  - Where it does not exist (Firefox), the Wrapper MUST NOT sign until a
    handshake from an origin in `operatorOrigins` has arrived, and from then on
    talks only to that origin.

  Together these keep another page from framing the Wrapper and leading the
  player to click cash-out (clickjacking).
  <!-- TODO(operator launch contract): the handshake and the three message schemas (`resize`, `lobby`, `deposit`); W-49 and T-9a need them closed. -->

### Configuration

The Wrapper's build is the same for every environment. One **environment
configuration document**, served from the SE origin and validated against a
schema in this repository at boot, supplies the environment's values. It holds
only public values; the Wrapper refuses to start on an invalid document.

| Field             | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `environment`     | `production`, `preview`, or `local`; W-26a's boot rule reads it  |
| `playApiBaseUrl`  | the Play API base (`/play/v1`)                                   |
| `verifyBaseUrl`   | the verify page base (W-39)                                      |
| `runtimeSigner`   | the address that signs bind receipts (W-26)                      |
| `registryDomain`  | `chainId` and `verifyingContract` of the signing domain          |
| `rpcEndpoints`    | per entropy source: the public endpoints, each with its provider |
| `minRpcQuorum`    | W-26a, default 2                                                 |
| `tipLagMargin`    | per entropy source, blocks; W-26b                                |
| `gameOrigins`     | the allow-list of game origins D                                 |
| `operatorOrigins` | the allow-list of operator page origins A                        |

<!-- TODO(hosting): who serves the document, its path, and the exact schema; this repository owns the schema, the SuperEngine side serves the values. -->

The list of RPC providers is owned by the infrastructure owner: which providers
are used, their CORS behavior, and the matching `connect-src` entries of the
Content Security Policy.
<!-- TODO(infrastructure owner): the RPC provider list per entropy source, with CORS and `connect-src`. -->

## Errors and edge cases

| Case                                                                                               | Behavior                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The launch URL carries no launch code in its fragment (absent, empty, or only in the query string) | No redeem call; the session-ended state with the relaunch instruction (W-1a). A query-string code is never read, forwarded, or stored (W-1)                     |
| The launch code is invalid, expired, or already used                                               | The API refuses the redeem; the Wrapper shows the session-ended state with the relaunch instruction (W-2). It cannot tell the cases apart                       |
| The page reloads mid-round                                                                         | A new launch is needed; the key and token are gone (W-11). The round runs to its time limit                                                                     |
| The Snapshot says `active` but a check failed                                                      | The game is never shown (W-26); the cancel is signed                                                                                                            |
| The bind receipt arrives but the Snapshot stays `starting`                                         | W-35 polling; the round is voided by the server's deadline and the Snapshot shows `idle` with a typed error; nothing was signed                                 |
| The game sends a pick for a step that is not current                                               | `reject: not_legal`; nothing is signed                                                                                                                          |
| Two `action` messages arrive before the first resolves                                             | The second gets `reject: busy`                                                                                                                                  |
| The response to a `continue` is lost                                                               | W-16: resend the same bytes and key, or read the Snapshot                                                                                                       |
| A signed `cashOut` is answered `STALE_ACTION`                                                      | W-19                                                                                                                                                            |
| The clock of the device is wrong                                                                   | W-6's offset correction from the `Date` header; a skew beyond a configured limit is shown as a notice, and the Wrapper still refreshes by the server's deadline |
| The game origin is not in the allow-list, or is the SE origin                                      | The game is not mounted (W-37)                                                                                                                                  |
| The Wrapper is framed by an origin not in `operatorOrigins`                                        | The Wrapper refuses to start where `location.ancestorOrigins` exists, and signs nothing before a handshake from a listed origin where it does not (W-49)        |

## Security

The key and the token are the assets. What may never happen is in W-3, W-4, W-10
to W-13, W-37, W-38, W-41, and W-49, and is tested by T-9, T-9a, T-13, and T-18.
Summary: the secrets live in one closure in memory, never in storage, a URL, a
log, the DOM, or a message; the game is untrusted, sandboxed on another origin,
and talks only through a closed, origin-checked message set; the Wrapper checks
the backend's claims (the bind receipt, the tip) before it signs.

## Observability

The Wrapper emits **no telemetry to the backend in the first release**: no
analytics, no error reporting, no third-party script. No endpoint exists for it
and none is invented here. The player and support work from the problem's
`requestId` shown in the error states (W-41), which the backend already logs.
The Wrapper's console output is `warn` and above, redacted (W-4), and holds no
document. A client-side error channel is a later decision with its own spec.

## Test plan

The suites live in this repository
([client-kit.md](./client-kit.md#testing-and-ci)). The backend owns the vectors
and the contracts they check. The unit, component, and e2e suites that run
against the in-repo fake Play API (`pnpm check` and the `e2e-fake` job) are
deterministic and hermetic: an injected clock, a seeded random source, no
network beyond that fake, no real key. The **preview-stack e2e** (T-10 to T-12,
and so AC1) is the exception: it talks to the SuperEngine preview stack, so it
is not hermetic, runs from the backend-owned job (see
[client-kit.md](./client-kit.md#testing-and-ci)), and is never part of
`pnpm check`.

| ID    | Level                        | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Covers                                |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| T-1   | unit, `signing`              | the contracts repository's `test/vectors/signing.json` vectors (domain separator, type hashes, `T_n`, digests, signatures, the registry authorizations), reproduced; read through the test-only entry of the `contracts` package, where the file is copied with its source commit; the action text and path are built only in the canonical spelling                                                                                                                                                                                                                                                                                                                                                                   | AC2, W-20, W-21                       |
| T-2   | unit, `signing`              | the worked-round vectors, and the negative cases: high `s`, bad `v`, wrong length, zero address, a changed `previous`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | AC2, W-21                             |
| T-3   | unit, `signing` and `shell`  | Sign then Recover round trips for random digests from a seeded source; signing is deterministic; key generation draws 32 bytes from the injected random source, redraws a zero or out-of-range value, and derives the address that the vectors give                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | W-9, W-21                             |
| T-4   | unit, `shell`                | the transcript: sequence and `previous` chaining; the same signed bytes and `idempotencyKey` on a resend; never two different actions at one sequence under a randomized sequence of failures, retries, and cancel against move; `STALE_ACTION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | W-15, W-16, W-17, W-18, W-19          |
| T-4a  | unit, `shell`                | session open: the launch code is read only from the fragment and removed from the URL before the first request and the first log line; a launch URL whose code is only in the query string is treated as having no code (nothing read, forwarded, logged, or stored, no redeem call, the session-ended state with the relaunch instruction); a redeem whose response is lost is not retried and ends in the session-ended state                                                                                                                                                                                                                                                                                        | W-1, W-1a, W-2                        |
| T-4b  | unit, `shell`                | the signing flows: `start` carries a fresh `idempotencyKey`, the bet copied from the Snapshot's `Amount` fields, and the key address (W-22, W-36); a move is built only when legal and otherwise answered `reject` (W-23); cash-out on request only, and the automatic cash-out only when the backend leaves the round `active` at the last step, never when the move closed the round (W-24); cancel on a failed check, never together with a move at sequence 1 (W-25); nothing is signed on a message that is not a validated action request (W-13)                                                                                                                                                                 | W-13, W-22, W-23, W-24, W-25, W-36    |
| T-5   | unit, `snapshot`             | every `valid/` vector validates and every `invalid/` vector fails at its `failsAt` pointer, with the `snapshot` package's evaluator; the files are the append-only set held in the `contracts` package (test-only entry), copied from the backend                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | AC3, W-28                             |
| T-5a  | unit, `shell`                | the Snapshot is the only source of state: unknown fields are ignored, an absent field is not read as hidden state, a lower `version` is ignored; the capability declaration lists `steps` and all seven statuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | W-29, W-30                            |
| T-6   | unit/component, Wrapper      | every `valid/` Snapshot renders without error and in the state the status table gives, with no hidden-field access; `closeReason` is shown beside the status and `won` shows no credit wait; after a round ends the round id and the verify link are shown and stay until the player acts, and the link opens with `noopener noreferrer`                                                                                                                                                                                                                                                                                                                                                                               | AC3, R4, W-31, W-32, W-33, W-39, W-40 |
| T-6a  | unit, `snapshot` and Wrapper | money: amounts above 2^53 and at 2^256 - 1 are compared as `bigint`, `formatted` is displayed, no number type is used for an amount, and `normalized` is never used for a decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | W-34, W-48                            |
| T-7   | unit, `shell`                | the token schedule (W-6): refresh point from a fixture's `tokenExpiresAt`, single flight, lost response retried, no keep-alive calls (W-8); a retryable refresh failure is retried with bounded backoff while the old token is valid, and `SESSION_EXPIRED`, `SESSION_REVOKED`, `UNAUTHENTICATED`, or a token past its deadline end the session: signing stops and the key and token are discarded (W-7); the injected clock                                                                                                                                                                                                                                                                                           | W-5, W-6, W-7, W-8                    |
| T-7a  | unit, `shell`                | redaction: the key, token, and launch code types print `[redacted]` under `String()`, `JSON.stringify`, template literals, and the inspect hook; errors and log lines carry no header or body; nothing returns the key; no export or global holds it                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | W-4, W-10, W-12, W-41                 |
| T-8   | unit, `shell`                | the bind verification (W-26): a good receipt passes; a wrong signer, wrong round, wrong key, wrong bet, wrong `N`, wrong secret hash, or wrong `T_0` each fail, and only the required `PlayerCancel` is signed; the tip check (W-26a, W-26b) with exactly `minRpcQuorum` endpoints answering and none disagreeing (pass), one outlier among three (fail), too few answering (fail), a block-hash mismatch at `h_low` (fail), and a disagreement beyond the lag margin (fail); the observed tip is `h_top`; the receipt records every endpoint's answer; the boot rule refuses `production` with `minRpcQuorum` below 2 and accepts `local` and `preview` with 1 plus the degraded indicator and `tipCheck: "degraded"` | R2, W-26, W-26a, W-26b                |
| T-8a  | unit, `shell`                | configuration and timeouts: a configuration in which two endpoints share a provider is refused, and so is a source with fewer configured endpoints than `minRpcQuorum` (W-26b); polling backoff while `starting` or `resolving`, the slow rate after a long wait, a stop at a terminal status or session end, and a request timeout                                                                                                                                                                                                                                                                                                                                                                                    | W-26b, W-35, W-43                     |
| T-9   | unit, `shell`                | the controller boundary: wrong `source`, wrong origin, bad schema, unknown `type` are ignored; the game never receives a field outside the allow-list (property test over a recorded session)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | W-37, W-38                            |
| T-9a  | unit and e2e                 | operator embedding: a message is accepted only if `event.source` is `window.parent` and `event.origin` is in `operatorOrigins` (a wrong source with a listed origin is ignored too), and replies use a listed origin only; **both paths** are tested: with `location.ancestorOrigins` present, a Wrapper framed by an unlisted origin refuses to start; with it absent (the Firefox path), nothing is signed before a handshake from a listed origin, and a handshake from an unlisted origin does not unlock signing                                                                                                                                                                                                  | W-49                                  |
| T-10  | e2e, browser                 | a **win** against the preview stack, including the start, the move, the receipt and tip checks, and the round id and verify link at the end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | AC1, W-22, W-23, W-26, W-39           |
| T-11  | e2e, browser                 | a **loss**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | AC1, W-23, W-39                       |
| T-12  | e2e, browser                 | a **cash-out** (needs a game with more than one step; [OQ-3](#decided-questions)); and the automatic cash-out case against a fake Play API that leaves the round `active` at the last step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | AC1, W-24, W-25                       |
| T-13  | e2e, browser                 | **no secret** after a whole session (launched through the fragment, so no launch code is ever in a request URL), a reload, and the session's end: no launch code, play token, or key (the e2e stubs `crypto.getRandomValues` with Playwright's `addInitScript`, so it knows the key's bytes, hex, and base64 forms, and tests the unmodified release bundle) in any console message, request or response URL, document URL and history, `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, or service worker registrations; the player-started evidence download is the only write out and leaves no copy                                                                                            | AC4, W-3, W-4, W-11, W-12, W-27       |
| T-14  | e2e + automated audit        | accessibility: an axe scan of every status and error state, and keyboard-only play of a round, with a visible focus indicator and no keyboard trap, and text labels in the session's language                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | AC5, W-45, W-48                       |
| T-14a | e2e, browser                 | live regions and visual rules: a status change is announced through a polite live region and an error through `role="alert"`; focus moves to the result or error heading only after the player's own action, never after a poll; win, loss, and error carry text and an icon beside colour; `prefers-reduced-motion` is honored; the UI works at 200 % zoom                                                                                                                                                                                                                                                                                                                                                            | AC5, W-46, W-47                       |
| T-15  | e2e, browser                 | offline: the network is cut during `starting`, during `resolving`, and during a signed action; the connection-problem state appears, the round is not lost, and no second action is signed at the sequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | AC5, W-16, W-43                       |
| T-16  | e2e, browser                 | typed errors: each row of the W-42 table with a fake Play API that returns it, and each degraded state of W-44 shown distinctly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | AC5, W-42, W-44                       |
| T-17  | e2e, browser                 | two tabs: the second tab of one session does not get the lock and does not sign                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | W-14                                  |
| T-18  | e2e, browser                 | the sandbox: a malicious test game that tries to read the parent's storage, the token, and the key, and to post forged messages, gets nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | W-37, W-38                            |

The e2e suite runs in two places: against an in-repo fake Play API on every
change here, and against the SuperEngine preview stack from a job owned by the
backend repository that builds this repository at a pinned commit
([client-kit.md](./client-kit.md#testing-and-ci)).

## What this spec does not own

The signed-action spec belongs to the backend and defines the items below. It is
a separate document, owned and versioned there. This spec restates only the
shell rules it needs, and it **defers** to that spec for everything below.

| Item                                                                        | Marker                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| the action grammar (`action` text, `path` encoding, row and tile numbering) | <!-- TODO(signed-action spec): action grammar -->   |
| the EIP-712 domain, the type strings, the type hashes                       | <!-- TODO(signed-action spec): domain and types --> |
| `T_0`: its encoding and where the shell gets its inputs                     | <!-- TODO(signed-action spec): T_0 encoding -->     |
| the vectors for the above                                                   | <!-- TODO(signed-action spec): vectors -->          |
| the backend's rejections and their stable error codes                       | <!-- TODO(signed-action spec): error codes -->      |

The shell rules restated in this spec (so the Wrapper can be reviewed without
the signed-action spec): never sign two actions at one sequence; track `T_n`;
build the canonical action from the game's request; sign the cash-out
automatically only where W-24 says; check the bind and the tip before the first
signature; canonical signatures only.

## Decided questions

The questions this spec raised were decided by the TPO on 2026-10-15. Each row
keeps the question, the options, and the decision. The spec follows the
decision.

| ID   | Question                                                                                                                                                                                                                                                                                                                                                            | Options                                                                                                                                                                                                                                                                                                                                                                                                 | Decision                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-1 | **Storage that survives a reload.** The first-release acceptance criteria forbid a key or token in "storage that survives the session". An earlier design note asked for the key to be kept in persistent storage for the session's lifetime, so a reload could continue the round. Both cannot hold, and the backend does not hand an open round to a new session. | (A) memory only; a reload forfeits the round by its expiry rule. (B) `sessionStorage`, which survives a reload and is copied by a duplicated tab. (C) IndexedDB, which survives the browser and needs a way to protect the key.                                                                                                                                                                         | **Decided (TPO, 2026-10-15): A for the first release.** A reload needs a new launch and a new session anyway, so B and C buy nothing until a round can be handed over across sessions. Revisit with that feature (a backend change) and with the post-round receipt check. |
| OQ-2 | **Fewer than two independent RPCs.** The local development flow has one.                                                                                                                                                                                                                                                                                            | (A) fail closed always. (B) skip the check. (C) `minRpcQuorum` per environment, default 2; below it the check fails and the round is canceled, except in a local or preview environment that sets 1 and shows a degraded indicator.                                                                                                                                                                     | **Decided (TPO, 2026-10-15): C**, as W-26a states. B never; it removes the protection the check exists for.                                                                                                                                                                |
| OQ-3 | **The cash-out e2e (AC1) cannot run on Coin Flip.** Coin Flip has one step, and a win by the last step closes without a cash-out.                                                                                                                                                                                                                                   | (A) the preview stack also declares a multi-step game (Cash or Crash [3,3,4]) and T-12 plays it. (B) amend AC1 to a win and a loss.                                                                                                                                                                                                                                                                     | **Decided (TPO, 2026-10-15): A.** It keeps AC1 whole and proves the cash-out signing path. Needs the preview stack to certify a second game.                                                                                                                               |
| OQ-4 | **Who ships the first game iframe.** The Wrapper hosts a game; Coin Flip's interface has no owner in the first-release scope.                                                                                                                                                                                                                                       | (A) a minimal reference game in this repository, used by the e2e suite and as a sample. (B) the game developer's build, supplied by the preview stack.                                                                                                                                                                                                                                                  | **Decided (TPO, 2026-10-15): A**, served from a second origin in tests so the sandbox and origin checks are real. The production game stays the developer's.                                                                                                               |
| OQ-5 | **Signed `PlayerStart`.** The first-release text says "sign start". `PlayerStart` is deferred, and the backend's signing types do not include it.                                                                                                                                                                                                                   | (A) no signed start, as W-22 states. (B) add the type.                                                                                                                                                                                                                                                                                                                                                  | **Decided (TPO, 2026-10-15): A**, still to be confirmed with the signed-action spec.                                                                                                                                                                                       |
| OQ-6 | **How the kit gets the backend's contracts.** The Play API OpenAPI document, the Snapshot schema and vectors, the signed-action spec's vectors, and the signing vectors are owned by private repositories, and this repository must consume them without a git submodule.                                                                                           | (A) vendored copies with the source commit and a content hash noted, and a drift-check job that compares them with the published sources. (B) published packages (the Snapshot bundle, the OpenAPI document at a public address, the vectors as a package); the kit's data-only `contracts` package is then replaced by that dependency without touching any logic package. (C) a submodule (not used). | **Decided (TPO, 2026-10-15): vendor now, publish later (A, then B).** No submodule, and the kit does not wait for the backend to publish first. See [client-kit.md](./client-kit.md#how-the-kit-gets-its-contracts).                                                       |

## References

- [client-kit.md](./client-kit.md) (the repository),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md) (toolchain and
  signing decisions),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`
  (OpenAPI); the Snapshot schema `se.snapshot/1` with its golden vectors; the
  signed-action spec; the signing vectors (`test/vectors/signing.json` in the
  contracts repository); the verify API.
