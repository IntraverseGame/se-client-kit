# The `shell` package

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`shell` is built in slices. Four exist today: the redacting types and logger,
key custody, the signer lock, and the transcript state (W-4, W-9 to W-19, W-41
as far as the shell is concerned); then the chain configuration, the tip check,
and the decision it leads to (W-26a, W-26b, and W-26's pass or fail); then the
`CreateRoundAuth` and `T_0` checks (W-26 items 1 to 5), the re-issue rule, and
the round's verdict that combines them with the tip check; then the
`se.controller/1` game bridge (W-37, W-38, and W-23's pre-check) and the
`se.operator/1` operator channel (W-49b to W-49d); then the round flows (start,
move, cash-out, the required cancel, the W-16 resend, and the W-19
resynchronization), the pick use case, and the UI's Snapshot reader; then the
session (the launch code, the redeem, the play token and its refresh, and the
UI's use cases over the round flows). The Wrapper requirements each rule serves
are in brackets.

- **Public API.** The redacting logger (`createLogger` and its types),
  `REDACTED`, `ShellError` with its `ShellErrorCode`, the chain configuration's
  validation (`validateChainConfig`, `DEFAULT_MIN_RPC_QUORUM`, and the types
  `ChainConfig`, `ChainConfigResult`, `ChainConfigIssue`,
  `ChainConfigIssueCode`, `Environment`, `SourceConfig`, `RpcEndpoint`), the RPC
  transport types (`RpcTransport`, `RpcCall`, `BlockTag`), and the game bridge
  (`createControllerBridge` with its option, result, and state types) with the
  `se.controller/1` message types (`CONTROLLER_SCHEMA`, `ROUND_STATUSES`,
  `HelloMessage`, `ActionMessage`, `SnapshotMessage`, `RejectMessage`,
  `GameSnapshot`, `GameStep`, `GamePlaybackSnapshot`, `GameBookDraw`,
  `GameBookEvent`, `GameEventData`, `GameJsonValue`, `Pick`, `RejectReason`, and
  the unions), the operator channel (`createOperatorChannel`,
  `HANDSHAKE_TIMEOUT_MS`, and the types `OperatorChannel`,
  `OperatorChannelState`, `OperatorCheck`, `OperatorMessageEvent`,
  `OperatorWindow`, `HandshakeOutcome`, and `HandshakeRefusal`) with the
  `se.operator/1` message types (`OPERATOR_SCHEMA`, `MAX_RESIZE_HEIGHT`,
  `OperatorHello`, `WelcomeMessage`, `ResizeMessage`, and
  `OperatorBoundMessage`), and the UI's Snapshot reader (`createSnapshotReader`
  with `SnapshotReader`, `SnapshotReaderOptions`, and `SnapshotRead`, and the
  re-exported `ValidSnapshot` and `ValidPlayProblem` of the `snapshot` package),
  and the session: `takeLaunchCode` and `discardLaunchCode` with
  `MAX_LAUNCH_CODE_LENGTH` and the types `LaunchCode`, `LaunchLocation`, and
  `LaunchHistory`; `openPlaySession` with `PlaySessionOptions`, `SessionParts`,
  `SessionOpening`, `PlaySession`, `SessionRead`, `RoundState`, `GameMount`,
  `GameMountOptions`, `Bet`, `BindMode`, `FailReason`, and `CancelState` (the
  required cancel's states, which `RoundState.cancel` gives); `isRoundOver` with
  `RoundEnd`; and the re-exported platform types of `play-client` the session
  takes (`Clock`, `FetchLike`, `RefreshConfig`, `TimerHandle`), since the
  Wrapper imports only `shell`. The validation is public because the Wrapper
  applies W-26a's boot rule before it starts; the transport types because the
  Wrapper supplies the transport (it owns `fetch` and the Content Security
  Policy); the bridge because the Wrapper mounts the game iframe and owns the
  window it talks through; the operator channel because the Wrapper routes the
  parent window's messages to it and awaits its handshake before it opens the
  session; the reader because the Wrapper UI renders only what the shell
  validated (decided in human review, 2026-10-17). The protocol types are also
  exported, as types only, at the subpath
  `@intraverse/se-client-shell/controller` (`src/controller.ts`, a `types`
  condition only, no value): the message types, `GameSnapshot`, `GameStep`,
  `GamePlaybackSnapshot`, `GameBookDraw`, `GameBookEvent`, `GameEventData`,
  `GameJsonValue`, `Pick`, `Presentation`, `RoundStatus`, and `RejectReason`,
  for the `reference-game` app ([The reference game](./the-reference-game.md)).
  Key custody, the signer lock, the transcript state, the tip check, its
  decision, the `CreateRoundAuth` checks, the round's verdict, the round flows,
  the pick use case, and the token keeper are internal: the UI gets use cases
  and read-only state, never a signing capability ([Packages](./packages.md)).
  The round flows are reached only through the session's use cases (decided with
  the session, 2026-10-17).
- **The launch code (W-1, W-1a).** `takeLaunchCode(location, history)` reads
  `location.hash` and `location.href` once, removes the fragment with
  `history.replaceState(null, "", <href without the fragment>)` whenever the URL
  has one, and returns the code sealed as a `LaunchCode`, or `undefined` when
  there is none: no fragment, an empty one, or more than 128 characters of the
  raw hash without its `#`, not decoded. The prefix is not checked, and the
  query string is never read. A `replaceState` that throws returns `undefined`,
  so a code still in the URL is never redeemed. The Wrapper calls it first,
  before any request. `discardLaunchCode(code)` forgets a code that will not be
  redeemed (the Wrapper refused its configuration or its framing, so no session
  opens): its text can no longer be read, and `undefined` is a no-op.
- **The session (W-1 to W-14, W-22 to W-26, W-37).** `openPlaySession(options)`
  builds the Play API transport from `playApiBaseUrl` and the Wrapper's `fetch`
  (play-client's `createTransport`, W-3, W-43) and resolves with a
  `SessionOpening`. Its options also carry the configuration's `gameOrigins` and
  the Wrapper's own origin (`ownOrigin`), copied at open: the session's
  `mountGame` checks D against these, never against a list the UI gives (W-37).
  D itself is the redeem answer's `gameOrigin`, fixed at open: no option can
  give it, and a redeem answer without one is `redeem-failed` (play-client
  refuses it), so no session opens without D:
  - `no-launch-code` when the code is `undefined` (nothing is sent);
    `redeem-failed` after a refused, lost, or unreadable redeem, which is sent
    once and never repeated (W-2); the code is forgotten after the redeem;
  - `other-tab` or `unsupported` when the page does not get the signer lock
    (W-14): the token is forgotten and nothing is read, refreshed, or signed;
  - `open` with the `PlaySession`. The signing session's domain is the
    configuration's `registryDomain` with the published name and version. The
    token keeper holds the play token sealed and gives the transport its
    `Authorization` per attempt; it refreshes it at play-client's `refreshAtMs`
    over `tokenExpiresAt` and the redeem's `Date` offset, one refresh at a time,
    replacing the token only once the answer arrived; after a retryable failure
    (no answer, or a problem with `retryable: true`) it tries again after
    play-client's backoff while the old token is valid; a refusal that does not
    end the session leaves the old token in use until its deadline. The session
    ends (the key is destroyed, the token forgotten, and the end listeners are
    called once) on the deadline, on `SESSION_EXPIRED`, `SESSION_REVOKED`, or
    `UNAUTHENTICATED` to the refresh or to any other call, or on `end()`. No
    call is made only to keep the session alive (W-8). The `PlaySession`
    (frozen, `[redacted]`) gives:
  - `read()`: the Snapshot read (`SnapshotRead`), whose validated Snapshot, or
    the one a `ROUND_ACTIVE` problem embeds, is first observed by the current
    round's flow (its checks) and sent to the game's bridge. While the round's
    cancel is `in-flight`, `settling`, or `check-later` (W-25; below), a
    Snapshot read from elsewhere (of the round, `idle`, or another round) is
    neither sent to the game nor seen by the round guard: the answer is the
    round's latest Snapshot, and the game is sent nothing (it gets the round
    from the cancel's own answer or read). The round is the session's from
    before its first Snapshot is read (`startRoundFlow`'s `onFlow`), so a read
    while `start` signs and sends the cancel that Snapshot requires is held too.
    Otherwise, when observing the read led to a newer Snapshot of the round (by
    `version`: the answer to the W-16 resend the read caused), the answer is
    that Snapshot, and the game is sent it, never the read's older one. The hold
    that decides is the one of the session's round once the read was observed,
    so a read of a previous round that a new round's start overtook is held by
    the new round's cancel, and passes on as it is once that cancel settled.
    While the cancel is `settling`, `read()` is the flow's counted read
    (`refresh`), and from `check-later` its "check again" read (`checkAgain`),
    never `getSnapshot` through the reader and `observe` (the cancel's gate
    drops those); its answer is the round's latest Snapshot, or the read's new
    failure. Once the cancel is `ended`, a read passes `idle` on as usual, to
    the game too: the read that ended it gives the round's latest Snapshot (the
    one before the cancel), so the Wrapper reads once more for the current
    balance and Snapshot (W-33, W-35). The read side lives in
    `session-reads.ts`;
  - `checkAgain()`: "check again" (W-35): from `check-later`, one read under the
    cancel's settling rules, which may settle it; otherwise the same as
    `read()`;
  - `start(bet)`: the round flow's start; the answer is the round's Snapshot, a
    typed error (a `ROUND_ACTIVE` round is shown but not held: nothing is signed
    in it), `rejected`, `network`, or `refused` with a `ShellErrorCode`. One
    start or cash-out runs at a time: a `start` while another start or a
    cash-out is in flight is `refused` with `busy`, and a `start` while the
    round the session holds is open is `refused` with `round-exists`: while its
    cancel is `in-flight`, `settling`, or `check-later`, whatever the session
    read, and otherwise while it is not over (the flow's `over()`, `true` once
    the cancel is `ended`) and the latest Snapshot the session saw is of that
    round; neither signs or sends anything, so a late answer never replaces the
    held round. Outside the cancel's states, a read that shows the round over,
    `idle`, or another round lets the next `start` through;
  - `cashOut()`: the flow's cash-out, on the player's request only; its answer
    is the round's latest Snapshot, or the call's new failure. A `cashOut` while
    a start or a cash-out is in flight is `refused` with `busy`, and nothing
    more is signed or sent. The answer of an action (a start, a read, a pick, or
    a cash-out) during which the cancel reached `settling`, `check-later`,
    `sent`, `not-taken`, or `ended` is the round's Snapshot, not the failure of
    the cancel's call or of a read on the way: the flow's `lastError()` is its
    last failure and is never cleared, so an action compares it, by identity,
    with the one before it, and the cancel state with the one before it (the #61
    review found the start answering with the cancel call's failure);
  - `round()`: `RoundState`, the read-only state of the current round: the
    verdict (`checking`, `ready`, `failed` with what is shown), whether it is
    out of sync, whether a cash-out is offered (`cashOutOffered`: the flow's
    gate and legality, with nothing signed), the required cancel's state
    (`cancel`: `none` until it is reached; W-25, W-33, W-35), and, only while it
    holds, `unconfirmed` (`move` or `cash-out`): the flow's `unconfirmed()`, the
    move or cash-out not confirmed (W-16, below); and `pending` (`move` or
    `cash-out`; RFC-004, 2026-10-30), the flow's `pending()`, derived and read
    only: the round signer's pending move or cash-out (`RoundSigner.pending()`,
    never a cancel) while the signer's phase (`phase()`) is `open` or `adopted`,
    and absent otherwise: set from the signature (recorded before its send)
    until a Snapshot shows the action applied; absent once a final answer has
    held signing (`stale` after a 400 or 409, W-19, where the action stays
    pending inside the signer until a read shows it applied or out of sync),
    once the round is out of sync, re-issued, failed, or over, and once the
    session has ended; kept beside `unconfirmed` after the lost resend; with no
    signature, key, or bytes
    ([A pick during an error or offline](../wrapper/the-single-screen.md#a-pick-during-an-error-or-offline));
  - `gameOrigin()` and `mountGame(options)`: the controller bridge for D with
    the session's pick use case, which answers the game and reports the answer's
    Snapshot through `onChange`, and the session's own `gameOrigins` and
    `ownOrigin` (the options, `GameMountOptions`, are only the frame, its
    message listener, and the incompatible-game notice; a list or an origin a
    caller adds is overridden). `gameOrigin()` is D, unchecked (the bridge
    checks it at mount); an accepted `mountGame` also returns `gamePath`, the
    redeem answer's page path on D (`/` when the answer has none; W-37), and
    `mountGame` refuses `session-ended` once the session ended;
  - `onChange`, `onEnd`, `ended()`, and `end()`. Every answer is a validated
    Snapshot, a validated typed error, or a closed code: no key, token, launch
    code, signature, or transcript. The session logs nothing.
- **Whether a round is over (W-35, W-39).**
  `isRoundOver({ status, closeReason })` is the kit's one check from a Snapshot:
  `won`, `lost`, and `canceled`, with or without a `closeReason` (`canceled` is
  final in `se.snapshot/1` as vendored from b27afc5;
  [how the kit gets its contracts](./how-the-kit-gets-its-contracts.md), rule
  4). The transcript state's `closed` reading and the Wrapper's polling and
  rendering read it. While the shell's own cancel has not settled (the round
  flow's cancel state `in-flight`, `settling`, or `check-later`; below), the
  round is not over whatever a Snapshot from elsewhere shows: those Snapshots do
  not reach the round. The round flow's `over()` folds the cancel in: `true`
  once the cancel is `ended` (the round's latest Snapshot is still the one from
  before), `false` while it is `in-flight`, `settling`, or `check-later`, and
  otherwise `isRoundOver` of the latest Snapshot; the Wrapper applies the same
  rule to the cancel state the session gives (`RoundState.cancel`).
- **The Snapshot reader (W-28, W-42, W-43).** `createSnapshotReader` takes the
  Play API transport and the play token's `Authorization` and returns `read()`
  and `latest()`. `read()` calls `getSnapshot` and resolves with one of:
  `snapshot` (the body passed the `snapshot` validator), `problem` (a problem
  body that passed the `PlayProblem` validator, a `ROUND_ACTIVE` one with its
  embedded Snapshot validated too), `rejected` (a body that did not validate, or
  a response the client could not read), or `network` (no response). `latest()`
  is the last Snapshot a read validated. What it returns is data: no key, no
  token (the reader never calls the `Authorization` itself; the transport does,
  per attempt), and no signing capability. The reader is frozen and prints
  `[redacted]`, and it logs nothing. Only the shell or the Wrapper's composition
  root, which owns the session, builds a reader (decided in human review,
  2026-10-17): only the reader object reaches the UI, never its options, the
  transport, or the `Authorization`.
- **Redacting types (W-4).** Everything that holds a secret, or a closure over
  the key, prints `[redacted]` under `String()`, `JSON.stringify`, template
  literals, `Symbol.toPrimitive`, and Node's inspect hook
  (`Symbol.for("nodejs.util.inspect.custom")`). The four hooks sit on a shared,
  frozen prototype, so the object has no own property a walk or a
  `structuredClone` could copy. A play token or launch code is a sealed `Secret`
  whose text is kept in a module-private `WeakMap`: only the shell's own
  `revealSecret` reads it, and `disposeSecret` forgets it. The key is never
  text: it stays in the closure of the `signing` signer the session holds.
- **The logger (W-4, W-41, the Wrapper's Observability).** `createLogger(sink)`
  has `warn` and `error` only (the Wrapper's console shows `warn` and above). A
  line is a fixed event name and a closed set of fields: `method`, `path`,
  `status`, `requestId`, `code`, and a `cause`, of which only the `name` and a
  string `code` are kept (never a message or a stack). Every value is checked at
  run time: an event that is not a fixed lowercase name, a method that is not
  capital letters, a path that is not absolute or holds a space, `?`, or `#`, a
  status that is not an integer from 100 to 599, and a `requestId`, `code`, or
  name that is not a short token print as `[redacted]`; any other field is
  dropped. A sealed secret prints as `[redacted]`, but a secret given as plain
  text in a well-formed field cannot be recognized: the protection is that only
  the shell supplies the fields and it never passes secret text. The sink
  receives a frozen plain record; a sink that throws is ignored. The shell
  itself logs nothing yet.
- **Errors.** `ShellError` has a stable `code` (`lock-not-held`,
  `session-ended`, `invalid-input`, `key-generation`, `round-exists`,
  `equivocation`, `round-stopped`, `snapshot-rejected`) and a fixed message per
  code that never carries an input value (W-41).
- **The chain configuration (W-26a, W-26b, the Wrapper's Configuration).**
  `validateChainConfig(document)` reads the chain part of the parsed environment
  configuration document and returns `{ ok: true, config }` (typed, deeply
  frozen) or `{ ok: false, issues }`, each issue a `code` and a dotted `field`,
  never a value. It reads `environment` (`production`, `preview`, or `local`),
  `runtimeSigner` (a non-zero address), `registryDomain` (`chainId`, a positive
  integer, and `verifyingContract`, a non-zero address), `rpcEndpoints` (per
  entropy source, named as the Snapshot's `proofs.randomnessProof.source`, a
  non-empty list of `{ provider, url }`: the provider a short token, the URL
  `https:`, or `http:` on a loopback host only, with no credentials, query
  string, or fragment), `entropyChainId` (per source, the chain id the source's
  blocks are on, an integer of at least 1 and at most 2^53 - 1, required for
  each source and only for those), `minRpcQuorum` (an integer of at least 1,
  default 2), and `tipLagMargin` (per source, a non-negative integer of blocks,
  required for each source and only for those). Other fields are the Wrapper's
  and are ignored. Addresses are kept lowercase (their case is not checked
  against EIP-55); block counts and chain ids become `bigint`. It refuses
  (`code`): `production-quorum`, the boot rule, `production` with `minRpcQuorum`
  below 2; `shared-provider`, two endpoints of one source with one provider
  (names compared without case) or one URL (one provider may serve two sources);
  `quorum-unreachable`, a source with fewer endpoints than `minRpcQuorum`; and
  `invalid-environment`, `invalid-signer`, `invalid-domain`, `invalid-quorum`,
  `invalid-endpoints`, `invalid-entropy-chain-id`, and `invalid-lag-margin` for
  a missing or malformed field. `local` and `preview` may set `minRpcQuorum` to
  1: the config is then `degraded`, the Wrapper shows the "chain check not
  independent (development)" indicator, and every tip check records
  `tipCheck: "degraded"`. The Wrapper refuses to start on any issue. This
  configuration is the only trust anchor of the chain checks: the signer
  address, the registry domain, and each entropy source's chain id are pinned
  per environment, and a Snapshot's or a response's copy of them is compared
  with it, never used in its place.
- **The tip check (W-26b, W-26a).** It runs over the endpoints the configuration
  lists for the round's source, through an injected `RpcTransport`
  (`(endpoint, call, signal?) => Promise<result>`: it sends one JSON-RPC 2.0
  request and resolves with its `result`, or rejects). There are no provider
  names or URLs in the code. It makes two rounds of calls, each in parallel:
  `eth_chainId` with `[]` and `eth_getBlockByNumber` with `["finalized", false]`
  to every endpoint, then `eth_getBlockByNumber` with `[h_low, false]` (`h_low`
  as a JSON-RPC quantity) to each endpoint that gave a final block. Each call
  times out on the injected clock (default 15 s, W-43) and has its own abort
  signal (from the platform `AbortController`; typed as `play-client`'s
  `CancelSignal`, since the kit compiles without the DOM library), aborted when
  that call times out and never otherwise; where the platform has no
  `AbortController` the signal is absent. A transport may ignore it, and a late
  answer is ignored. A rejection, a timeout, a transport that throws, and a
  `result` that is not a chain id (a canonical lowercase quantity of at most 64
  bits) or a block (an object whose `number` is such a quantity and whose `hash`
  is 32 bytes of hex) are no answer; a hash is kept lowercase. `h_top` and
  `h_low` are the maximum and minimum final block of the endpoints that answered
  (gave a final block). The check passes only if no endpoint reported another
  chain id than the source's configured one (answering or not), at least
  `minRpcQuorum` answered, each of them reported the configured chain id, each
  is at most `tipLagMargin` blocks behind `h_top`, each gave the block at
  `h_low`, and every hash at `h_low` is the same. The failures, in this order,
  are `chain-id-mismatch` (an endpoint reported another chain),
  `too-few-answered`, `chain-id-unavailable` (an answering endpoint gave no
  chain id), `lagging`, `hash-unavailable`, and `hash-mismatch`; a source the
  configuration does not list is `unknown-source` and no endpoint is asked. The
  order is by what each failure proves: a chain id mismatch is proof of an
  endpoint foreign to the source, so it comes first, whatever the rest; the
  quorum is a precondition of judging the rest; and the endpoints' identity
  (their chain id) comes before their content (lag and hashes). It never drops
  an outlier or picks a side. The record (frozen) holds the source, `passed`,
  the `failure`, `tipCheck` (`independent` or `degraded`), the observed tip
  `h_top` and `h_low` (`null` when no endpoint answered), the lag margin, the
  source's configured chain id, and every configured endpoint's answer in order:
  its provider, its chain id, its final block, and its hash at `h_low` (`null`
  for no answer). Block numbers and chain ids are `bigint`.
- **The decision (W-26, W-26b).** `decideChain(record, bind)` returns `pass`
  only if the check passed and the bind holds: for a `future` bind `N` is above
  `h_top`; for a `tip` bind `N` is at least `h_top` minus the lag margin.
  Otherwise it returns `fail`, with the record kept and a reason:
  `chain-unverified` ("could not verify the chain": `too-few-answered`,
  `chain-id-unavailable`, `hash-unavailable`, or `unknown-source`) or
  `verification-failed` ("this round failed verification": `chain-id-mismatch`,
  `lagging`, `hash-mismatch`, or a bind that does not hold, `failure: "bind"`).
  The session runs it through the Wrapper's JSON-RPC transport
  (`session-tip.ts`). A failure signs nothing by itself: per W-25 and W-26 the
  shell signs `PlayerCancel` (through the round's `signCancel`) as soon as the
  round is `active` only if `T_0` is settled and the round's `CreateRoundAuth`
  was not re-issued, and the player then sees the reason's text, with "and was
  canceled" added to "this round failed verification"; if `T_0` is not settled
  it signs nothing for the round, not even `PlayerCancel`, keeps the evidence,
  and the round ends by its game's expiry rule. The round's verdict (below)
  combines the decision with checks 1 to 5.
- **The `CreateRoundAuth` checks (W-26 items 1 to 5).** They read a validated
  Snapshot, the validated chain configuration (the only trust anchor, OQ-7), and
  what the shell sent in `start` (the action key's address and the
  `AmountRequest`'s `value` and `unit`). Checks 1 to 4 run on the round's first
  Snapshot that carries `proofs.createRoundAuth` and return `waiting` (a
  `starting` Snapshot without `proofs`), `passed` with the recomputed `created`,
  or `refused` with the first failing check's reason:
  1. `missing`: a Snapshot that carries `proofs` without
     `proofs.createRoundAuth`, or one past `starting` without either (an `idle`
     Snapshot too). A book Snapshot never carries the object, so a book round is
     refused here: the first release ships config games only, and book rounds
     are refused until a later increment defines their evidence (decided by
     human review, 2026-10-17; W-26). Decided (issue #146, 2026-10-28): the
     checks are not run on a book round at all; W-52 in
     [Book playback](../wrapper/book-playback.md) replaces them with the round's
     consistency rule, nothing is signed for a book round (W-51), and the bridge
     forwards its `playback` copy (W-38, RFC-003). A Snapshot that changes the
     session's presentation, model, `config.kind`, or `config.model` is W-53's
     changed session, final until a reload.
  2. `pinned-mismatch`: `domain.chainId`, `domain.verifyingContract`, or
     `signer` is not the configuration's `registryDomain` or `runtimeSigner`
     (addresses compared without case).
  3. `cross-field`: `newRound.roundId` is not the Snapshot `roundId`'s `bytes32`
     form; `newRound.roundSecretHash` is not
     `proofs.randomnessProof.roundSecretHash`; `newRound.actionKey` is not the
     shell's key address (without case); `newRound.betAmount` and the sent
     `value`, each read with `snapshot`'s `parseBaseUnits` into a `bigint`, are
     not equal or either is not base units; the sent `unit` and
     `newRound.currency`, each as ASCII `bytes32`, are not equal byte for byte,
     or either is not ASCII or is longer than 32 bytes; the source
     (`proofs.randomnessProof.source`) is not in the configuration, or
     `entropyChainId` is not the chain id it pins; or
     `newRound.randomnessTarget` is not
     `keccak256(abi.encode(bytes32 source, uint256 entropyChainId, uint256 blockNumber))`
     recomputed with the source as ASCII `bytes32` and the pinned chain id (a
     source longer than 32 bytes, or a block number that is not a safe integer,
     fails).
  4. `recover-mismatch`: `created = keccak256(abi.encode(newRound))` (the
     currency as ASCII `bytes32`) and the EIP-712 digest of `CreateRoundAuth`
     under the configured domain (`name` `"SuperEngine"`, `version` `"1"`, and
     the pinned `chainId` and `verifyingContract`, never the Snapshot's) are
     computed with `signing`'s `hashNewRound`, `hashCreateRoundAuth`,
     `domainSeparator`, and `typedDataDigest`; `recoverAddress` refuses a
     signature that is not canonical (W-21), and the address it recovers must be
     `runtimeSigner`. A field outside its type fails here too.

  Neither `expiry` nor `prepareWindow` is compared with a time: no clock is
  read. Check 5 runs once checks 1 to 4 passed: when the Snapshot carries
  `proofs.fairnessProof.readyHash`,
  `T_0 = keccak256(abi.encode(created, seedHash))` (`signing`'s `hashReady`,
  `seedHash` from `proofs.fairnessProof.seedHash`) must equal it
  (`ready-mismatch`); without it the result is `waiting` while `starting` and
  `missing` on any later status. `T_0` is settled only by check 5 passing. A
  re-issue is a later read whose `proofs.createRoundAuth` differs from the
  round's first one, compared field by field as validated JSON; a read without
  the object is not one.

- **The round's verdict (W-25, W-26).** `createRoundVerification` holds one
  round (by its Snapshot `roundId`; other rounds' and `idle` Snapshots are
  ignored) and takes its Snapshots and its tip-check decision. It keeps the
  first `proofs.createRoundAuth` and each distinct later one (the evidence,
  W-27), runs checks 1 to 4 once and check 5 until it decides, keeps the first
  tip decision, and returns one of: `checking` (nothing signed, the game not
  shown); `ready` with the settled `T_0`, once every check and the tip check
  passed and the round is past `starting` (the first move links to `T_0`, and a
  cancel the player asks for may be signed, W-25); or `failed` with the failure
  (a check's reason, `reissued`, or `tip-check` with the tip check's failure),
  what the player is shown (`verification-failed`, or `chain-unverified` for a
  tip check that could not read the chain), `T_0` when it was settled, and
  `cancel`. `cancel` is `true` exactly when `T_0` is settled, only the tip check
  failed, the round's latest Snapshot is `active`, and there was no re-issue:
  the round flow then signs `PlayerCancel` (with `signing`'s
  `hashPlayerCancel`). A tip check that fails before check 5 has run leaves the
  verdict `checking` until check 5 decides. A re-issue fails the round at any
  point, with `cancel` `false`, even after `ready` or after a tip-check failure
  that required a cancel.
- **The game bridge (W-37, W-38, W-23's pre-check).**
  `createControllerBridge(options)` takes the game origin D, the configuration's
  `gameOrigins` and `environment`, the Wrapper's own origin, the game frame's
  window (only its `postMessage`), a `listen` function that subscribes to the
  page's `message` events and returns the unsubscribe, the pick use case, and
  `onIncompatible`. It touches no global. It returns `{ ok: false, refusal }`
  without listening when D or the Wrapper's origin is not a serialized origin as
  `event.origin` gives it (a malformed host, a port above 65535, or an explicit
  default port included; `invalid-origin`), D is the Wrapper's origin
  (`same-origin`), D's host shares its comparison key (its last two labels; an
  IP literal or a single label is its own key) with the Wrapper's (`same-site`,
  W-37's registrable-domain rule without a public suffix list, ADR-007), except
  two loopback hosts when `environment` is `local`, or D is not on the
  allow-list (`origin-not-allowed`). The session gives the bridge the
  `environment` of the configuration it was opened with, beside the allow-list
  and its own origin; the UI's mount cannot. Otherwise it returns
  `{ ok: true, bridge }`: `sendSnapshot` takes a validated Snapshot (ignored
  when its `version` is below the latest given; its type is unchanged by W-38's
  hold (RFC-004, decided 2026-10-30), which is the session's: one rule,
  `game-hold.ts`'s `givenToGame`, gives `sendSnapshot` an `active` Snapshot only
  when its round is the session's current round with the verdict `ready` and not
  out of sync, evaluated after the round observed it, in `session-reads.ts`'s
  `show` and `session-play.ts`'s `mountGame` (its `atMount`); every other
  Snapshot is given as before), `state()` is `awaiting-hello`, `ready`,
  `incompatible`, or `closed`, and `close()` unsubscribes. A message counts only
  when its `source` is the frame and its `origin` is D; the parser reads only
  own data properties of a plain object, so no game code runs. The rules of the
  message set, the allow-list, and the order of the pick checks are in
  [W-38](../wrapper/the-game-iframe-and-the-controller-boundary.md). The game's
  copy of a Snapshot is built field by field from the allow-list, never by
  removing fields. It posts only with `targetOrigin = D` (a frame that throws on
  `postMessage` is ignored). The pick use case takes the pick and resolves with
  `{ accepted: true }` or `{ accepted: false, reason }`: it holds the round and
  the signing, so the bridge never sees a signed action, a key, or a token; one
  that throws or rejects answers `not_active`. The bridge's pre-check is an
  early filter only (a second pick for the same step can pass it once the first
  settles, before the answering Snapshot arrives, and a test shows it); the use
  case is the gate and MUST re-check W-23 against the shell's own latest
  validated Snapshot and refuse a step it has already signed (W-15). The bridge
  logs nothing.
- **A stale read of the round (W-29; decided by the human, 2026-10-28, #146).**
  A Snapshot of the round the shell holds whose `version` is lower than the
  round's latest is ignored (`isStale`, `snapshot-reading.ts`) before the
  round's tracking, its verification, and its transcript state see it: in a
  config round's `round-flow.ts` (its `observe`, and the cancel's reads into the
  round) and in `book-round.ts`, one rule for both. An equal `version` is read.
  W-16's resend keeps its own rule. The required cancel's own decision
  (`round-cancel.ts`, #163) compares versions with the same `isStale` before it
  settles or resends (the stale answer decided by the human, 2026-10-29): an
  answer or a read the cancel takes whose `version` is lower than the round's
  latest Snapshot (its host's `latest`) or than any of the cancel's own answers
  and reads is stale. A stale answer is taken like an answer that is not this
  round's Snapshot (it tells nothing, and the Snapshot is read), and a stale
  read is treated as no read; neither changes the cancel's state, allows its one
  resend, or is read into the round. An equal `version` is read. An action whose
  own answer was a stale read (`SessionRound.staleRead`, which names only the
  last Snapshot observed, compared with the one before the action) answers the
  UI with it, so the Wrapper drops it and reads again (W-35). So a stale read
  never moves `latest()` back, sends the verdict back to `checking` or to a
  required cancel, desynchronizes the transcript (W-19), reopens an ended round
  (`round-exists`), or reaches the game's copy at the mount.
- **Book playback in the shell (W-50 to W-56, #146; built).** The session's
  start (`startSessionRound`) holds a round whose first Snapshot is `playback`
  as a book round (`book-round.ts`): no transcript state, nothing signed, a pick
  or a cash-out refused `not_legal` with no request, a verdict that is `ready`
  from the start and `failed` ("this round failed verification") once W-52's
  values change, and an evidence of the start's request (its `idempotencyKey`,
  bet, and key address), each distinct `randomnessProof`, the first values, and
  each differing set. A later Snapshot of the round that carries no
  `randomnessProof` after one that did counts as a change. Every validated
  Snapshot passes the session's W-53 guard (`session-presentation.ts`) before
  the round's rules; the first one it refuses closes the game's bridge, and
  every use case then answers `{ kind: "session-changed" }` with nothing read,
  started, signed, or forwarded; the guard keeps the four fields' first and
  changed values, and nothing else. The shell validates every Snapshot (a read,
  an action's answer, a `ROUND_ACTIVE` problem's embedded one) with the
  `snapshot` validator, which refuses a book round at `active`, `resolving`, or
  `canceled` as the vendored schema does, first at `/status` (`/snapshot/status`
  in a problem); the shell has no status rule of its own for a book round. The
  bridge builds each Snapshot's copy when it is given it (before the `hello`
  too): a `playback` copy that fails closed is neither kept nor sent, the game
  keeps the last copy it was sent (sent at the `hello` if none was yet), and the
  optional `onCopy(copied)` option tells the Wrapper `false`, then `true` once a
  later copy is built.
- **The operator channel (W-49b to W-49d, ADR-006).**
  `createOperatorChannel({ parent })` takes the operator page's window (only its
  `postMessage`) and touches no global; the Wrapper routes the page's `message`
  events whose `source` is the parent to its `receive`. Until `check` it records
  the first well-formed `hello` from the parent, with its origin, and answers
  nothing. `check({ operatorOrigins, ancestorOrigins, clock, timeoutMs? })`,
  called once the configuration is validated, resolves with `{ ok: true }` or
  `{ ok: false, reason }`: a recorded `hello` is checked at once (its origin on
  `operatorOrigins` and equal to `ancestorOrigins[0]` where that list exists:
  accepted; any other: `operator-not-allowed`, final); otherwise the first valid
  `hello` after it is accepted, and with none within `timeoutMs`
  (`HANDSHAKE_TIMEOUT_MS`, 10 s, on the injected clock) it is
  `handshake-timeout`, final. Accepting fixes the operator origin and posts
  `welcome` to it; a later valid `hello` from that origin and the parent gets
  `welcome` again; every other message is ignored and never answered.
  `resize(height)` posts `{ schema, type: "resize", height }` only once open,
  only to the fixed origin, with the height rounded up and bounded to 1 to
  `MAX_RESIZE_HEIGHT` (16384), and never the same value twice in a row. A
  `hello` is read only through the own data properties of a plain object with
  exactly `schema: "se.operator/1"` and `type: "hello"`. It holds no key, no
  token, and no launch code, and logs nothing; the Wrapper logs the refusal
  (`embedding.refused`). `state()` is `recording`, `waiting`, `open`, or
  `refused`.
- **Key custody (W-9 to W-13).** A session generates its action key with
  `signing`'s `createSigner` on the first need (the first `address()` or
  signature), from the injected random source (the platform's
  `crypto.getRandomValues` by default): 32 bytes, redrawn while zero or not
  below the curve order, refused with `key-generation` after 16 invalid draws.
  The session exposes the address and the round states, never the key or a
  function that signs a digest; it is frozen and prints `[redacted]`. Its end
  zeroes the key bytes (best effort), releases the lock, and refuses every later
  signature with `session-ended`; the signed actions stay readable for the
  player-started export (W-27). Nothing is written to storage, a cookie, a URL,
  or a global.
- **The signer lock (W-14).** The session requests `se:signer:<sessionId>` once
  through the injected `navigator.locks` (exclusive, `ifAvailable: true`) and
  holds it until the session ends. The session id must be 1 to 256 printable
  ASCII characters. Its state is `signing` (held), `held-elsewhere` (the "open
  in another tab" state), `unsupported` (no lock manager, or a `request` that
  throws, rejects, or settles without answering: fail closed), `lost` (the
  platform ended the hold, for example a steal), or `ended`. A lock manager
  whose `request` never settles and never answers leaves the session's opening
  pending; the platform's API with `ifAvailable: true` always answers. Every use
  of the key, the first key generation included, checks the state first: a page
  that is not `signing` gets `lock-not-held` and draws no key. A page that did
  not get the lock does not ask again.
- **The transcript state (W-15 to W-19).** One per round, opened with the
  Snapshot `roundId` (UUIDv7 text), the `bytes32` round id, and the settled
  `T_0`; a second open of one round is `round-exists`. `T_0`'s type is
  `SettledInitial`, which only check 5 makes, so the state cannot be opened with
  an unchecked value (W-22, W-26). It sits on `signing`'s `createTranscript` and
  adds:
  - **Recorded before it is sent (W-15, W-16).** `sign` (a move or a cash-out)
    and `signCancel` return the signed action (message, struct hash, digest,
    signature, and an idempotency key drawn from the injected `randomUUID`
    before the signature) only after it is recorded as pending. While it is
    pending, the same request returns the same object (the same bytes and key)
    for a resend (a cancel is sent again only after a Snapshot read, W-25), and
    any other request is `equivocation`. A call that re-enters `sign` or
    `signCancel` from an injected function (the key source, the signer) is
    `equivocation` too, so a pending action keeps one idempotency key.
  - **Cancel against the first move (W-17, W-25).** `signCancel` signs
    `action = "cancel"`, an empty path, sequence 1, `previous = T_0`, hashed
    with `signing`'s `hashPlayerCancel`. It is `equivocation` once a move is
    signed, pending or applied, and a move after a cancel is `equivocation`. A
    round signs at most one cancel (W-15, W-25): after a refused cancel, a 400
    included, the shell reads the Snapshot and signs nothing at sequence 1
    again; the round ends by its expiry rule unless the Snapshot shows it
    `canceled`. A second call returns the same signed cancel, never a new one.
  - **`T` advances only on an applied Snapshot (W-18).** `observe` takes a
    validated Snapshot and returns what it shows: `other-round` (another round,
    or `idle`: nothing changes), `applied` (the pending move: `T` advances to
    its struct hash), `not-applied`, `closed` (`won`, `lost`, or `canceled`: the
    round takes no more signatures), or `out-of-sync` (progress the shell did
    not sign: it stops).
  - **A refused move or cash-out (W-19).** After a 409 `STALE_ACTION` (another
    action at an accepted sequence, or a wrong `sequence` or `previous`) or a
    400 `INVALID_ARGUMENT`, `stale` holds all signing for the round, the resend
    included, until the next Snapshot of the round decides (a `resolving` one
    decides nothing): when it shows the shell's own pending action applied, the
    outcome is adopted (`T` advances to it, the phase is `adopted`) and the
    round signs again from the next sequence; when it does not, the round is out
    of sync for good. Nothing is ever signed again at the refused sequence, and
    `previous` is never guessed. A terminal Snapshot closes it.
  - **Failed verification (W-26).** `fail` stops every new signature for the
    round and every resend, for good (the phase is `failed`); it is a no-op on a
    round already closed or out of sync.
  - **Re-issue (W-26).** `reissue` stops every new signature for the round, a
    cancel included (the phase is `reissued`), for good. `resendable` gives the
    pending move or cash-out a W-16 resend may send again in the `open`,
    `adopted`, and `reissued` phases, never while `stale`, and never a cancel
    (W-25). Snapshots are still read, so an applied move still advances `T`.
- **The round flows (W-16, W-19, W-22 to W-26).** `startRoundFlow` sends `start`
  with a fresh idempotency key, the bet (validated as an `AmountRequest`), and
  the action key's address; a page without the signer lock is `lock-not-held`
  before anything is sent, and an answer that is not a valid Snapshot of a round
  is `snapshot-rejected`. It signs nothing. A start whose round may exist
  (`startMayBeStored`: no response, a 503 `UNAVAILABLE` whatever its
  `retryable`, a bare 503, or a 500 `INTERNAL`) is sent once more, right away,
  with the same key and body (the Play API document since se-backend `075b850`:
  after a lost response, `UNAVAILABLE`, or `INTERNAL` the round may already have
  been started, and the same key and body answer it; a bare 503 is the kit's own
  reading of a lost response); the resend's answer is read as a first answer is,
  and its failure is thrown as a first failure is; the shell never sends it a
  third time (the transport's own repeats aside). The lock is checked again
  before the resend: a page that lost it sends nothing more (`lock-not-held`),
  nor does an ended session (`session-ended`). Any other failure is thrown with
  one send (W-22; decided in human review, 2026-10-19). The round's flow then
  reads every validated Snapshot of its round (`observe`, or `refresh` through
  `getSnapshot`) into the round's verdict, runs the injected tip check once
  (with the first Snapshot that carries `proofs.randomnessProof`, unless the
  verdict has already failed; a rejected tip check leaves the verdict
  `checking`), and opens the transcript state with the verdict's settled `T_0`
  only when the verdict is `ready`, or requires the cancel, and the page holds
  the lock.
  - **Move (W-20, W-23).** `pick` refuses a malformed pick (`invalid`), any pick
    while an action of the round is in flight or pending (`busy`), any pick
    unless the verdict is `ready`, the transcript state is `open` or `adopted`,
    and the page holds the lock (`not_active`), and otherwise checks it against
    the shell's own latest validated Snapshot: `active` (else `not_active`), a
    steps round whose `step` equals the moves the shell has seen applied, the
    step picked being the one at that position (`config.steps[step].index`), and
    the option below its `optionCount` (else `not_legal`). A step the shell has
    already signed a move for is `not_legal`, even when an older Snapshot shows
    it again. The path is the node ids of the steps survived, then the one
    played, the text `pick row <len(path) - 1> tile <option>` (`signing`'s
    `actionGrammar`). A refusal signs nothing; `accepted` means signed and sent
    at least once.
  - **Cash-out (W-24).** `cashOut` refuses as `pick` does, and needs at least
    one step survived and one left (Coin Flip, one step, never cashes out). Its
    path is the node ids survived, its text `cash out`.
  - **Sending (W-16).** The `typedData` of a move, a cash-out, or a cancel is
    `signing`'s `encodeTypedData` of the message's kind, text, path, sequence,
    and `previous` (the canonical encoding of `ActionTypedData`, pinned by the
    vendored `typed-data/` vectors), in base64, 1 to 4096 characters (else
    `invalid-input`, nothing signed). The encoding is the flow's own: no options
    type carries an encoder. A test passes another one only as the separate
    test-hooks argument of the internal constructors (`FlowTestHooks`:
    `startRoundFlow`, `createRoundFlow`, `createRoundDelivery`,
    `createRoundCancel`; the fail-closed tests pass one that changes the
    message), and the session passes none (decided in review of the round flows,
    2026-10-17). The typed data is encoded before the signature (an encoding
    that fails leaves nothing signed), the action is recorded with its body
    (key, round id, typed data, signature), then sent on its own route
    (`continue` or `cashOut`). The transport repeats a lost response or a
    retryable problem with the same bytes; `resend` sends the recorded body
    again later, in the phases `resendable` allows. Any other failure leaves the
    action pending.
  - **The lost action's one resend (W-16; decided in human review,
    2026-10-18).** The delivery keeps the move or cash-out whose last send had
    an unknown outcome (`lost`, `isUnknownOutcome`: no response, or a 503 not
    marked `retryable: false` after the transport's own retries, a 503 with no
    problem body included; a 503 marked `retryable: false` is not lost, as W-42
    reads `retryable`, and is never resent, nor is a 500 `INTERNAL`, though the
    Play API document since se-backend `075b850` says resending the same request
    after either is safe: the kit stays more conservative and the reads decide;
    decided in human review, 2026-10-19) until a send of it is answered. When
    the flow then observes a read of the round, the newest it has read by
    `version` (a late, older read decides nothing), that shows it `active` at
    the step before that action (`step = sequence - 1`), with the action still
    pending and `resendable`, it sends the recorded body again (the same bytes
    and idempotency key, nothing signed or encoded), once per action. The
    once-only state is the delivery's (`resendOnce`, `resent`), shared with the
    player actions' `resend`: after either path sent it again, the other sends
    nothing (`resend` answers `not_active`), and a read during that send, or any
    later read, sends nothing more. A read that shows the action applied, the
    step moved on, or the round not `active` (`resolving`, or over) sends
    nothing, and so does a phase `resendable` refuses (W-19's hold, a failed
    check, out of sync, or the session ended). A re-issued read still allows it
    (W-26: a resend is not a new signature); the required cancel, unlike it,
    resends nothing after a re-issue (W-25), and is never resent here. If the
    resend fails too, the action stays pending: the game's next pick and a
    cash-out are `busy`, and the round ends by a read that shows it applied or
    by its expiry rule.
  - **Not confirmed (W-16; decided in human review, 2026-10-19).** The flow's
    `unconfirmed()` is `move` or `cash-out` while that action's one resend was
    lost too (the delivery's `lost` action, `resent`, no call in flight), the
    action is still pending and `resendable`, and the round's latest Snapshot is
    `active`; otherwise `undefined`. A resend answered (by the round, or by a
    503 marked `retryable: false`, which is not lost) never gives it, nor does a
    first lost send. A read only clears it (the action applied, refused by W-19,
    out of sync, the round not `active`, or the session ended); it never leads
    to another send or signature, so the session's `checkAgain` (then `read`) is
    a read only. The flow's `pending()` (RFC-004, 2026-10-30) is the signer's
    pending move or cash-out, never a cancel, while the signer's phase is `open`
    or `adopted`, and `undefined` otherwise; it is the session's
    `RoundState.pending`, and stays set beside `unconfirmed()`.
  - **Resynchronization (W-19).** A 409 `STALE_ACTION` or a 400
    `INVALID_ARGUMENT` calls `stale` and reads the Snapshot; when the read
    fails, the round stays held until a later read decides.
  - **The required cancel (W-25, W-26).** When the verdict's `cancel` is set,
    the flow signs `PlayerCancel` once and sends it on `cancelRound` (never
    repeated by the transport); nothing is ever signed at sequence 1 again. The
    answer's Snapshot is read. After any failure the flow reads the Snapshot,
    and that read decides (below): after a 400 nothing more is sent, and a read
    that decides nothing leaves the cancel `refused`; after a lost send
    (`isUnknownOutcome`, the one definition for every action: no answer, or a
    503 not marked `retryable: false`, a bare 503 included), when the read (a
    fresh, successful one) shows the round `active`, at `step` 0, and not
    re-issued, the same signed bytes are sent again, once (decided by human
    review, 2026-10-17). A 503 marked `retryable: false` earns no resend but,
    like a 422, is no refusal: a failed read after it is settling (decided in
    human review, 2026-10-18). A 500 `INTERNAL` marked `retryable: false` is
    read the same way (`mayBeStored`), and earns no resend either: the Play API
    document since se-backend `65504f5` says that after a lost response,
    `UNAVAILABLE`, or `INTERNAL` the cancel may already have been taken, and
    allows a resend after the read, but after a 503 marked `retryable: false` or
    a 500 `INTERNAL` the kit reads and never sends the cancel again (an `active`
    read gives `not-taken`), more conservative than the document (decided in
    human review, 2026-10-19). A 500 with another code stays a refusal. A resend
    that is also lost is followed by another read and never a third send; a 422
    to it is read and never answered with another send. Nothing else is resent.
    The state is `unavailable` when the cancel is not sent: when the signed
    cancel does not match its typed data nothing is sent, the transcript state
    is `failed`, and `lastError()` is `invalid-input`. Not resending after a
    re-issue is the shell's own reading of W-26 ("sign nothing more"), the
    conservative side. The state is also `unavailable` when signing throws a
    `ShellError` (the signer lock lost: `lock-not-held`), with nothing sent.
  - **Settling the cancel (W-25, W-35; the Snapshot contract `se.snapshot/1` as
    vendored from the backend's b27afc5, whose meaning changed: `canceled` is
    final, and a cancel the engine has not answered shows `resolving`; decided
    by human review, 2026-10-18).** The states live in `cancel-state.ts`. From
    signing until the cancel settles the state is `in-flight` (the call, a
    resend, or the read after a failure), then `settling` or `check-later`; in
    all three, `observe` ignores every Snapshot of the round, so no read but the
    cancel's own (its answer, the read after a failure, and the counted reads)
    reaches the tracking: the gate comes before `tracking.observe`. An answer of
    the round that is `resolving` is validated but not read into the round (the
    latest Snapshot, the verdict, and the transcript state do not see it); the
    state is `settling`, and the flow reads the Snapshot once (`getSnapshot`).
    After any failed call (a lost response, a 503, a 400, or a 422), a
    `resolving` read does the same, with no resend (it is the first counted
    read, settles nothing, and is read in). Only the flow's own reads, through
    `refresh` or `checkAgain` (each sends one `getSnapshot`), count and may
    settle it, one at a time: a call made while a counted read is in flight
    joins it. A read (counted, or the one after a failed call) decides:
    `canceled` (with or without a `closeReason`), `won`, and `lost` give `sent`
    and are read in as the result; `active`, at any step, gives `not-taken`
    (read in; nothing is resent, the round stays failed and ends by its expiry
    rule), also after a 400 (refused for good, the round back to `active`) or a
    422 (a resent cancel, or a cancel of a round that is not `active`); `idle`
    gives `ended` (the round ended; nothing is read in, the Wrapper shows a
    neutral "round ended" with no result claim, and a new round may start);
    `resolving` is read in and settles nothing; another round's Snapshot and a
    failed read settle nothing. Only after an unknown outcome and a read of
    `active` with no move (not re-issued) is the same cancel sent again, once;
    the unknown outcome is a lost send only (`isUnknownOutcome`). An answer that
    is not this round's Snapshot, or is a stale one (W-29), tells nothing: it
    raises `snapshot-rejected` and earns no resend, and the read decides
    (`active` is `not-taken`; a failed read or another round's Snapshot is
    `settling` as read 1). After an unknown outcome, a 422, a 503, or a 500
    `INTERNAL`, a read that fails or shows another round puts the cancel in
    `settling` as read 1, with no resend: a later `active` read with no move is
    `not-taken`, not a resend (decided by human review, 2026-10-18). After an
    unknown outcome, a read of `active` with no move does the same (read 1,
    nothing sent) whenever no resend is allowed: after the resend (a second
    unknown outcome, no third send) or when the read shows a re-issue. After a
    400 such a read leaves the cancel `refused` (the round is back to `active`
    per the contract). There is no `unconfirmed` state: every failed call ends
    `settling`, or decided by its read (`sent`, `ended`, `not-taken`), or
    `refused` after a 400; so no state leaves a cancel that may be stored with
    nothing reading the round (`settling` is read by the poll, `check-later` by
    `checkAgain`). Every problem a cancel call is answered with is kept in the
    evidence (`cancelRefusals`: status, code, `requestId`). An answer that is
    not a Snapshot of this round, or is a stale one, tells nothing
    (`snapshot-rejected`); the read decides, with no resend. A failed read
    counts. After `SETTLING_READS` (30) reads without one that settles it, the
    state is `check-later` ("still resolving — contact support": a round the
    engine cannot settle on its own stays `resolving` until it is resolved
    manually, as the Play API document says since `65504f5`): the fast poll
    stops, and each `checkAgain` (the "check again" control, or the Wrapper's 30
    s background read) reads once under the same rules. The shell reads no
    clock; the Wrapper owns the timing. While the state is `in-flight`,
    `settling`, or `check-later`, the round is not over and no new round may
    start for the session (the guard of a new round reads the flow's
    `cancel()`); `ended` does not block one. An `active` answer is `not-taken`,
    as an `active` read is. A final answer (`canceled`, `won`, `lost`) is read
    into the round at once: the round's result, with no error and no extra read.
    The shell changes these rules only through a vendored change of the Snapshot
    contract. Since the Play API document of se-backend `726f0a2` a read after
    the round ended keeps showing it with its result (a final read, `sent`), so
    `ended` comes only from an `idle` read, which the backend says never follows
    `active` (a round is voided only while `starting`): `ended` is kept as a
    defensive fallback.
  - **Re-issue (W-26).** A re-issued verdict calls `reissue`: picks and the
    cash-out are `not_active`, and `resend` still sends a move or a cash-out
    already signed.
  - **Two guards before a new signature (W-26).** A pick or a cash-out needs a
    `ready` verdict and a transcript state in `open` or `adopted`, each checked
    on its own. Any other failed verdict calls `fail` on the transcript state
    (once the required cancel, if any, is signed or could not be), so a failed
    round never reports `open`.
  - **Typed data fails closed (W-16, W-20).** After signing, the flow compares
    the signed message, field by field, and its kind with the ones the typed
    data was encoded from; on any difference it records and sends nothing, calls
    `fail` on the transcript state, and keeps `invalid-input` as `lastError()`.
    The round is then `failed`: it is no longer `busy`, every later pick,
    cash-out, and resend is `not_active`, and the error state shows. The
    signature already made stays in the transcript state and is never sent.
  - **The flow's own reads are not ordered by `version`.** The latest validated
    Snapshot of the round is the last one read. A late, older read can only fail
    closed: its `step` is behind the moves the shell saw applied, so a pick or a
    cash-out is `not_legal` until a current read arrives, and a round held after
    W-19 that reads it goes out of sync. It never advances `T` or makes a step
    already signed legal again.
  - **Evidence (W-27).** The flow keeps the `CreateRoundAuth` objects, the tip
    check's record, and every signed action. It emits no log, metric, or event.
- **The pick use case (W-23).** `createPickUseCase(current)` is the bridge's
  `PickUseCase` over the current round's flow: `not_active` when there is none,
  and otherwise the flow's `pick`, which is the gate the bridge's pre-check is
  not.
- **Decided in human review (2026-10-17).** These choices of the round flows are
  accepted as built:
  - The reject reasons: `busy` while an action of the round is in flight or
    pending; `not_legal` for a step already signed, and for an `equivocation`
    refusal; `not_active` for no `ready` verdict, a transcript state that takes
    no new signature, or no signer lock. `accepted` means signed and sent at
    least once, whatever the outcome; the Snapshot then decides.
  - `signing`'s `actionGrammar` replaces `provisionalGrammar`, with the row
    derived from the path.
  - A round held after W-19 stays held when the read gives an `idle` Snapshot or
    another round's: only a Snapshot of the round decides.
  - The Snapshot reader does not order Snapshots by `version`; W-29's ordering
    is the UI's.
  - The cancel resend (Q2): after a lost send (no answer, or a 503 not marked
    `retryable: false`), the same signed cancel is sent again once when a fresh
    read shows the round still cancelable (the required cancel above).
  - The flow signs a cancel with `signing`'s `hashPlayerCancel`, pinned by the
    vendored `signed-action/coinflip-cancel` vector (#41); the injected
    `CancelHasher` it used before the vector existed is gone, and so is the
    `cancel-unavailable` error code.
- **Provisional items.** Each is one injected value or one module, replaced and
  its note removed as the matching contract item closes. The signed-action
  specification has published `T_0`, the `bytes32` round id, the domain, and the
  `PlayerCancel` type (now encoded by `signing`); the injected values below stay
  until the code is reconciled with it.
  - The round flow opens the transcript state with the `bytes32` form of the
    round id W-26 fixes for `newRound.roundId` (the 16 UUIDv7 bytes,
    left-aligned and zero-padded) and the `T_0` check 5 settled.
  - The tip check reaches the round flow as an injected function that runs it
    and applies the bind rule, because the bind's mode is not in a contract yet
    (below).
  - The EIP-712 domain (published) is built by the session from the validated
    configuration's `registryDomain` and the published name and version.
  - The bind's mode is an input of the session (`bindMode`); the Wrapper wires
    `tip`, the weaker of the two rules, which an honest `future` bind also
    satisfies (its `N` is above the tip), so no honest round is refused; the
    stricter `future` rule waits for the contract that carries the mode. Kept
    provisional (decided in human review, 2026-10-17).
    <!-- TODO(bind mode): take `bindMode` from the contract that carries it (the Snapshot or the signed-action spec) and drop the session input. -->
  - `tipLagMargin` has no default and is required per source: the margin in
    blocks per chain is not decided (W-26b).
  - The bind's mode (`future` or `tip`) and `N` are inputs of the decision: the
    Snapshot's `proofs.randomnessProof.blockNumber` is `N`, and the mode is not
    yet in a contract the kit has vendored.
  - The domain's `name` and `version` (`"SuperEngine"`, `"1"`) the checks build
    the digest with are the Snapshot schema's constants: the environment
    configuration pins only `chainId` and `verifyingContract`
    ([OQ-7](../wrapper.md#decided-questions)).
  - `signCancel` does not check that `T_0` is settled: whether a cancel may be
    signed at all (W-25, W-26) is decided by the round's verdict, which the
    round flow reads (`cancel`); a cancel the player asks for is not built.
  - Reading a Snapshot (`snapshot-reading.ts`): the move at sequence `s` is
    applied exactly when the Snapshot's `step` is `s` and its status is not
    `resolving`, since `step` counts the applied moves and the moves are a
    round's first messages. That a `resolving` Snapshot never counts as a move
    applied is normative (the player-facing Snapshot contract) and pinned by a
    test; a cash-out or a cancel is seen only through the terminal status it
    causes. A terminal Snapshot's `step` still counts the moves applied (the
    vendored `won` and `lost` vectors count the final move), so one whose `step`
    is the pending move's sequence confirms that move before the round closes.
    The move that survives the last step closes the round as `won` (W-24,
    [OQ-8](../wrapper.md#decided-questions)), which the shell reads as closed;
    it never signs a cash-out on its own. The signed-action specification
    settles `T_0` (`keccak256(abi.encode(created, seedHash))`, the Snapshot's
    `readyHash`), the `PlayerCancel` type, and the round id: the `bytes32` form
    above, read from the Snapshot's `newRound.roundId`. It numbers the n-th
    accepted action n and does not tie a sequence to the Snapshot's progress, so
    the reading rule above stays the shell's.
- **Tests** are unit tests with injected fakes: a seeded random source that
  keeps a copy of each draw (so a test knows the key's bytes), seeded UUIDs, and
  an in-memory lock manager shared between sessions to stand for tabs. The
  worked round of the signing vectors (read through the `contracts` test-only
  entry) is replayed through a round's state: every sequence, `previous`, struct
  hash, and digest matches, and every signature recovers to the session's
  address. Snapshot inputs are the golden `valid/` vectors with `roundId` and
  `step` replaced, validated before use. A seeded simulation of failures, lost
  responses, retries, `STALE_ACTION`, cancels against moves, and a second tab
  checks that no sequence has two signatures and the chain never breaks; a
  whole-session test checks that the key's bytes (hex, base64, and decimal)
  appear in no printed object, error, log line, or global, and that no storage,
  cookie, URL, history, network, or messaging global is read or written. The
  chain configuration's tests cover each refusal (T-8a) and the boot rule; the
  tip check runs against a scripted JSON-RPC transport and a manual clock and
  covers every T-8 tip case: exactly the quorum agreeing passes, one outlier
  among three fails, too few answering fails, a hash mismatch at `h_low` fails,
  a disagreement just beyond the lag margin fails (and at it passes), `h_top` is
  reported, every answer is recorded, and the degraded mode records
  `tipCheck: "degraded"`; plus the calls' shape, untrusted answers, and the
  request timeout (T-8a), and the pinned chain: an endpoint that reports another
  chain id fails, whether or not it gave a final block (in degraded mode too),
  and an answering one that gives no chain id or a malformed one fails closed.
  The `signature/` Snapshot vectors are read and validated and replay through
  checks 1 to 4 with their verdicts and reasons, each under a configuration that
  pins its `pinned` values and its own entropy source and chain id; the vendored
  `valid/coinflip-active-ready-hash` round passes checks 1 to 5 and settles
  `T_0` as its `readyHash`. Since the vectors do not pin the entropy chain id,
  the wrong-chain cases have their own tests: a configuration that pins another
  chain, a round signed on another chain, an `entropyChainId` changed after
  signing, and a source the configuration does not list. The other T-8 cases
  issue a round with a registry key drawn at run time from a seeded source (so
  no key is written down) and change a field before or after signing: each check
  fails with its reason and in order (`missing`, `pinned-mismatch`,
  `cross-field` for a wrong round, key, bet, currency, secret hash, chain, or
  `randomnessTarget`, `recover-mismatch` for a tampered `playerRef`, `gameId`,
  `gameVersion`, `circuitVersion`, `payoutTermsHash`, `prepareWindow`, or
  `expiry`, another signer, a high-`s` signature, or another domain,
  `ready-mismatch`, and `missing` for `readyHash` still absent at `active`); a
  past `expiry` passes; the verdict never sets `cancel` when `T_0` is not
  settled, sets it for a tip-check failure only once `T_0` is settled and the
  round is `active`, and withdraws it on a re-issue, which is recorded once with
  the first object kept. The game bridge (T-9) runs against a fake frame and
  listener: a wrong `source` or origin, a bad schema, an unknown `type`, a
  string, an accessor, and an extra field are ignored; each mount refusal;
  nothing before `hello`, the first valid one only, and an incompatible one ends
  the boundary; every post goes to D; each reject reason and `busy` for a
  repeated id in flight; a seeded property test over recorded sessions of every
  golden and `signature/` Snapshot, with legal, illegal, malformed, and forged
  messages, checks that every message the game receives holds only allow-listed
  fields and no proof, signature, session id, link, or amount; and a session
  that signs a move through the pick use case shows that the key's bytes, the
  token, the key's address, the signature, and the digest reach no message and
  that no messaging, storage, or network global is touched. The round flows
  (T-4, T-4b, and the T-8 cases that need a flow) run against a scripted Play
  API transport, a round issued for the session's own key (with three steps
  where a cash-out is needed), a stand-in tip decision, and the canonical
  encoder wrapped to record what it got: the start sends the key and the bet and
  signs nothing; a start with no response, a 503 `UNAVAILABLE` (either
  `retryable`), a bare 503, or a 500 `INTERNAL` is sent once more with the same
  body and key and its answer is the round (an ended one held as a first answer
  is), a failed resend is thrown with no third send, a page that lost the lock
  before the resend sends nothing more, and any other failure (a 500 of another
  code, a 400, a 409, a 422, a voided start's 503) is thrown with one send
  (`round-start-resend.test.ts`); through the session, a `ROUND_ACTIVE` to the
  resend shows that round, and a session that ended before the resend sends
  nothing more (`play-session-play.test.ts`); a move is signed at the next
  sequence with the canonical text and path, and its body carries the encoder's
  bytes; a second pick for a step already signed (pending, in flight, or shown
  again by an older Snapshot) is refused; a W-16 resend sends the same body; a
  400 `INVALID_ARGUMENT` and a 409 `STALE_ACTION` each adopt and continue from
  the next sequence, or put the round out of sync, or stay held when the read
  fails; a failed check signs nothing, not even a cancel; with `T_0` settled and
  only the tip check failed, only the cancel is signed, once; after a 400 or a
  422 it is never sent again; after a lost send (no answer, or a 503 not marked
  `retryable: false`) the same bytes are sent again once when the read shows the
  round still `active` with no move, never when it shows a move, another status,
  a re-issue, or no Snapshot, and never a third time; a `resolving` answer (or a
  `resolving` read after any failed call, the golden
  `valid/coinflip-resolving-cancel` included) is `settling`: a repeated
  `resolving` read keeps it so, with the phase not `closed`; another round, a
  failed read, and a read sent before the answer settle nothing (the round is
  held from signing on, the resend's flight included); after a lost cancel, an
  active read, and a 422 to the resend (the round resolving), a `resolving` read
  is `settling` with no third send; after a lost response, a 400, or a 422 an
  `idle` read is `ended`; after a lost response an `active` read with a move,
  and after a 400 or a 422 an `active` read, is `not-taken`, with the refusal in
  the evidence; after a lost send or a 422 a failed read is `settling` (read 1,
  no resend), and a counted `active`, `canceled`, or `idle` read then gives
  `not-taken`, `sent`, or `ended`, while after a 400 a failed read leaves
  `refused`; two unknown outcomes and an `active` read with no move, and an
  unknown outcome and a re-issued `active` read with no move, are `settling`
  with nothing more sent, decided by the next counted read (`active`,
  `canceled`, `idle`, `resolving`) and counting toward the 30; the read after a
  failure, a failed one included, counts toward the 30; the refusal in the
  evidence is exactly its status, code, and `requestId`, with no `detail` or
  body field in the printed evidence; two counted reads at once send one; a
  `resolving` read is read in; `idle` settles it as `ended` (also from
  `check-later`); `canceled` (with or without a `closeReason`), `won`, and
  `lost` settle it as the result, and `active` (with no move or one, as a read
  or as the answer) as `not-taken`; Snapshots observed from elsewhere are held
  back before the tracking; 30 reads give `check-later`, where `checkAgain`
  settles on a result or `idle` and stays on another `resolving` or another
  round; a `canceled` answer of another round tells nothing (the read decides,
  with no resend); a final answer (`canceled`, `won`, `lost`) closes the round
  with no error and no read; a cancel whose signing throws `lock-not-held` is
  `unavailable` with nothing sent; the flow's `over()` is `false` while the
  cancel is `in-flight`, `settling`, or `check-later`, `true` once it is `ended`
  (on a latest Snapshot that is not over) or `sent` with `canceled`, and follows
  the latest Snapshot once it is `not-taken`; through the session (a failed tip
  check from RPC endpoints that disagree), picks and the cash-out are refused,
  nothing is signed, and a start is refused `round-exists` while the cancel is
  `in-flight`, `settling`, or `check-later`, also after an `idle` or another
  round's read, the answer is the round's latest Snapshot and the game is sent
  nothing from a read from elsewhere (an `idle` or another round's), also while
  the start itself has the cancel in flight (a second start is then refused
  `busy`), a read is one counted read (`checkAgain` in `check-later`), a failed
  counted read answers with its failure and the next one with the round, a start
  is let through once the cancel is `ended`, an `idle` read is then passed on,
  and a start, a read that signs the cancel, and a settling read answer with the
  cancel's result (or, while it settles, the round) and not with the earlier
  failure of the cancel's call or of a read; a re-issue rejects picks and the
  cash-out while a pending resend still goes out; a read that causes the W-16
  resend of a lost move answers with the resend's answer (the round `won`), and
  the game is sent it, while a read whose resend is lost too answers with the
  read and gives `RoundState.unconfirmed` `move`, which `checkAgain` (a read
  only, no move sent) keeps and a read of the round `won` clears; the same for a
  lost cash-out of a three-step round (its resend's answer `won` reaches the UI
  and the game, and a resend lost too gives `cash-out`); the flow's
  `unconfirmed()` is set once a move's or a cash-out's resend is lost too, never
  after a first lost send, while the resend is in flight, after an answered
  resend, or after a 503 marked `retryable: false`, and clears on a read that
  shows the action applied, the step moved on, the round `resolving`, `lost`, or
  canceled by its time limit, and once the session ended, with the player's
  `resend` refused `not_active`; and of two tabs on one lock manager, the one
  without the lock cannot start or sign, and after a steal neither signs at a
  sequence already used. A move, a cash-out, and a cancel built by the shell
  carry exactly the vendored `typed-data/` vectors' base64: the Coin Flip pick
  and cancel through the round flow with no encoder passed, on
  `valid/coinflip-active-ready-hash` (the cancel's struct hash and digest are
  the `signed-action/coinflip-cancel` vector's, and its signature recovers to
  the session's key), the Cash or Crash pick and cash-out through the round
  flow, on `valid/cashorcrash-cash-out-active-step0` (the cash-out's struct
  hash, digest, and typedData are the `signed-action/cashorcrash-cash-out`
  vector's, and its signature recovers to the session's key), the Cash or Crash
  round won on its last row through the round flow, on
  `valid/cashorcrash-last-row-active-step0` (its three picks carry
  `typed-data/cashorcrash-last-row-pick-row0` to `-row2`, each chained on the
  one before it; the last pick's answer is `won` with the Snapshot's payout, and
  nothing is signed after it: no cash-out is offered, signed, or sent), and the
  multi-path pick and the cash-out through the request builder, on the worked
  round of `signing.json`. The Snapshot reader's tests cover each outcome
  (`snapshot`, `problem`, `rejected`, `network`) and that it prints
  `[redacted]`. The guards of a new signature are pinned each on its own: in the
  flow, nothing is signed while the tip check runs or after it rejects (its
  error kept), nor after a failed verdict whose cancel could not be sent, a sent
  cancel, or a refused one (the phase is then `failed`); with stand-ins for the
  tracking and the transcript state, a verdict that is not `ready`, a phase that
  takes no signature, a step already signed with no pending action, and a
  resendable action that is not the one recorded are each refused alone;
  `legalMove` refuses a Snapshot off the shell's own progress; a signed message
  that differs from the encoded one (a cash-out whose path is a prefix of the
  other included) is never sent and fails the round; `toBase64` matches RFC
  4648's values and `typedData` keeps to 1 to 4096 characters; the `failed`
  phase holds from `open`, `stale`, and `adopted`, even after a Snapshot shows
  an action applied; and a second refused move after an adopted resync holds the
  round again. The session's tests (T-4a, T-7, T-17's shell half) run against
  the scripted Play API and a manual wall clock (`fixtures/wall-clock.ts`): the
  fragment is removed before the first request; no fragment, an empty one, 129
  characters, or a code only in the query string sends nothing, and 128 raw
  characters pass; a lost, refused, or 503 redeem is not repeated; a second tab
  on one lock manager opens nothing (no read, no timer); the refresh point comes
  from the fixture's `tokenExpiresAt` and the offset, nothing is sent before it,
  the old token is presented and stays in use until the answer, one refresh is
  in flight, a lost answer is retried with the same token after backoff, the
  session-ending codes and the deadline end the session, and a refusal that does
  not end it waits for the deadline; the open session reads with the token,
  starts a round with the key's address (issued for the session's own key, so
  W-26 passes) and reports it `ready`, shows a `ROUND_ACTIVE` round it does not
  hold (and gives the game none of it, W-38's hold), mounts the game and signs a
  pick through it, ends on each session-ending code and then sends nothing,
  prints `[redacted]`; and the public options type carries no `encodeTypedData`.
  W-38's hold (T-26, `play-session-hold.test.ts` and
  `play-session-hold-rounds.test.ts`) runs on the same scripted session with an
  RPC transport the test releases: a ready round's `active` Snapshot is given
  and every Snapshot that is not `active` is given as before; an `active`
  Snapshot read before the tip check decides is held until it decides `ready`
  and then given once, and stays held when it decides `failed` (the cancel not
  taken, so the latest stays `active`), while the failed round's `resolving` is
  given; a tip check decided on a bound `starting` gives the first `active`
  Snapshot whose checks pass; overlapping reads give only the round's latest; a
  re-issue and an out-of-sync read send nothing and no later `active` Snapshot
  of the round, while its result still is; a `ROUND_ACTIVE` resume, a round an
  earlier page left open, and another round's `active` Snapshot are never given;
  at mount the latest is given only with the verdict `ready` then; the `hello`
  is answered with the last copy given; a book round's Snapshots reach the game
  as before; `ControllerBridge["sendSnapshot"]` keeps its type; and over a
  stand-in round (`game-hold.test.ts`), `givenToGame` holds an `active` Snapshot
  for `checking` (a tip check that gave no decision), `failed`, out of sync, no
  round, and another round, and gives one for `ready` in `open`, `adopted`, or
  `unopened`, and gives every other status whatever the verdict.
  `RoundState.pending` (T-28's shell half, `play-session-pending.test.ts`) is
  absent before any action; `move` while the move's send is unanswered and
  absent once its answer shows it applied; `cash-out` while the cash-out is in
  flight; kept while a lost move waits for a read and beside `unconfirmed` after
  the lost resend; absent after a 400 or a 409 (and after the read that adopts
  the move or puts the round out of sync), after a re-issue, a result, and the
  session's end; never for the required cancel in flight; and carries no hex.
