# @intraverse/se-client-shell

## 0.1.0

### Minor Changes

- [#164](https://github.com/IntraverseGame/se-client-kit/pull/164) [`4d5031a`](https://github.com/IntraverseGame/se-client-kit/commit/4d5031ad817cb372c4548d9a198a95c04ad45b3b) Thanks [@amirosein-union](https://github.com/amirosein-union)! - Frame a game at the path of its page on its origin, so several games can share
  one origin. `redeemLaunchCode` returns the redeem answer's optional `gamePath`
  when it has one, and throws a `ProtocolError` for one that breaks the Play API
  document's rule (1 to 255 characters, starting and ending with `/`, segments of
  unreserved characters, never `.` or `..`). A `PlaySession`'s accepted
  `mountGame` result adds `gamePath` (`/` when the answer has none), and the
  Wrapper frames `gameOrigin` + `gamePath` with its `parentOrigin`. Origin checks
  are unchanged: messages are still matched by the game origin only.

- [#161](https://github.com/IntraverseGame/se-client-kit/pull/161) [`75a5e3d`](https://github.com/IntraverseGame/se-client-kit/commit/75a5e3d4a1601b363de505f0c227415869bfd33f) Thanks [@mimshins](https://github.com/mimshins)! - Book playback ([#146](https://github.com/IntraverseGame/se-client-kit/issues/146), W-50 to W-56). The session starts a book round
  (`playback`) like any round, with the bet and the action key's address, and
  signs nothing after the start: a pick or a cash-out of a book round is refused
  `not_legal` with no request sent. W-26's checks, the tip check, and the
  re-issue rule do not run on a book round; instead a later Snapshot of the round
  with another `randomnessProof` `source`, `blockNumber`, or `roundSecretHash`,
  or another `config.packageHash`, is a changed round, failed verification, and
  kept in the round's evidence (W-52). A Snapshot whose `presentation`, `model`,
  `config.kind`, or `config.model` differs from the session's first is a changed
  session (W-53): it is not read in, the game's bridge is closed, and every use
  case then answers the new `SessionRead` kind `session-changed`, reading,
  starting, and signing nothing until the page is reloaded. Until the Snapshot
  schema is re-vendored, the shell refuses a book Snapshot at `active`,
  `resolving`, or `canceled` as failing validation at `/status` (W-54).
  
  The game bridge forwards a book round as its `playback` copy (W-38, RFC-003):
  only to a game that declared `playback`, and a Snapshot in a presentation the
  game did not declare ends in "game not compatible"; a `hello` no longer needs
  `steps`. An event's `data` is a deep copy with null-prototype objects, at most
  32 levels and 10 000 values; a copy that fails is not forwarded, and the new
  optional bridge option `onCopy` tells the Wrapper. A pick while the latest
  Snapshot sent is a book round's is `not_legal` before the status check. The
  type-only `@intraverse/se-client-shell/controller` entry adds
  `GamePlaybackSnapshot`, `GameBookDraw`, `GameBookEvent`, `GameEventData`, and
  `GameJsonValue`; `SnapshotMessage.snapshot` is now `GameSnapshot |
  GamePlaybackSnapshot`.

- [#64](https://github.com/IntraverseGame/se-client-kit/pull/64) [`41893b7`](https://github.com/IntraverseGame/se-client-kit/commit/41893b7b30142424ed46f2534d52a394c74da0fc) Thanks [@mimshins](https://github.com/mimshins)! - The session knows the required cancel's states (W-25, W-33, W-35). New public
  API: `RoundState.cancel` (the cancel's state, `none` until it is reached),
  `PlaySession.checkAgain` (from `check-later`, one read under the cancel's
  settling rules; otherwise the same as `read`), and the `CancelState` type.
  While the cancel is `in-flight`, `settling`, or `check-later`, the round is
  open whatever the session read (a start is refused `round-exists`, also after
  an `idle` or another round's read), picks and the cash-out are refused, and the
  UI gets the round's own latest Snapshot, never one read from elsewhere, which
  the game is not sent either (also while the start itself has the cancel in
  flight); while it is `settling`, `read` is one of the cancel's counted reads,
  and from `check-later` its "check again" read. `ended` is over and lets a new
  round start. An action whose cancel moved to a state its own reads decide
  (`settling`, `check-later`, `sent`, `not-taken`, `ended`) answers with the
  round's Snapshot, not with the failure of the cancel's call or of a read on the
  way.

- [#45](https://github.com/IntraverseGame/se-client-kit/pull/45) [`bab05bd`](https://github.com/IntraverseGame/se-client-kit/commit/bab05bdf64d637f19a9439b4dc09bef5c12594bc) Thanks [@mimshins](https://github.com/mimshins)! - `createControllerBridge` mounts the `se.controller/1` boundary to the game
  iframe. It refuses a game origin that is not on the configuration's allow-list,
  equals the Wrapper's own origin, or is not a serialized origin; accepts a
  message only from the game frame's window and the game origin; parses it
  against a closed message set (`hello`, and `action` with the `pick` verb) and
  ignores anything else, a string or an extra field included; sends nothing
  before the game's `hello`; and posts only with the game origin as
  `targetOrigin`. The game receives an allow-listed copy of each validated
  Snapshot (no proofs, session id, links, or amounts) and closed `reject` reasons
  (`not_legal`, `not_active`, `busy`, `invalid`). A legal pick goes to an injected
  pick use case; the bridge never holds a key, a token, or a signed action. The
  message types (`HelloMessage`, `ActionMessage`, `SnapshotMessage`,
  `RejectMessage`, `GameSnapshot`, `GameStep`, `Pick`, `RejectReason`), the
  bridge's option, result, and state types, `CONTROLLER_SCHEMA`, and
  `ROUND_STATUSES` are public.

- [#57](https://github.com/IntraverseGame/se-client-kit/pull/57) [`21aaefc`](https://github.com/IntraverseGame/se-client-kit/commit/21aaefc15aa6cc0013ce86fd188a05bb31163b17) Thanks [@mimshins](https://github.com/mimshins)! - Add the type-only entry `@intraverse/se-client-shell/controller` for a game: the
  `se.controller/1` types (`HelloMessage`, `ActionMessage`, `SnapshotMessage`,
  `RejectMessage`, `GameMessage`, `WrapperMessage`, `GameSnapshot`, `GameStep`,
  `Pick`, `Presentation`, `RoundStatus`, and `RejectReason`) and no value. Its
  `exports` entry has a `types` condition only, so it is imported with
  `import type` and a runtime import of it does not resolve.

- [#44](https://github.com/IntraverseGame/se-client-kit/pull/44) [`eb12f69`](https://github.com/IntraverseGame/se-client-kit/commit/eb12f69b68237a06d1183b9f56f2cd88bb07a7e6) Thanks [@mimshins](https://github.com/mimshins)! - `signing` adds `hashNewRound` (a round's `created`,
  `keccak256(abi.encode(newRound))`), `hashRandomnessTarget`, and `hashReady`
  (`T_0`, `keccak256(abi.encode(created, seedHash))`), with the types
  `NewRound`, `RandomnessTarget`, and `Ready`. Inside `shell`: the round's
  `CreateRoundAuth` checks (present, pinned values, cross-field including the
  pinned entropy chain id, the signature, and the ready evidence), the re-issue
  rule, and the round's verdict, which settles `T_0` only when every check
  passes and says when a `PlayerCancel` must be signed.

- [#38](https://github.com/IntraverseGame/se-client-kit/pull/38) [`622de8f`](https://github.com/IntraverseGame/se-client-kit/commit/622de8fb0c3d4e92f72061a328ec5ee856ae1195) Thanks [@mimshins](https://github.com/mimshins)! - The chain configuration pins a chain id per entropy source: `entropyChainId`
  is required for each source (`invalid-entropy-chain-id` otherwise). The tip
  check asks every endpoint for `eth_chainId` beside its final block, and fails
  when any endpoint reports another chain, answering or not
  (`chain-id-mismatch`), or an answering one reports none
  (`chain-id-unavailable`). `RpcCall` now also covers `eth_chainId`.

- [#32](https://github.com/IntraverseGame/se-client-kit/pull/32) [`c60ca84`](https://github.com/IntraverseGame/se-client-kit/commit/c60ca844f4ab7d925af31936b26b2a75653bae53) Thanks [@mimshins](https://github.com/mimshins)! - The first public API: `createLogger`, a redacting logger with `warn` and
  `error` only, whose lines carry a fixed event name and the request fields
  (method, path, status, `requestId`, code) and print anything else as
  `[redacted]`; `REDACTED`; and `ShellError` with its `ShellErrorCode`. Inside
  the package: key custody behind the session's Web Lock, and the transcript
  state that records a signed action with its idempotency key before it is sent,
  never signs two actions at one sequence, and never reads a `resolving`
  Snapshot as a move applied.

- [#92](https://github.com/IntraverseGame/se-client-kit/pull/92) [`51e45af`](https://github.com/IntraverseGame/se-client-kit/commit/51e45afb1ae429dfda07d161b9cb76ad7f5003a4) Thanks [@mimshins](https://github.com/mimshins)! - `createOperatorChannel` runs the `se.operator/1` handshake with the page that
  embeds the Wrapper. Before the configuration is validated it records the first
  well-formed `hello` from the parent window and answers nothing; `check` then
  accepts that `hello` at once when its origin is on `operatorOrigins` (and equal
  to `location.ancestorOrigins[0]` where that exists), refuses it finally
  (`operator-not-allowed`) when it is not, or else waits for one, for 10 s on the
  injected clock by default (`HANDSHAKE_TIMEOUT_MS`), before it refuses
  (`handshake-timeout`). The first valid `hello` fixes the operator origin: the
  channel posts `welcome` to it, answers a repeat from it with `welcome` again,
  and later sends `resize` heights to it only (an integer from 1 to
  `MAX_RESIZE_HEIGHT`, never the same value twice in a row). A message is read
  only from the parent window, through the own data properties of a plain object
  with exactly `schema` and `type`; anything else is ignored and never answered.
  No message carries a secret, an id, an amount, or a URL. `OPERATOR_SCHEMA` and
  the message, option, outcome, and state types are public.
  
  `createControllerBridge` also refuses a game origin whose host shares its last
  two labels with the Wrapper's (`same-site`, W-37's registrable-domain rule
  without a public suffix list). Its options take the configuration's
  `environment`: only in `local` are two loopback hosts exempt. The session gives
  the bridge the environment of the configuration it was opened with; the UI's
  mount cannot.

- [#58](https://github.com/IntraverseGame/se-client-kit/pull/58) [`a6a8ff6`](https://github.com/IntraverseGame/se-client-kit/commit/a6a8ff656d7a6b1fce56dc493479cbc3cbdab1fc) Thanks [@mimshins](https://github.com/mimshins)! - The session the Wrapper UI plays through. New public API: `takeLaunchCode`
  (the launch code is the whole URL fragment, 1 to 128 raw characters, removed
  with `history.replaceState` and returned sealed; `MAX_LAUNCH_CODE_LENGTH`),
  `discardLaunchCode` (forgets a code that will not be redeemed),
  `openPlaySession` (redeems the code once and never retries it, takes the
  `se:signer:<sessionId>` Web Lock, holds the play token in memory and refreshes
  it from `tokenExpiresAt` with the redeem's clock offset, retrying a retryable
  failure with backoff while the token is valid and ending the session on
  `SESSION_EXPIRED`, `SESSION_REVOKED`, `UNAUTHENTICATED`, or the deadline), and
  `isRoundOver`, the kit's one check of whether a round is over. The session
  (`PlaySession`) gives the UI use cases and read-only state only: `read`,
  `start`, `cashOut`, `round` (the W-26 verdict, out of sync, and whether a
  cash-out is offered), `gameOrigin` (D, the redeem answer's `gameOrigin`, fixed
  at open; no option gives it), `mountGame` (the controller bridge for D with the
  session's pick use case, and the `gameOrigins` allow-list and own origin the
  session was opened with; it refuses `session-ended` once the session ended),
  and change and end notices. One start or cash-out runs at a time: a second
  while one is in flight is refused `busy`, and a start while the held round is
  not over is refused `round-exists`, with nothing sent. The session prints
  `[redacted]`, and no type it returns holds a key, a token, a signature, or the
  transcript. New
  types: `PlaySessionOptions`, `SessionParts`, `SessionOpening`, `SessionRead`,
  `RoundState`, `GameMount`, `GameMountOptions`, `PlaySession`, `Bet`,
  `BindMode`, `FailReason`, `LaunchCode`, `LaunchHistory`, `LaunchLocation`,
  `RoundEnd`, and the platform types `Clock`, `FetchLike`, `RefreshConfig`, and
  `TimerHandle`. The round flows' test-only typedData encoder is no longer an
  option: production always uses `signing`'s canonical encoding. Provisional:
  the bind mode is an input.

- [#61](https://github.com/IntraverseGame/se-client-kit/pull/61) [`237c797`](https://github.com/IntraverseGame/se-client-kit/commit/237c797172d5427e6a9d5728ff29c5b3a63157da) Thanks [@mimshins](https://github.com/mimshins)! - The required `PlayerCancel` (W-25, W-26) is now signed with `signing`'s
  `hashPlayerCancel`, still only when `T_0` is settled and only the tip check
  failed. The injected cancel encoding and the `cancel-unavailable` error code
  are gone.
  
  The cancel follows the Snapshot contract `se.snapshot/1` as vendored from the
  backend's b27afc5: `canceled` is final, and a cancel the engine has not
  answered shows `resolving`. A `resolving` answer, or a `resolving` read after
  any failed cancel call (refused or unknown), puts the cancel state in
  `settling`, with no resend; so does a read that fails after an unknown outcome or a 422, and an unknown outcome followed by an `active` read with no move when no resend
  is allowed (after the one resend, or after a re-issue). From signing until it settles (`in-flight`,
  `settling`, `check-later`), the round's Snapshots from elsewhere are held back,
  and only the flow's own counted reads (`refresh`, and the new `checkAgain`, one
  at a time) settle it: `canceled`, `won`, and `lost` are the round's result with
  no error, `active` is `not-taken` (also as the answer, or after a 400 or a
  422), and `idle` is `ended`. After 30 reads without a settling one the state is
  `check-later`. Problems a cancel call is answered with are kept in the round's evidence
  (`cancelRefusals`: status, code, and `requestId` only).

- [#52](https://github.com/IntraverseGame/se-client-kit/pull/52) [`4b7e5de`](https://github.com/IntraverseGame/se-client-kit/commit/4b7e5deb565564d54022159696da8145ced2db45) Thanks [@mimshins](https://github.com/mimshins)! - The shell's round flows: start (the action key and the bet, nothing signed),
  move and cash-out checked against the shell's own latest validated Snapshot and
  signed once per step, the W-16 resend, the W-19 resynchronization after a 400
  `INVALID_ARGUMENT` or a 409 `STALE_ACTION`, the one cancel a failed tip check requires (its same bytes sent again, once,
  only after a lost response or a 503 and a Snapshot that shows the round still
  cancelable), and the re-issue state that signs nothing new. The transcript state is
  opened only with a settled `T_0`. Every signed action carries `signing`'s
  canonical `encodeTypedData` bytes as its `typedData` (base64, at most 4096
  characters), checked against the vendored `typed-data` vectors; the shell
  refuses to send one whose signed message differs from the encoded one. They
  and the pick use case are internal for
  now. New public API: `createSnapshotReader`, which gives the Wrapper UI
  validated Snapshots and typed Play API errors (`SnapshotRead`,
  `SnapshotReader`, `SnapshotReaderOptions`, and the re-exported `ValidSnapshot`
  and `ValidPlayProblem`), and the `snapshot-rejected` error code.
  
  `signing`: `provisionalGrammar` is replaced by `actionGrammar`, the published
  grammar. `pick(path, tile)` derives the row from the path (`r = len(path) - 1`),
  `cashOut(path)` takes the steps survived, and `cancel()` is added; each returns
  the action text and its path.

- [#79](https://github.com/IntraverseGame/se-client-kit/pull/79) [`0152c38`](https://github.com/IntraverseGame/se-client-kit/commit/0152c383d6255fd76b5952ff57c652d7e8c6bab9) Thanks [@mimshins](https://github.com/mimshins)! - A read that causes the W-16 resend of a lost move or cash-out now answers with
  the resend's answer, and the game is sent it too. Before, `read()` answered with
  the read's own older Snapshot (the round still `active`), so the Wrapper and the
  game kept showing the round in play after the resend's answer showed it settled.
  A read whose resend is lost too still answers with the read.
  
  `RoundState` adds `unconfirmed` (`"move"` or `"cash-out"`), set only while the
  pending move or cash-out had its one resend and that resend was lost too, with
  the round still `active` and the action neither applied nor refused. A read
  clears it; nothing more is sent or signed for the action, so `checkAgain` is a
  read only.

- [#34](https://github.com/IntraverseGame/se-client-kit/pull/34) [`13be3e4`](https://github.com/IntraverseGame/se-client-kit/commit/13be3e4e3a490682cce679636272f3dc5276d856) Thanks [@mimshins](https://github.com/mimshins)! - `validateChainConfig` validates the chain part of the environment
  configuration: the environment, the pinned signer address and registry domain,
  the RPC endpoints of each entropy source with their providers, `minRpcQuorum`
  (default 2), and the required `tipLagMargin`. It refuses `production` with a
  quorum below 2, two endpoints of one source that share a provider, and a source
  with fewer endpoints than the quorum, and flags `local` and `preview` with a
  quorum of 1 as degraded. The RPC transport types (`RpcTransport`, `RpcCall`,
  `BlockTag`) are public; the transport gets an optional abort signal
  (play-client's `CancelSignal`; the platform `AbortSignal` satisfies it) that is
  aborted when its call times out, and may ignore it. Inside the package: the tip
  check over every configured endpoint, its record, and the decision to pass or
  fail.

### Patch Changes

- [#176](https://github.com/IntraverseGame/se-client-kit/pull/176) [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e) Thanks [@mimshins](https://github.com/mimshins)! - The session refuses a book Snapshot at `active`, `resolving`, or `canceled`
  through the `snapshot` validator, which now takes the rule from the synced
  schema (W-54), instead of through a rule of its own: the shell's interim check
  is removed. What the session does is unchanged: such a Snapshot, read, answered
  to an action, or embedded in a `ROUND_ACTIVE` typed error, fails validation
  (W-28).

- [#83](https://github.com/IntraverseGame/se-client-kit/pull/83) [`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1) Thanks [@mimshins](https://github.com/mimshins)! - A 500 `INTERNAL` marked `retryable: false` to the required cancel is no longer
  read as a refusal. The Play API document says that after a lost response,
  `UNAVAILABLE`, or `INTERNAL` the cancel may already have been taken, so the
  shell reads it as it reads a 503 marked `retryable: false`: the reads decide, a failed read
  after it leaves the cancel `settling`, and a round that stays `resolving` ends
  in `check-later`. Nothing is resent. A 400 `INVALID_ARGUMENT`, and a 500 with
  another code, stay refusals.

- [#178](https://github.com/IntraverseGame/se-client-kit/pull/178) [`d3393ee`](https://github.com/IntraverseGame/se-client-kit/commit/d3393ee2a104caac4e3623b530bdd3e6ac3f459b) Thanks [@mimshins](https://github.com/mimshins)! - The required cancel's own decision now compares Snapshot versions (W-29,
  [#163](https://github.com/IntraverseGame/se-client-kit/issues/163)). An answer or a read of the round lower in `version` than the round's
  latest Snapshot or than the cancel's own answers and reads is stale: a stale
  answer tells nothing (the Snapshot is read), and a stale read is treated as no
  read. Neither settles the cancel's state or allows its one resend. An equal
  `version` is still read.

- [#76](https://github.com/IntraverseGame/se-client-kit/pull/76) [`36b4c99`](https://github.com/IntraverseGame/se-client-kit/commit/36b4c9973478e33440f793cd6f9c756daafa633d) Thanks [@mimshins](https://github.com/mimshins)! - A move or cash-out whose send was lost is now sent again once, with the same
  signed bytes and idempotency key, when a later read of the round (the newest by
  `version`; a late, older read decides nothing) shows it `active` at the step
  before the action, the action not applied (W-16, decided in human review,
  2026-10-18). The backend recognises the repeat by its signed action (sequence
  and bytes) in the round's action log. The one resend is shared with `resend`:
  after either path sent it again, `resend` answers `not_active`, so an action is
  sent at most twice. It is never re-signed; a read that shows the action applied,
  the step moved on, or the round no longer `active` sends nothing, a 409 or a 400
  to the resend is a refusal with no further send, and a re-issue does not stop it
  (W-26). If the resend fails too, the action stays pending and the round ends by
  a read that shows it applied or by its expiry rule.
  
  A lost send now has one definition for every signed action, the required
  cancel included: no answer, or a 503 not marked `retryable: false` (a 503 with
  no problem body included). A 503 marked `retryable: false` is never resent
  (W-42); for the cancel it is no proof of a refusal (a 503 may come with the
  cancel stored), so the reads decide as after a 422, and a failed read leaves it
  settling.

- [#161](https://github.com/IntraverseGame/se-client-kit/pull/161) [`75a5e3d`](https://github.com/IntraverseGame/se-client-kit/commit/75a5e3d4a1601b363de505f0c227415869bfd33f) Thanks [@mimshins](https://github.com/mimshins)! - A Snapshot of the round the shell holds whose `version` is lower than the
  round's latest is now ignored before the round's tracking, its checks, and its
  transcript state see it (W-29), for a config round as for a book round. A stale
  read, from requests that overlapped, could before move the round back: send its
  verdict back to `checking`, make a legal next move look illegal, reopen an ended
  round (`round-exists` on the next start), or reach the game's copy at the
  mount. An equal `version` is still read, and the W-16 resend keeps its own rule.

- [#90](https://github.com/IntraverseGame/se-client-kit/pull/90) [`0cbc2e4`](https://github.com/IntraverseGame/se-client-kit/commit/0cbc2e4c852c1bfba2cb6719c1aee953af30476a) Thanks [@mimshins](https://github.com/mimshins)! - A start whose round may exist although its answer was lost is now sent once
  more, right away, with the same idempotency key and body (W-22, W-36; decided
  in human review, 2026-10-19): after no response, a 503 `UNAVAILABLE` whatever
  its `retryable`, a 503 with no problem body, or a 500 `INTERNAL`. The Play API
  document (since se-backend `075b850`) says that after a lost response,
  `UNAVAILABLE`, or `INTERNAL` the round may already have been started, and the
  same key and body answer it, so sending them again is safe; a 503 with no
  problem body is the kit's own reading of a lost response. The round the server
  holds becomes the round the shell holds, instead of a round the player's next
  start would meet as `ROUND_ACTIVE` and the shell could not sign in. The
  resend's answer is read as a first answer is, and its failure is handled as a
  first failure is (a `ROUND_ACTIVE` answer shows that round); the shell never
  sends it a third time, the transport's own repeats aside. The signer lock is checked again before the resend: a page that lost it
  (`lock-not-held`), or a session that ended, sends nothing more. A 500 with
  another code, a 400, a 409, a 422, an answer that is not a Snapshot of a round,
  and a start voided before any money moved (`FUNDING_UNCONFIRMED`,
  `ENTROPY_UNAVAILABLE`, which the document says to retry with a new key) are not
  resent.
  
  A move or a cash-out is unchanged: the document now says resending the same
  request after a lost response, `UNAVAILABLE`, or `INTERNAL` is safe, but the
  shell stays more conservative and resends neither after a 500 `INTERNAL` or a
  503 marked `retryable: false`; the action stays pending and the reads decide.
- Updated dependencies [[`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1), [`2b1a982`](https://github.com/IntraverseGame/se-client-kit/commit/2b1a982e8827bdbd88749d64340ef33ca934dfa0), [`4826f4a`](https://github.com/IntraverseGame/se-client-kit/commit/4826f4a61959f9f02511f9be339956f3e5259e0f), [`5478f4c`](https://github.com/IntraverseGame/se-client-kit/commit/5478f4c6db5aca9ee8680454e6e591bbbba3c62a), [`c03c309`](https://github.com/IntraverseGame/se-client-kit/commit/c03c309c4f2b20b8b423a86708f5ed2f418ff106), [`c915675`](https://github.com/IntraverseGame/se-client-kit/commit/c915675038470fc5d3519a945f1771d5c9020bb4), [`da6b4b0`](https://github.com/IntraverseGame/se-client-kit/commit/da6b4b0bc3a88c547ab549376ccc778dd18c8f38), [`0cbc2e4`](https://github.com/IntraverseGame/se-client-kit/commit/0cbc2e4c852c1bfba2cb6719c1aee953af30476a), [`4d5031a`](https://github.com/IntraverseGame/se-client-kit/commit/4d5031ad817cb372c4548d9a198a95c04ad45b3b), [`1fc8e5f`](https://github.com/IntraverseGame/se-client-kit/commit/1fc8e5f1f26c9596b088227205f02c6a492c75e9), [`aa0cc8d`](https://github.com/IntraverseGame/se-client-kit/commit/aa0cc8ded970e44502b38c339b2bb3ce4b0348a5), [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e), [`43970e6`](https://github.com/IntraverseGame/se-client-kit/commit/43970e62bc126804d19da478f40f333266d01a37), [`be31360`](https://github.com/IntraverseGame/se-client-kit/commit/be31360a3a2d861972e6dcc91da0782593bca499), [`a8c20ca`](https://github.com/IntraverseGame/se-client-kit/commit/a8c20ca78859da4e61cb0c3b00be5212ad74144d), [`eb12f69`](https://github.com/IntraverseGame/se-client-kit/commit/eb12f69b68237a06d1183b9f56f2cd88bb07a7e6), [`4b7e5de`](https://github.com/IntraverseGame/se-client-kit/commit/4b7e5deb565564d54022159696da8145ced2db45), [`20a9e9d`](https://github.com/IntraverseGame/se-client-kit/commit/20a9e9da5bad42e1b521fbc3b29bf6c5e9185adc), [`bafb147`](https://github.com/IntraverseGame/se-client-kit/commit/bafb147f503a39e22cb8cacd59f59a25205b6ae7), [`237c797`](https://github.com/IntraverseGame/se-client-kit/commit/237c797172d5427e6a9d5728ff29c5b3a63157da), [`02012a7`](https://github.com/IntraverseGame/se-client-kit/commit/02012a7f8a02e813d90ce1b6503f6575ed470da8), [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e), [`1a33fea`](https://github.com/IntraverseGame/se-client-kit/commit/1a33feaea15981a4db587150c7eaca46573f77db), [`f2b3690`](https://github.com/IntraverseGame/se-client-kit/commit/f2b369010acc61ed932c2328ce5056dd356886b0), [`5640638`](https://github.com/IntraverseGame/se-client-kit/commit/56406380eadf19b5067ec4889e6343010593a0ec), [`c610fb5`](https://github.com/IntraverseGame/se-client-kit/commit/c610fb5e00c19202e74c047da8624222773b51a2)]:
  - @intraverse/se-client-play-client@0.1.0
  - @intraverse/se-client-snapshot@0.1.0
  - @intraverse/se-client-signing@0.1.0
