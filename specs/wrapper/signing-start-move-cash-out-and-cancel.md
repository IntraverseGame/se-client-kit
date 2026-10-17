# Signing start, move, cash-out, and cancel

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-20.** Every signature MUST be built by the kit's `signing` package from
  the signed-action spec and checked against its vectors. The shell MUST build
  the canonical action text and path itself from the game's request and MUST
  never sign any other spelling
  ([What this spec does not own](../wrapper.md#what-this-spec-does-not-own)).
  <!-- TODO(signed-action spec): the action grammar for Coin Flip (`pick`, the 0-based `path`), the `PlayerCancel` fields, and the vectors. -->
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
  response is the round's Snapshot.
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
  answers the round's Snapshot: `canceled` once the engine accepted the cancel,
  or `active` with a move played when a move was accepted while the cancel was
  on its way (then nothing is refunded). Only a config round that is `active`
  with no move applied can be canceled: a cancel after a move, or of a round
  that is not `active`, is a 422 `FAILED_PRECONDITION`; a cancel the engine
  refuses (a wrong signer, sequence, or `previous`) is a 400 `INVALID_ARGUMENT`
  and leaves the round `active`. A cancel is not answered from a log as a
  repeated move is: after a lost response or a 503 `UNAVAILABLE`, the shell MUST
  read the Snapshot (`GET /play/v1/snapshot`) before it sends the cancel again,
  and `play-client` never repeats it on its own. The shell does not sign a
  cancel yet: the `PlayerCancel` fields and vectors are still to be published
  (the signed-action TODO under W-20), so W-25 and the cancel path of W-26
  cannot complete until they are.
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
    fails the next branch applies. It keeps the round's evidence (W-27), shows
    "this round failed verification and was canceled", and the player's bet is
    returned by the cancel.
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

  For a book round (not in the first release) the check can only flag; a book
  Snapshot that carries `proofs.createRoundAuth` is invalid (W-28).
  <!-- TODO(shell W-26 checks): the schema that carries `proofs.createRoundAuth` and `proofs.fairnessProof.readyHash`, and its vectors (with the `signature/` class of accept and refuse verdicts), are vendored in `contracts`, and the validator accepts them. Making `proofs.createRoundAuth` required within `se.snapshot/1` was a one-time pre-release exception to the additive-only rule (OQ-7), recorded in `client-kit.md` and `client-kit/how-the-kit-gets-its-contracts.md`. What remains is the shell's implementation of checks 1 to 5 and the replay of the `signature/` verdicts through them; until it lands, every round ends by the "`T_0` not settled" path. -->
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
  <!-- TODO(backend entropy spec): the lag margin in blocks per chain, from the measured RPC lag; it is the `tipLagMargin` configuration value. -->
- **W-27.** The shell SHOULD keep each round's evidence (its `CreateRoundAuth`,
  the tip-check answers, and every signed action) in memory for the page's life
  and SHOULD offer it as a JSON download after the round ends, started by the
  player (the only write out of the page, W-12). After the round's deadline the
  shell is also meant to check each round's evidence against the verify API and
  the public record chain; that check needs evidence that outlives the page and
  is deferred ([OQ-1](../wrapper.md#decided-questions)).
  <!-- TODO(later increment): post-round evidence check against the public record. -->
