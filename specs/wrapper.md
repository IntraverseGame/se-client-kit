# Wrapper

Status: **Draft, for human review.** This is the contract the Wrapper is built
and tested to. It takes effect for the code when the first release lands. The
[questions it raised](#decided-questions) (OQ-1 to OQ-7) were decided by the TPO
(the Technical Product Owner): OQ-1 to OQ-6 on 2026-10-15, OQ-7 on 2026-10-16;
none is open. The signed-action grammar, `T_0`, and the signing vectors belong
to the backend's signed-action spec and are only referenced here
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
- verifying the round's `CreateRoundAuth`, and the tip check, before the game is
  shown as ready; `PlayerCancel` when a check fails;
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
  - the checks the player makes on the backend's claims: the round's
    `CreateRoundAuth` and the tip check;
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
[client-kit/how-the-kit-gets-its-contracts.md](./client-kit/how-the-kit-gets-its-contracts.md).

## Contract

### Vocabulary

| Term              | Meaning                                                                                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapper           | The whole browser program: the shell and the UI.                                                                                                                                                                                                                                                                            |
| shell             | The headless part of the Wrapper that holds credentials, signs, and checks. The UI and the game cannot reach its secrets.                                                                                                                                                                                                   |
| game              | The developer's iframe. It renders Snapshots and asks for actions. It is untrusted.                                                                                                                                                                                                                                         |
| operator page     | The page of the operator that embeds the Wrapper (origin A).                                                                                                                                                                                                                                                                |
| SE origin         | The origin that serves the Wrapper. The Wrapper's code, its Play API calls, and its credentials live here.                                                                                                                                                                                                                  |
| game origin D     | The origin of the game iframe. A different registrable domain from the SE origin.                                                                                                                                                                                                                                           |
| launch code       | The single-use, short-lived secret in the fragment of the launch URL. The Wrapper redeems it once for a session (W-1, W-2).                                                                                                                                                                                                 |
| action key        | The per-session secp256k1 key the shell generates. Its address is bound to the round at start.                                                                                                                                                                                                                              |
| `CreateRoundAuth` | The backend's signed statement (EIP-712) over the exact arguments of the round's on-chain creation: round id, entropy source, target block `N`, round secret hash, bet, currency, action key, terms hash. Signed by the registry's admin signer, the configuration's `runtimeSigner`; it replaced the earlier bind receipt. |
| tip check         | The shell's check of the bind's block `N` against the final tip on independent RPCs.                                                                                                                                                                                                                                        |
| transcript        | The chain `T_0, T_1, ...` of hashes each signed action links to.                                                                                                                                                                                                                                                            |

### Requirements and traceability

Every requirement below, in this file and in the section files under
[`wrapper/`](./wrapper/), uses MUST, SHOULD, or MAY in the RFC 2119 sense. Each
is tied to a first-release requirement (R1 to R4) or acceptance criterion (AC1
to AC5), or to the security model the Wrapper exists to keep.

| Item | Text (short)                                                                                                                                            | Requirements                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| R1   | open a session from a launch code (read from the URL fragment only), hold the token only in memory, refresh before expiry                               | W-1 to W-8                                                       |
| R2   | generate the key locally, sign start, move, and cash-out per the signing vectors, verify the round's `CreateRoundAuth` before showing the game as ready | W-9 to W-27                                                      |
| R3   | render only from a validated Snapshot; handle `starting`, `active`, `resolving`, `won`, `lost`, `idle`, and the typed error                             | W-28 to W-38                                                     |
| R4   | show the round id and a verify-page link after the round ends                                                                                           | W-39, W-40; T-6, T-10                                            |
| AC1  | browser e2e: a win, a loss, and a cash-out against a preview stack                                                                                      | [Test plan](#test-plan) T-10 to T-12; [OQ-3](#decided-questions) |
| AC2  | the shared signature vectors pass in this repository's suite                                                                                            | T-1 to T-3                                                       |
| AC3  | Snapshot golden vectors render without error                                                                                                            | T-5, T-6                                                         |
| AC4  | no key or token in logs, URLs, or storage that survives the session                                                                                     | W-3, W-4, W-10 to W-12, W-41; T-13                               |
| AC5  | accessibility and network-failure error states covered by tests                                                                                         | W-42 to W-48; T-14, T-14a, T-15, T-16                            |

### Session open and the play token

W-1 to W-8: reading and redeeming the launch code, where the play token lives,
redaction, the token deadline and refresh, and idle time. See
[`wrapper/session-open-and-the-play-token.md`](./wrapper/session-open-and-the-play-token.md).

### The action key and what may be stored

W-9 to W-13: generating the action key, keeping it only in the shell's closure,
the storage rule, what may outlive a page, and serializing the key's use. See
[`wrapper/the-action-key-and-what-may-be-stored.md`](./wrapper/the-action-key-and-what-may-be-stored.md).

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
  <!-- TODO(signed-action spec): `T_0` is the Ready evidence hash, `keccak256(abi.encode(created, seedHash))` as the vendored signing vectors reproduce (W-26, check 4). The signed-action spec pins the byte encoding of its inputs; where the shell reads them from waits on the backend's Snapshot fields (W-26). -->
- **W-19.** On `STALE_ACTION` the shell MUST stop signing for that round, read
  the Snapshot, and adopt the outcome only if the Snapshot shows its action
  applied. Otherwise it shows the out-of-sync state and offers the verify link.
  The shell cannot recompute `T` from a Snapshot, so it never guesses a new
  `previous`.
  <!-- TODO(signed-action spec): the resynchronization rule, if the spec defines one. -->

### Signing start, move, cash-out, and cancel

W-20 to W-27: building canonical signatures with `signing`, the start, move,
cash-out, and cancel flows, the checks before the first signature, and keeping
each round's evidence. See
[`wrapper/signing-start-move-cash-out-and-cancel.md`](./wrapper/signing-start-move-cash-out-and-cancel.md).

### Rendering from the Snapshot

W-28 to W-36: rendering only a validated Snapshot, capabilities, statuses, `won`
and expiry, amounts, polling, and idempotency. See
[`wrapper/rendering-from-the-snapshot.md`](./wrapper/rendering-from-the-snapshot.md).

### The game iframe and the controller boundary

W-37 to W-40: the sandboxed game iframe on its own origin, which messages are
accepted, and what the Wrapper shows when a round ends. See
[`wrapper/the-game-iframe-and-the-controller-boundary.md`](./wrapper/the-game-iframe-and-the-controller-boundary.md).

### Error and degraded states

- **W-41.** No key, token, or launch code may appear in an error state, a
  notice, the document title, the DOM, the console, or the URL. The error states
  show the typed `code`'s message in the player's language and the problem's
  `requestId`, so support can find the call.
- **W-42.** Typed errors. The Wrapper branches on `code` and never on the
  message; it retries only when `retryable` is `true`, with the same
  `idempotencyKey`, a bounded number of times with backoff, then shows the
  error. Every `code` is one of the schema's closed `ErrorCode` list, so a
  problem with any other `code` fails validation (W-28) and shows the generic
  error state; for a listed `code` this table does not name, it falls back to
  `status` and `retryable` (the "any other" row).

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
| `runtimeSigner`   | the pinned address that signs `CreateRoundAuth` (W-26, OQ-7)     |
| `registryDomain`  | the pinned `chainId` and `verifyingContract` (W-26, OQ-7)        |
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
| The Snapshot says `active` but a check failed                                                      | The game is never shown (W-26); the cancel is signed only if `T_0` is settled, otherwise nothing is signed and the round ends by its expiry rule                |
| The Snapshot stays `starting`                                                                      | W-35 polling; the round is voided by the server's deadline and the Snapshot shows `idle` with a typed error; nothing was signed                                 |
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
the backend's claims (the round's `CreateRoundAuth`, the tip) before it signs.

## Observability

The Wrapper emits **no telemetry to the backend in the first release**: no
analytics, no error reporting, no third-party script. No endpoint exists for it
and none is invented here. The player and support work from the problem's
`requestId` shown in the error states (W-41), which the backend already logs.
The Wrapper's console output is `warn` and above, redacted (W-4), and holds no
document. A client-side error channel is a later decision with its own spec.

## Test plan

The suites live in this repository
([client-kit/testing-and-ci.md](./client-kit/testing-and-ci.md)). The backend
owns the vectors and the contracts they check. The unit, component, and e2e
suites that run against the in-repo fake Play API (`pnpm check` and the
`e2e-fake` job) are deterministic and hermetic: an injected clock, a seeded
random source, no network beyond that fake, no real key. The **preview-stack
e2e** (T-10 to T-12, and so AC1) is the exception: it talks to the SuperEngine
preview stack, so it is not hermetic, runs from the backend-owned job (see
[client-kit/testing-and-ci.md](./client-kit/testing-and-ci.md)), and is never
part of `pnpm check`.

| ID    | Level                        | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Covers                                |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| T-1   | unit, `signing`              | the contracts repository's `test/vectors/signing.json` vectors (domain separator, type hashes, `T_n`, digests, signatures, the registry authorizations), reproduced; read through the test-only entry of the `contracts` package, where the file is copied with its source commit; the action text and path are built only in the canonical spelling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | AC2, W-20, W-21                       |
| T-2   | unit, `signing`              | the worked-round vectors, and the negative cases: high `s`, bad `v`, wrong length, zero address, a changed `previous`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | AC2, W-21                             |
| T-3   | unit, `signing` and `shell`  | Sign then Recover round trips for random digests from a seeded source; signing is deterministic; key generation draws 32 bytes from the injected random source, redraws a zero or out-of-range value, and derives the address that the vectors give                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | W-9, W-21                             |
| T-4   | unit, `shell`                | the transcript: sequence and `previous` chaining; the same signed bytes and `idempotencyKey` on a resend; never two different actions at one sequence under a randomized sequence of failures, retries, and cancel against move; `STALE_ACTION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | W-15, W-16, W-17, W-18, W-19          |
| T-4a  | unit, `shell`                | session open: the launch code is read only from the fragment and removed from the URL before the first request and the first log line; a launch URL whose code is only in the query string is treated as having no code (nothing read, forwarded, logged, or stored, no redeem call, the session-ended state with the relaunch instruction); a redeem whose response is lost is not retried and ends in the session-ended state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | W-1, W-1a, W-2                        |
| T-4b  | unit, `shell`                | the signing flows: `start` carries a fresh `idempotencyKey`, the bet copied from the Snapshot's `Amount` fields, and the key address (W-22, W-36); a move is built only when legal and otherwise answered `reject` (W-23); cash-out on request only, and the automatic cash-out only when the backend leaves the round `active` at the last step, never when the move closed the round (W-24); cancel on a failed check, never together with a move at sequence 1 (W-25); nothing is signed on a message that is not a validated action request (W-13)                                                                                                                                                                                                                                                                                                                                                                                                                             | W-13, W-22, W-23, W-24, W-25, W-36    |
| T-5   | unit, `snapshot`             | every `valid/` vector validates and every `invalid/` vector fails at its `failsAt` pointer, with the `snapshot` package's evaluator; the files are the append-only set held in the `contracts` package (test-only entry), copied from the backend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | AC3, W-28                             |
| T-5a  | unit, `shell`                | the Snapshot is the only source of state: members of the objects the schema leaves open are ignored, a field the schema does not allow is rejected before the shell reads it, an absent field is not read as hidden state, a lower `version` is ignored; the capability declaration lists `steps` and all seven statuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | W-29, W-30                            |
| T-6   | unit/component, Wrapper      | every `valid/` Snapshot renders without error and in the state the status table gives, with no hidden-field access; `closeReason` is shown beside the status and `won` shows no credit wait; after a round ends the round id and the verify link are shown and stay until the player acts, and the link opens with `noopener noreferrer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | AC3, R4, W-31, W-32, W-33, W-39, W-40 |
| T-6a  | unit, `snapshot` and Wrapper | money: amounts above 2^53 and at 2^256 - 1 are compared as `bigint`, `formatted` is displayed, no number type is used for an amount, and `normalized` is never used for a decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | W-34, W-48                            |
| T-7   | unit, `shell`                | the token schedule (W-6): refresh point from a fixture's `tokenExpiresAt`, single flight, lost response retried, no keep-alive calls (W-8); a retryable refresh failure is retried with bounded backoff while the old token is valid, and `SESSION_EXPIRED`, `SESSION_REVOKED`, `UNAUTHENTICATED`, or a token past its deadline end the session: signing stops and the key and token are discarded (W-7); the injected clock                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | W-5, W-6, W-7, W-8                    |
| T-7a  | unit, `shell`                | redaction: the key, token, and launch code types print `[redacted]` under `String()`, `JSON.stringify`, template literals, and the inspect hook; errors and log lines carry no header or body; nothing returns the key; no export or global holds it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | W-4, W-10, W-12, W-41                 |
| T-8   | unit, `shell`                | the bind verification (W-26): a good `CreateRoundAuth` passes; a Snapshot domain or signer that differs from the configuration, a field missing by `active`, a wrong signer, wrong round, wrong key, wrong bet, wrong `N`, wrong secret hash, or a recomputed `T_0` that differs from `readyHash` each fail with `T_0` not settled, and nothing is signed, not even `PlayerCancel`; a tip-check failure with `T_0` settled signs only the required `PlayerCancel`; the tip check (W-26a, W-26b) with exactly `minRpcQuorum` endpoints answering and none disagreeing (pass), one outlier among three (fail), too few answering (fail), a block-hash mismatch at `h_low` (fail), and a disagreement beyond the lag margin (fail); the observed tip is `h_top`; the round's evidence records every endpoint's answer; the boot rule refuses `production` with `minRpcQuorum` below 2 and accepts `local` and `preview` with 1 plus the degraded indicator and `tipCheck: "degraded"` | R2, W-26, W-26a, W-26b                |
| T-8a  | unit, `shell`                | configuration and timeouts: a configuration in which two endpoints share a provider is refused, and so is a source with fewer configured endpoints than `minRpcQuorum` (W-26b); polling backoff while `starting` or `resolving`, the slow rate after a long wait, a stop at a terminal status or session end, and a request timeout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | W-26b, W-35, W-43                     |
| T-9   | unit, `shell`                | the controller boundary: wrong `source`, wrong origin, bad schema, unknown `type` are ignored; the game never receives a field outside the allow-list (property test over a recorded session)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | W-37, W-38                            |
| T-9a  | unit and e2e                 | operator embedding: a message is accepted only if `event.source` is `window.parent` and `event.origin` is in `operatorOrigins` (a wrong source with a listed origin is ignored too), and replies use a listed origin only; **both paths** are tested: with `location.ancestorOrigins` present, a Wrapper framed by an unlisted origin refuses to start; with it absent (the Firefox path), nothing is signed before a handshake from a listed origin, and a handshake from an unlisted origin does not unlock signing                                                                                                                                                                                                                                                                                                                                                                                                                                                              | W-49                                  |
| T-10  | e2e, browser                 | a **win** against the preview stack, including the start, the move, the `CreateRoundAuth` and tip checks, and the round id and verify link at the end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | AC1, W-22, W-23, W-26, W-39           |
| T-11  | e2e, browser                 | a **loss**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | AC1, W-23, W-39                       |
| T-12  | e2e, browser                 | a **cash-out** (needs a game with more than one step; [OQ-3](#decided-questions)); and the automatic cash-out case against a fake Play API that leaves the round `active` at the last step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | AC1, W-24, W-25                       |
| T-13  | e2e, browser                 | **no secret** after a whole session (launched through the fragment, so no launch code is ever in a request URL), a reload, and the session's end: no launch code, play token, or key (the e2e stubs `crypto.getRandomValues` with Playwright's `addInitScript`, so it knows the key's bytes, hex, and base64 forms, and tests the unmodified release bundle) in any console message, request or response URL, document URL and history, `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, or service worker registrations; the player-started evidence download is the only write out and leaves no copy                                                                                                                                                                                                                                                                                                                                                        | AC4, W-3, W-4, W-11, W-12, W-27       |
| T-14  | e2e + automated audit        | accessibility: an axe scan of every status and error state, and keyboard-only play of a round, with a visible focus indicator and no keyboard trap, and text labels in the session's language                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | AC5, W-45, W-48                       |
| T-14a | e2e, browser                 | live regions and visual rules: a status change is announced through a polite live region and an error through `role="alert"`; focus moves to the result or error heading only after the player's own action, never after a poll; win, loss, and error carry text and an icon beside colour; `prefers-reduced-motion` is honored; the UI works at 200 % zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | AC5, W-46, W-47                       |
| T-15  | e2e, browser                 | offline: the network is cut during `starting`, during `resolving`, and during a signed action; the connection-problem state appears, the round is not lost, and no second action is signed at the sequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | AC5, W-16, W-43                       |
| T-16  | e2e, browser                 | typed errors: each row of the W-42 table with a fake Play API that returns it, and each degraded state of W-44 shown distinctly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | AC5, W-42, W-44                       |
| T-17  | e2e, browser                 | two tabs: the second tab of one session does not get the lock and does not sign                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | W-14                                  |
| T-18  | e2e, browser                 | the sandbox: a malicious test game that tries to read the parent's storage, the token, and the key, and to post forged messages, gets nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | W-37, W-38                            |

The e2e suite runs in two places: against an in-repo fake Play API on every
change here, and against the SuperEngine preview stack from a job owned by the
backend repository that builds this repository at a pinned commit
([client-kit/testing-and-ci.md](./client-kit/testing-and-ci.md)).

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

The questions this spec raised were decided by the TPO: OQ-1 to OQ-6 on
2026-10-15, OQ-7 on 2026-10-16. Each row keeps the question, the options, and
the decision. The spec follows the decision.

| ID   | Question                                                                                                                                                                                                                                                                                                                                                            | Options                                                                                                                                                                                                                                                                                                                                                                                                 | Decision                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-1 | **Storage that survives a reload.** The first-release acceptance criteria forbid a key or token in "storage that survives the session". An earlier design note asked for the key to be kept in persistent storage for the session's lifetime, so a reload could continue the round. Both cannot hold, and the backend does not hand an open round to a new session. | (A) memory only; a reload forfeits the round by its expiry rule. (B) `sessionStorage`, which survives a reload and is copied by a duplicated tab. (C) IndexedDB, which survives the browser and needs a way to protect the key.                                                                                                                                                                         | **Decided (TPO, 2026-10-15): A for the first release.** A reload needs a new launch and a new session anyway, so B and C buy nothing until a round can be handed over across sessions. Revisit with that feature (a backend change) and with the post-round receipt check.                                                                                           |
| OQ-2 | **Fewer than two independent RPCs.** The local development flow has one.                                                                                                                                                                                                                                                                                            | (A) fail closed always. (B) skip the check. (C) `minRpcQuorum` per environment, default 2; below it the check fails and the round is canceled, except in a local or preview environment that sets 1 and shows a degraded indicator.                                                                                                                                                                     | **Decided (TPO, 2026-10-15): C**, as W-26a states. B never; it removes the protection the check exists for.                                                                                                                                                                                                                                                          |
| OQ-3 | **The cash-out e2e (AC1) cannot run on Coin Flip.** Coin Flip has one step, and a win by the last step closes without a cash-out.                                                                                                                                                                                                                                   | (A) the preview stack also declares a multi-step game (Cash or Crash [3,3,4]) and T-12 plays it. (B) amend AC1 to a win and a loss.                                                                                                                                                                                                                                                                     | **Decided (TPO, 2026-10-15): A.** It keeps AC1 whole and proves the cash-out signing path. Needs the preview stack to certify a second game.                                                                                                                                                                                                                         |
| OQ-4 | **Who ships the first game iframe.** The Wrapper hosts a game; Coin Flip's interface has no owner in the first-release scope.                                                                                                                                                                                                                                       | (A) a minimal reference game in this repository, used by the e2e suite and as a sample. (B) the game developer's build, supplied by the preview stack.                                                                                                                                                                                                                                                  | **Decided (TPO, 2026-10-15): A**, served from a second origin in tests so the sandbox and origin checks are real. The production game stays the developer's.                                                                                                                                                                                                         |
| OQ-5 | **Signed `PlayerStart`.** The first-release text says "sign start". `PlayerStart` is deferred, and the backend's signing types do not include it.                                                                                                                                                                                                                   | (A) no signed start, as W-22 states. (B) add the type.                                                                                                                                                                                                                                                                                                                                                  | **Decided (TPO, 2026-10-15): A**, still to be confirmed with the signed-action spec.                                                                                                                                                                                                                                                                                 |
| OQ-6 | **How the kit gets the backend's contracts.** The Play API OpenAPI document, the Snapshot schema and vectors, the signed-action spec's vectors, and the signing vectors are owned by private repositories, and this repository must consume them without a git submodule.                                                                                           | (A) vendored copies with the source commit and a content hash noted, and a drift-check job that compares them with the published sources. (B) published packages (the Snapshot bundle, the OpenAPI document at a public address, the vectors as a package); the kit's data-only `contracts` package is then replaced by that dependency without touching any logic package. (C) a submodule (not used). | **Decided (TPO, 2026-10-15): vendor now, publish later (A, then B).** No submodule, and the kit does not wait for the backend to publish first. See [client-kit/how-the-kit-gets-its-contracts.md](./client-kit/how-the-kit-gets-its-contracts.md).                                                                                                                  |
| OQ-7 | **The trust anchor of the `CreateRoundAuth` check.** The backend replaced the bind receipt with the registry's `CreateRoundAuth`, signed per round. The Play API exposed neither it nor the signing domain and signer address it is checked against.                                                                                                                | (A) trust the domain and signer the Snapshot sends. (B) pin `chainId`, `verifyingContract`, and the signer per environment in the configuration, and check the Snapshot's per-round values against them. (C) read them from the registry on-chain.                                                                                                                                                      | **Decided (TPO, 2026-10-16): B now, C added in a later increment.** The Snapshot (`se.snapshot/1`) will carry the `CreateRoundAuth`, the fields to recompute `created`, the domain, and the signer as optional, additive fields; the shell refuses any mismatch with the pinned values (W-26). A alone never: a value the response supplies cannot vouch for itself. |

## References

- [client-kit.md](./client-kit.md) (the repository),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md) (toolchain and
  signing decisions),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`
  (OpenAPI); the Snapshot schema `se.snapshot/1` with its golden vectors; the
  signed-action spec; the signing vectors (`test/vectors/signing.json` in the
  contracts repository); the verify API.
