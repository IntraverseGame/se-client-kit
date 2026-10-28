# Signing start, move, cash-out, and cancel

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-20.** Every signature MUST be built by the kit's `signing` package from
  the signed-action spec and checked against its vectors. The shell MUST build
  the canonical action text and path itself from the game's request and MUST
  never sign any other spelling
  ([What this spec does not own](../wrapper.md#what-this-spec-does-not-own)).
  The signed-action specification publishes the grammar
  (`pick row <r> tile <o>`, 0-based, with `r = len(path) − 1`; `cash out`;
  `cancel`) and the `PlayerCancel` type, whose fields are those of W-25. A
  `path` entry is the step's `config.steps[].index` in the Snapshot, never the
  tile: the steps survived, then the step played. Coin Flip's only move is
  `pick row 0 tile <o>` with path `[0]`; it has one step, so no cash-out
  ([OQ-3](../wrapper.md#decided-questions)). The `PlayerCancel` vector from an
  independent signer (`signed-action/coinflip-cancel`, vendored in `contracts`)
  pins the type: `signing` reproduces its type hash, domain separator, struct
  hash, digest, and signature bytes, and recovers both signatures to its test
  key's address, before the shell signs a cancel (#41). The `PlayerCashOut`
  vector from the same signer (`signed-action/cashorcrash-cash-out`, the
  cash-out of a vendored Cash or Crash round after its first pick) is replayed
  the same way, and the shell's round flow signs that cash-out to its struct
  hash, digest, and typedData. A vendored Cash or Crash round won on its last
  row (`typed-data/cashorcrash-last-row-pick-row0` to `-row2`) pins a move's
  chain to the end of a round: `signing` replays its three picks and their
  links, and the shell signs them and nothing after the last, since the round
  ends `won` (W-24). The contracts repository's signing vectors (release 1.0.0)
  pin the same type hash and a `player-cancel` round (a `PlayerCancel` at
  sequence 1 on `T_0`, whose `canceled` hash is
  `keccak256(abi.encode(ready, T_1))`), which `signing` replays too.
- **W-21.** Every signature MUST be canonical: 65 bytes `r ‖ s ‖ v`, `v` in
  `{27, 28}`, low `s`, deterministic (RFC 6979). The shell MUST reject any other
  length, `v`, or high `s`, and a recovered zero address, when it checks a
  signature it received (the round's `CreateRoundAuth`). This is the backend
  verifier's rule, stated for the browser
  ([ADR-001](../../decisions/ADR-001-toolchain-and-signing.md)).
- **W-22.** **Start.** The shell starts a round with the Play API's `start`
  verb, a fresh `idempotencyKey` (within the Play API's length limits), the bet
  as an `AmountRequest` (`value`, `unit`, copied from the Snapshot's own
  `Amount` fields, never typed or computed from a float), and the action key's
  address. A player-signed `PlayerStart` is **deferred** (a config round's bind
  needs no signed start), so the first release has no signed start. "Sign start"
  is read as: the shell generates the key and presents its address in the
  `start` call (its `actionKey` field), and the round's `CreateRoundAuth` then
  commits to that address ([OQ-5](../wrapper.md#decided-questions)). The `start`
  response is the round's Snapshot. **A start whose round may exist is sent once
  more** (decided in human review, 2026-10-19): when the `start`, after the
  transport's own repeats, got no response, a 503 `UNAVAILABLE` (whatever its
  `retryable`), a 503 with no problem body, or a 500 `INTERNAL`, the shell sends
  it again right away, once, with the same `idempotencyKey` and the same body
  (W-36). The signer lock is checked again before the resend, as before the
  first send: a page that lost it sends nothing more (`lock-not-held`), and a
  session that ended sends nothing more either. The Play API document (since
  se-backend `075b850`) says that after a lost response, `UNAVAILABLE`, or
  `INTERNAL` the round may already have been started, that the same key and body
  answer it (even when it has ended), so sending them again is safe, and that a
  resend may fail the same way, with `GET /play/v1/snapshot` showing the round
  either way. A 503 with no problem body is the kit's own reading of a lost
  response. Without the resend the round could exist while the shell holds
  nothing, and the player's next start (a new key) would be answered
  `ROUND_ACTIVE` with a round the shell cannot sign in. The resend's answer is
  read as a first answer is (the round it answers, an ended one included, is the
  round the shell holds), and a failure of the resend is handled as a first
  failure is (a `ROUND_ACTIVE` answer shows that round, which the shell does not
  hold, W-42); the shell never sends the start a third time (the transport's own
  repeats aside: `start` is a call it repeats with the same bytes). Nothing else
  earns the resend: a 500 with another code, a 400, a 409 (`ROUND_ACTIVE` and
  `CONFLICT` included), a 422, an answer that is not a Snapshot of a round, or a
  start voided before any money moved (a 503 of another code, such as
  `FUNDING_UNCONFIRMED` or `ENTROPY_UNAVAILABLE`), which the document says to
  retry with a new key: that is the player's next start, never the shell's.
- **W-23.** **Move.** The game sends a validated pick request (W-38); the shell
  checks it is legal in the Snapshot it holds (the step exists, the option is in
  range, the status is `active`), builds the canonical action, signs
  `PlayerAction` at the next sequence, and sends `continue` with the signed
  bytes and a fresh `idempotencyKey`. `continue` carries only a `PlayerAction`,
  and `cashOut` (W-24) only a `PlayerCashOut`; a `PlayerCancel` is never sent
  through either (W-25). A request that fails the check is rejected to the game
  with a `reject` message and nothing is signed.
- **W-24.** **Cash-out.** The shell signs `PlayerCashOut` when the player asks
  for it (the cash-out button, offered when the status is `active` and at least
  one step was survived), and only then. It never signs a cash-out on its own:
  the backend pays out on the move that survives the last step, so after that
  move the round is `won` and nothing is signed
  ([OQ-8](../wrapper.md#decided-questions)).
- **W-25.** **Cancel.** The shell signs `PlayerCancel` (`action = "cancel"`,
  empty path, sequence 1, `previous = T_0`) only when `T_0` is settled (W-26)
  and either the tip check (W-26b) failed, or the player cancels a round that is
  `active` with no move made, if the game offers it (config rounds only; W-31
  offers the control in the `active` row, which is shown only after W-26
  passes). Without a settled `T_0` it signs no cancel. Neither case applies
  after a re-issue (W-26), and the cancel control is withdrawn then. A signed
  `PlayerCancel` is sent only on its own route, never through `continue` or
  `cashOut`. The route is `POST /play/v1/rounds:cancel` (`cancelRound` in the
  Play API document, sent by `play-client`'s `cancelRound`). Its body has the
  request shape of `continue` and `cashOut` (`idempotencyKey`, `roundId`, the
  signed `PlayerCancel` as `typedData` in base64, and `signature`), and it
  answers the round's Snapshot: `resolving` while the engine has not answered
  the cancel, `canceled` once it accepted it, `active` with a move played when a
  move was accepted while the cancel was on its way (then nothing is refunded;
  the shell reads it as `not-taken`), or, when the engine had already closed the
  round before the cancel arrived, that closure with no error (`won` or `lost`
  with its `payout`, or `canceled` with `closeReason: "expired"`): the cancel is
  never honored, and the shell reads it as the round's result (`sent`). Only a
  config round that is `active` with no move applied can be canceled: a cancel
  after a move, or of a round that is not `active`, is a 422
  `FAILED_PRECONDITION`; a cancel the engine refuses (a wrong signer, sequence,
  or `previous`) is a 400 `INVALID_ARGUMENT` and leaves the round `active`, as
  the Play API document states: a stale cancel stays a 400, while a stale move
  or cash-out is a 409 `STALE_ACTION`. The kit declines that document's "a
  corrected cancel may follow": the shell MUST NEVER sign a second cancel at
  `(round, 1)` (W-15; decided by human review, 2026-10-17): after a refused
  cancel, a 400 included, it reads the Snapshot and signs nothing at that
  sequence again, so the round ends by its expiry rule unless the Snapshot shows
  the cancel applied (`canceled`). A cancel is not answered from a log as a
  repeated move is (a cancel sent again after it was accepted, or while the
  round is `resolving`, is answered 422 `FAILED_PRECONDITION`, and a 503
  `UNAVAILABLE` may come with the cancel already stored): after a lost send (no
  answer, or a 503 not marked `retryable: false`, a bare 503 included: W-16's
  one definition, decided in human review, 2026-10-18), the shell MUST read the
  Snapshot (`GET /play/v1/snapshot`) before it sends the same signed cancel
  again, and `play-client` never repeats it on its own. When that read shows the
  round still `active` with no move (and its `CreateRoundAuth` not re-issued),
  the shell sends the same signed cancel bytes again, once, with the same
  `idempotencyKey`, never a new signature (W-16; decided by human review,
  2026-10-17); when it shows `resolving`, the cancel is settling (below); when
  the read itself fails or shows another round (after a lost send, a 503 marked
  `retryable: false`, or a 422), the cancel is settling too, and the resend is
  forgone: a later `active` read with no move does not earn it (decided by human
  review, 2026-10-18; the counted reads decide instead). On anything else, or
  after a refusal (a 400 or a 422), it sends nothing more. A 503 marked
  `retryable: false` earns no resend (W-42) but is no proof of a refusal, since
  a 503 may come with the cancel stored: after it, a failed read is settling and
  the counted reads decide, an `active` read gives `not-taken`, and a `canceled`
  read gives `sent` (decided in human review, 2026-10-18). A 500 `INTERNAL`
  marked `retryable: false` is read the same way: the Play API document (since
  se-backend `65504f5`) says that after a lost response, `UNAVAILABLE`, or
  `INTERNAL` the cancel may already have been taken, and to read the Snapshot
  before sending it again. So a failed read after it is settling too, and while
  the round stays `resolving` the counted reads end in `check-later`. After a
  503 marked `retryable: false` or a 500 `INTERNAL`, the kit reads but never
  sends the cancel again: an `active` read gives `not-taken`. That is more
  conservative than the document, which allows a resend after the read (decided
  in human review, 2026-10-19). A 500 with another code is not read as possibly
  stored. A 400 `INVALID_ARGUMENT` stays a refusal. A resend that is also lost
  is followed by another Snapshot read and never by a third send; when that read
  shows the round `active` with no move again, the cancel may be stored, so it
  is settling with that read as read 1 (decided by human review, 2026-10-18),
  and the counted reads decide. The cancel is encoded by `signing`'s
  `PlayerCancel` (W-20). Its independent signer's vector
  (`signed-action/coinflip-cancel`) is vendored in `contracts`, and the kit
  replays it (in `signing` and in the shell's round flow) before the shell signs
  a cancel.

  **After the shell's own cancel: `resolving` settles, `canceled` is final.**
  This follows the Snapshot contract `se.snapshot/1` as vendored from the
  backend's b27afc5, whose meaning changed (schema unchanged;
  [how the kit gets its contracts](../client-kit/how-the-kit-gets-its-contracts.md),
  rule 4): after the player's cancel the answer and the Snapshot show
  `resolving` until the engine answers the cancel; then the round shows
  `canceled`, which is final and never changes again (also while the refund is
  pending), or `active` (the cancel did not take). A re-read can still show
  `resolving`. A cancel resent while the round is `resolving` is a 422
  `FAILED_PRECONDITION`, after which the client reads the Snapshot. Since the
  Play API document of se-backend `726f0a2`, a re-read after the round ended
  keeps showing it (`canceled`, or `won` or `lost` with its `payout`) until the
  next `rounds:start`. `idle` never follows `active` (the backend, 2026-10-19):
  a round is voided only while it is `starting`, and a round that reached
  `active` leaves it only by play, by its expiry (`canceled` with
  `closeReason: "expired"`), or by the player's cancel. Since the Play API
  document of se-backend `b47b286`, a cancel that arrives after the engine had
  closed the round settles by that closure: the answer, or a later read after
  `resolving`, is `won` or `lost` with its `payout`, or `canceled` with
  `closeReason: "expired"` (the bet refunded), and the cancel is never honored.
  (Decided by human review, 2026-10-18; the read of the last round restated from
  `726f0a2`, the cancel that loses to a closure from `b47b286`.)

  - From the moment the cancel is signed until it settles (its call, a resend,
    and the read after a failed call included), every Snapshot of the round that
    does not come from the cancel's own answer or reads is held back from the
    round.
  - A `rounds:cancel` answer of this round that is `resolving` puts the cancel
    in **`settling`**. So does a `resolving` read after **any** failed cancel
    call: a lost send (no answer, or a 503 `UNAVAILABLE` not marked
    `retryable: false`: the cancel may already be stored, so the Snapshot is
    read before any resend, W-16), and a refusal too (a 400, or a 422, which
    answers a resent cancel or a cancel of a round that is not `active`).
    Nothing is resent then, and that read is the first counted read. The answer
    is not read into the round: the latest Snapshot, the verdict, and the
    transcript state stay as they were before the cancel, and the round is not
    shown as over.
  - While `settling`, only the shell's own counted reads may settle it, one at a
    time (a read asked while one is in flight joins it). Each counts, a failed
    one included:
    - `canceled` (with or without a `closeReason`), `won`, and `lost` are final:
      the round's result, read into the round, with no error (`won`, `lost`, and
      `canceled` with `closeReason: "expired"` also come, since `b47b286`, for a
      round that had already closed before the cancel arrived: the cancel was
      never honored);
    - `active`, at any step, is **`not-taken`** ("the cancel did not take"): the
      cancel path ends, nothing is resent, the round shows "this round failed
      verification" (W-26) and ends by its expiry rule;
    - `idle` is **`ended`**: the round ended with no result to claim. Since
      `726f0a2` this is not expected (an ended round is read with its result,
      and `idle` never follows `active`); the shell keeps it as a defensive
      fallback. The Wrapper shows a neutral "round ended", with no win, loss,
      refund, or bet-returned amount and no result claim, and the next bet
      beside it (W-31); the balance updates through the normal path (W-32).
    - `resolving` settles nothing and is read into the round (W-35 polls it);
      another round's Snapshot and a failed read settle nothing.
  - After an unknown outcome (a lost send: no answer, or a 503 not marked
    `retryable: false`), a 503 marked `retryable: false`, a 500 `INTERNAL`, or a
    422, a read that also fails (or shows another round) puts the cancel in
    `settling` too, as read 1, with no resend; so does, after an unknown
    outcome, a read of `active` with no move whenever no resend is allowed:
    after the resend's outcome was unknown too, or when the read shows the
    round's `CreateRoundAuth` re-issued (decided by human review, 2026-10-18;
    after a 422 or an answer for another round, an `active` read stays
    `not-taken`); the counted reads then decide. After a 400 a failed read
    changes nothing: the round is back to `active` per the contract, and the
    cancel stays `refused`. So every path ends in a state that is either final
    (`sent`, `ended`), decided with no cancel stored (`not-taken`, `refused`,
    `unavailable`), or read again (`settling` by the poll, `check-later` by
    "check again" and the 30 s background read); none leaves a cancel that may
    be stored with nothing reading the round.
  - After a failed call, the read that follows decides the same way: `idle` is
    `ended`, a final status is the result, and `active` is `not-taken`, after a
    refusal too: a 400 refused the cancel for good (a wrong signer, `sequence`,
    or `previous`) and the round went back to `active`, unchanged; a 422 answers
    a resent cancel or a cancel of a round that is not `active`, so an `active`
    read after it means the cancel did not take either. A refusal is kept in the
    round's evidence (W-27: its status, code, and `requestId`). Only after an
    unknown outcome (a lost send: no answer, or a 503 not marked
    `retryable: false`) and a read of `active` with no move is the same cancel
    sent again, once (above).
  - After **30** counted reads without one that settles it, the cancel is
    **`check-later`**: the round stays `resolving` with no end. The Play API
    document says a round that had already closed before the cancel arrived
    settles by that closure (since se-backend `b47b286`), and that a round the
    engine cannot settle on its own stays `resolving` until it is resolved
    manually, the Snapshot showing `resolving` until the round ends (since
    `65504f5`). The Wrapper shows "still resolving — contact support" with the
    round id and the verify link, and no result, no "your bet was returned", and
    no final display; the fast poll stops. A "check again" read the player asks
    for, and a slow background read every 30 s (W-35), each read once under the
    same rules and may still settle it.
  - While the cancel is `in-flight`, `settling`, or `check-later`, the shell
    MUST NOT start a new round for the session (the round is not over), whatever
    the session last read (an `idle` or another round's read included). `ended`
    does not block one; `not-taken` leaves the round open until its expiry rule
    closes it. In those three states picks and the cash-out are refused and
    nothing is signed, and the UI gets the round's own latest Snapshot, never
    one read from elsewhere, which the game is not sent either; the session's
    reads are the cancel's own (W-35). This holds from the moment the start's
    answer is read: a cancel that answer requires is in flight before the start
    returns, and a read meanwhile is held the same way.
  - An action of the session (a start, a read, a pick, or a cash-out) during
    which the cancel reached `settling`, `check-later`, `sent`, `not-taken`, or
    `ended` answers with the round's Snapshot, with the cancel state, and not
    with the failure of the cancel's call or of a read on the way: a lost or
    refused cancel call that a read then settled is not shown as an error. A
    refusal stays in the round's evidence (W-27).
  - A `rounds:cancel` answer that is `active` is `not-taken`, as an `active`
    read is (one state, one display). An answer that is final (`canceled`,
    `won`, `lost`) is the round's result at once, with no error. An answer that
    is not a Snapshot of this round is an unknown outcome (W-16).

  The shell changes these rules only through a vendored change of the
  player-facing Snapshot contract, never on its own.

- **W-26.** **Checks before the first signature and before the game is shown as
  ready.** The Snapshot is `starting` while the round prepares. The shell MUST
  NOT show the game as ready, and MUST NOT sign anything except the
  `PlayerCancel` this item requires, until the Snapshot is `active` **and**
  every check below passes.

  The round's `CreateRoundAuth` is the Snapshot's `proofs.createRoundAuth`: the
  round's `newRound` (the arguments of its on-chain creation, in `abi.encode`
  order), `entropyChainId`, `prepareWindow`, `expiry`, the signing `domain`, the
  `signer`, and the `signature`. It is on every config Snapshot that carries
  `proofs`, from a bound `starting` on, and every read of one round carries the
  same object. The Snapshot validator (W-28) enforces its shape: lowercase
  addresses, a 65-byte signature with `v` 27 or 28, and the domain's `name`
  `"SuperEngine"` and `version` `"1"`. The checks run in this order, and the
  first that fails refuses the round with its reason. Checks 1 to 4 run on the
  first Snapshot that carries the object; check 5 runs when `readyHash` arrives;
  the tip check may finish before it.
  1. **Present** (`missing`). A config round whose Snapshot carries
     `proofs.randomnessProof` carries `proofs.createRoundAuth`. `missing` is
     also the reason when any field a check needs (`readyHash` most likely) is
     still absent once the Snapshot is `active`.
  2. **Pinned values** (`pinned-mismatch`). `domain.chainId`,
     `domain.verifyingContract`, and `signer` MUST equal the environment
     configuration's `registryDomain` and `runtimeSigner`, which are the trust
     anchor ([OQ-7](../wrapper.md#decided-questions)). The shell builds every
     digest with the configured domain, never with a value taken from the
     response.
  3. **Cross-field** (`cross-field`). `newRound.roundId` is the Snapshot's
     `roundId` in its `bytes32` form: the 16 bytes of the UUIDv7, left-aligned
     and zero-padded to 32 bytes (the Snapshot schema's `RoundIdBytes32`);
     `newRound.roundSecretHash` is `proofs.randomnessProof.roundSecretHash`;
     `newRound.actionKey` is the shell's own key address; `newRound.betAmount`
     equals the `AmountRequest`'s value the shell sent, both read as `bigint` in
     base units, never as a `number`; `newRound.currency` equals the
     `AmountRequest`'s `unit` encoded as ASCII, left-aligned and zero-padded to
     32 bytes, compared byte for byte (a `unit` that is not ASCII or is longer
     than 32 bytes fails); `entropyChainId` MUST equal the `entropyChainId` the
     environment configuration pins for the round's entropy source
     (`proofs.randomnessProof.source`; a source the configuration does not list
     fails; decided by human review, 2026-10-16, so the chain the target is
     recomputed with is pinned like the domain and the signer);
     `newRound.randomnessTarget` equals
     `keccak256(abi.encode(bytes32 source, uint256 entropyChainId, uint256 blockNumber))`
     recomputed from `proofs.randomnessProof` (`source`, `blockNumber`) and
     `entropyChainId`. The other `newRound` fields (`playerRef`, `gameId`,
     `gameVersion`, `circuitVersion`, `payoutTermsHash`) are taken as signed.
  4. **Signature** (`recover-mismatch`). The shell computes
     `created = keccak256(abi.encode(newRound))` and the EIP-712 digest of
     `CreateRoundAuth(bytes32 created,uint40 prepareWindow,uint256 expiry)`
     under the configured domain. The signature MUST be canonical (W-21) and
     recover to `runtimeSigner`.
  5. **Ready evidence** (`ready-mismatch`). Once the Snapshot carries
     `proofs.fairnessProof.readyHash`, the shell recomputes
     `T_0 = keccak256(abi.encode(created, seedHash))`, with `seedHash` from
     `proofs.fairnessProof.seedHash`, as the vendored signing vectors reproduce
     (`created`, `seedHash`, `ready` in `signing.json`), and it MUST equal
     `readyHash`. In the first release the shell takes `readyHash` from the
     Snapshot as given. Checking it against the registry's record waits on
     anchoring, in a later increment.
  6. **Tip check** (W-26b).

  A past `expiry` is not a failure; the shell checks neither `expiry` nor
  `prepareWindow`. A check this item needs whose field has not been received for
  the round by the time the Snapshot is `active` fails (`missing`); it is never
  skipped. **`T_0` is settled** only when checks 1 to 5 pass. If a check fails:

  - **`T_0` settled** (only the tip check failed): the shell signs
    `PlayerCancel` (W-25) once the round is `active` and `T_0` is settled; a tip
    check that fails before check 5 has run waits for it, and if check 5 then
    fails the next branch applies. It keeps the round's evidence (W-27). Once
    the Snapshot shows the round `canceled` (final, W-25), it shows "this round
    failed verification and was canceled", and the player's bet is returned by
    the cancel. The cancel is signed once and never signed again. A refused
    cancel (a 400 or a 422) is never sent again; a cancel whose outcome is
    unknown (a lost send: no answer, or a 503 not marked `retryable: false`)
    follows W-25's single resend of the same signed bytes. While the cancel is
    `in-flight`, `settling`, or `check-later` (W-25) the round is shown as
    failed verification, never as canceled; when it is `ended`, the Wrapper
    shows W-33's neutral "round ended", with no claim that the bet was returned;
    when it is `not-taken`, the round stays failed verification. When the cancel
    path ends without the Snapshot showing `canceled`, the shell shows "this
    round failed verification", and the round ends by its game's expiry rule
    (W-25).
  - **`T_0` not settled** (check 1, 2, 3, 4, or 5 failed): the shell MUST sign
    nothing for the round, not even `PlayerCancel`, because a cancel linked to
    an unconfirmed `previous` may be refused and can never be rebuilt at that
    sequence (W-15). It keeps the round's evidence, shows "this round failed
    verification", and the round ends by its game's expiry rule.

  **Re-issue** (`reissued`). A later read of the same round whose
  `proofs.createRoundAuth` differs, field by field after validation, from the
  first one the shell received for the round (whether or not that one passed) is
  a re-issue, at any status. The shell keeps the first, adds the second to the
  round's evidence, MUST sign nothing more for the round (no cancel: a move may
  already be signed), and shows "this round failed verification"; the game's
  picks get `reject` (W-23), no cash-out is offered or signed (W-24), and the
  round ends by its game's expiry rule. A W-16 resend of a move or a cash-out
  already signed is not a new signature and continues, so an action the backend
  may have applied is never stranded. This does not cover a cancel: a cancel is
  sent again only after a Snapshot read (W-25), never as a blind resend.

  A book round (not in the first release) carries no `proofs.createRoundAuth`; a
  book Snapshot that carries one is invalid (W-28). Decided by human review,
  2026-10-17: the first release ships config games only, so the shell refuses a
  book round as `missing` (check 1) until a later increment defines its
  evidence.

  The shell builds checks 1 to 5 and the re-issue rule
  ([the `shell` package](../client-kit/the-shell-package.md)); the backend's
  `signature/` Snapshot vectors replay through them with their verdicts. The
  vectors pin the domain and the signer, not the entropy source's chain id, so
  check 3's wrong-chain case is covered by the shell's own unit tests (T-8).
  <!-- TODO(later increment): the shell also checks the domain, the signer, and the `CreateRoundAuth` against the registry on-chain. -->

- **W-26a. Fewer than `minRpcQuorum` endpoints answer.** Decided (OQ-2,
  [Decided questions](../wrapper.md#decided-questions)): the minimum number of
  endpoints that must answer is a configuration value, `minRpcQuorum`, and its
  default is **2**. When fewer than that answer (W-26b), the tip check is
  **failed**, not skipped, and the shell shows "could not verify the chain"; it
  signs `PlayerCancel` only if `T_0` is settled, and otherwise signs nothing
  (W-25, W-26). The environment configuration carries an `environment` field
  (`production`, `preview`, or `local`). A local or preview environment with one
  chain endpoint (the local anvil node) may set `minRpcQuorum` to 1, and then
  the shell MUST show a non-dismissable "chain check not independent
  (development)" indicator and MUST record `tipCheck: "degraded"` with the
  round's evidence (W-27). **Boot rule:** the Wrapper MUST refuse to start if
  `environment` is `production` and `minRpcQuorum` is below 2 (it shows the
  configuration-error state and signs nothing). The release build's fixture
  check ([client-kit.md](../client-kit.md#environment-configuration)) is an
  additional guard, not a replacement. **This is the single-RPC gap of the first
  release.**
- **W-26b. Tip check.** The shell asks **at least `minRpcQuorum` independent**
  RPC endpoints for their chain id and their final block, and fails closed on
  any disagreement. In production these are public RPC endpoints from
  independent providers. The local or preview exception of W-26a (one endpoint,
  the local node, with `minRpcQuorum` = 1, the degraded indicator, and
  `tipCheck: "degraded"`) applies to everything below: "public" and the
  independence rule describe the production requirement.
  - **Definitions.** `h_top` is the maximum final block over all the endpoints
    that answered within the request timeout (W-43). `h_low` is the minimum
    final block over the same endpoints.
  - **The rule.** The check passes only if (1) no endpoint reports another chain
    id than the one the environment configuration pins for the source
    (`entropyChainId`), whether or not it answered, (2) at least `minRpcQuorum`
    endpoints answered, **and** (3) **every** answering endpoint agrees: each
    reported the pinned chain id, each is within the source's lag margin of
    `h_top`, and all return the same block hash at height `h_low` (the shell
    queries that height on each). The observed tip is `h_top`. The calls are
    JSON-RPC `eth_chainId` and `eth_getBlockByNumber` with the block tag
    `finalized`, both at once, then `eth_getBlockByNumber` with `h_low` as a
    quantity, each block call with `false` (no transaction bodies); each call
    times out per W-43, and an answer that is not a chain id or a block is no
    answer ([the `shell` package](../client-kit/the-shell-package.md)).
  - **Failure.** Any endpoint that reports another chain id fails the check,
    even one that gave no final block (it is not an endpoint of the source;
    decided by human review, 2026-10-17). Any answering endpoint that is further
    than the lag margin behind `h_top`, or that returns a different hash at
    `h_low`, fails the check, as does too few answering, and so does an endpoint
    that gave its final block but no chain id, or no block at `h_low`, within
    the timeout (it cannot be shown to agree; the player sees "could not verify
    the chain", as for too few answering). The first failure in this order is
    the one reported: another chain, too few answering, no chain id, lag, hash;
    a mismatch proves a foreign endpoint, the quorum is a precondition, and
    identity comes before content. The shell does not drop an outlier and does
    not pick a side: the round fails per W-26, which signs `PlayerCancel` only
    if `T_0` is settled and otherwise signs nothing (W-25). The round's evidence
    (W-27) records every endpoint's answer (its provider, chain id, final block,
    and the hash at `h_low`).
  - **The bind.** The shell records the observed tip with the round's evidence
    and checks `N` against it: for a `future` bind `N` MUST be above that tip;
    for a `tip` bind `N` MUST NOT be older than it, within the source's lag
    margin.
  - **Independent** means providers run by different organizations on separate
    infrastructure: the configuration names each endpoint's provider, and the
    shell refuses a configuration in which two endpoints of one entropy source
    share a provider (names compared without case) or a URL. The configuration
    schema also refuses an entropy source whose configured endpoint count is
    below `minRpcQuorum`, so a quorum can never be unreachable by configuration,
    and an entropy source without its pinned `entropyChainId`.
  - **The lag margin per environment** (the `tipLagMargin` configuration value,
    in blocks per entropy source; the backend, 2026-10-28). The local chain uses
    0 and preview uses 2 (anvil). Staging keeps the preview value, **2**: its
    entropy source is a development chain that no browser can reach, so no lag
    has been measured there. Production's value is derived from the measured RPC
    lag, owned by the backend.
    <!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner; the measurement: backend). Production's `tipLagMargin` per entropy source, from the backend's measurement of the RPC lag; a configuration value, set in production's configuration document. Reason: not measured yet; production is to come. -->
- **W-27.** The shell SHOULD keep each round's evidence (its `CreateRoundAuth`,
  the tip-check answers, and every signed action) in memory for the page's life
  and SHOULD offer it as a JSON download after the round ends, started by the
  player (the only write out of the page, W-12). After the round's deadline the
  shell is also meant to check each round's evidence against the verify API and
  the public record chain; that check needs evidence that outlives the page and
  is deferred ([OQ-1](../wrapper.md#decided-questions)).
  <!-- TODO(later increment): post-round evidence check against the public record. -->
