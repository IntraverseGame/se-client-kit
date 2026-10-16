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
  empty path, sequence 1, `previous = T_0`) only when a check of W-26 fails and
  `T_0` is settled (W-26), or when the player cancels a round that is `active`
  with no move made, if the game offers it (config rounds only; W-31 offers the
  control in the `active` row).
- **W-26.** **Checks before the first signature and before the game is shown as
  ready.** The Snapshot is `starting` while the round prepares. The shell MUST
  NOT show the game as ready, and MUST NOT sign anything except the
  `PlayerCancel` this item requires, until the Snapshot is `active` **and** all
  of these hold:
  1. **Domain and signer.** The Snapshot's signing domain for the round
     (`chainId`, `verifyingContract`) and its signer address MUST equal the
     environment configuration's `registryDomain` and `runtimeSigner`, which are
     the trust anchor ([OQ-7](../wrapper.md#decided-questions)). Any mismatch
     fails the check. The shell builds every digest with the configured domain,
     never with a value taken from the response.
  2. **`CreateRoundAuth` signature.** The round's `CreateRoundAuth` carries a
     canonical signature (W-21) that recovers to `runtimeSigner`.
  3. **`CreateRoundAuth` contents.** The shell recomputes `created`, the hash of
     the round's on-chain creation arguments, from the Snapshot's fields and its
     own values, and it MUST equal the `CreateRoundAuth`'s `created`. The round
     id is the Snapshot's `roundId`. The action key is the shell's own key
     address. The bet and currency are what the player chose (`bet` against the
     `AmountRequest` the shell sent, `unit` against the currency). The source,
     `N`, and `roundSecretHash` are the Snapshot's `proofs.randomnessProof`
     (`source`, `blockNumber`, `roundSecretHash`). The terms hash comes from the
     backend's Snapshot fields (TODO below).
  4. **Ready evidence.** The shell recomputes
     `T_0 = keccak256(abi.encode(created, seedHash))`, with `seedHash` from the
     Snapshot's `proofs.fairnessProof.seedHash`, as the vendored signing vectors
     reproduce (`created`, `seedHash`, `ready` in `signing.json`). It MUST equal
     the Snapshot's `proofs.fairnessProof.readyHash`. In the first release the
     shell takes `readyHash` from the Snapshot as given. Checking it against the
     registry's record waits on anchoring, in a later increment.
  5. **Tip check** (W-26b).

  A field this check needs that has not been received for the round by the time
  the Snapshot is `active` fails the check; it is never skipped. **`T_0` is
  settled** only when checks 1 to 4 pass. If a check fails:

  - **`T_0` settled** (only the tip check failed): the shell signs
    `PlayerCancel` (W-25) as soon as the round is `active`, keeps the round's
    evidence (W-27), shows "this round failed verification and was canceled",
    and the player's bet is returned by the cancel.
  - **`T_0` not settled** (a field is missing, or check 1, 2, 3, or 4 failed):
    the shell MUST sign nothing for the round, not even `PlayerCancel`, because
    a cancel linked to an unconfirmed `previous` may be refused and can never be
    rebuilt at that sequence (W-15). It keeps the round's evidence, shows "this
    round failed verification", and the round ends by its game's expiry rule.

  For a book round (not in the first release) the check can only flag.
  <!-- TODO(backend Snapshot fields): W-26 is blocked on the backend. The Snapshot (`se.snapshot/1`) will carry the round's `CreateRoundAuth`, the fields to recompute `created` (the terms hash among them), the signing domain, and the signer address as optional, additive fields; their names, their envelope, and the statuses that carry them are not decided yet. `proofs.fairnessProof.readyHash` is also not in the vendored schema yet (its `FairnessProof` is closed), so today's validator refuses a Snapshot that carries it. Until a newer schema and its vectors are vendored into `contracts`, the shell cannot complete checks 1 to 4, and every round ends by the "`T_0` not settled" path. -->
  <!-- TODO(open question): whether the shell also checks the `CreateRoundAuth`'s `expiry` and `prepareWindow` against the injected clock; to settle when the backend's field names are known. -->
  <!-- TODO(later increment): the shell also checks the domain, the signer, and the `CreateRoundAuth` against the registry on-chain. -->

- **W-26a. Fewer than `minRpcQuorum` endpoints answer.** Decided (OQ-2,
  [Decided questions](../wrapper.md#decided-questions)): the minimum number of
  endpoints that must answer is a configuration value, `minRpcQuorum`, and its
  default is **2**. When fewer than that answer (W-26b), the tip check is
  **failed**, not skipped: the shell signs `PlayerCancel` and shows "could not
  verify the chain". The environment configuration carries an `environment`
  field (`production`, `preview`, or `local`). A local or preview environment
  with one chain endpoint (the local anvil node) may set `minRpcQuorum` to 1,
  and then the shell MUST show a non-dismissable "chain check not independent
  (development)" indicator and MUST record `tipCheck: "degraded"` with the
  round's evidence (W-27). **Boot rule:** the Wrapper MUST refuse to start if
  `environment` is `production` and `minRpcQuorum` is below 2 (it shows the
  configuration-error state and signs nothing). The release build's fixture
  check ([client-kit.md](../client-kit.md#environment-configuration)) is an
  additional guard, not a replacement. **This is the single-RPC gap of the first
  release.**
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
    does not pick a side: it signs `PlayerCancel` per W-26. The round's evidence
    (W-27) records every endpoint's answer (its provider, final block, and the
    hash at `h_low`).
  - **The bind.** The shell records the observed tip with the round's evidence
    and checks `N` against it: for a `future` bind `N` MUST be above that tip;
    for a `tip` bind `N` MUST NOT be older than it, within the source's lag
    margin.
  - **Independent** means providers run by different organizations on separate
    infrastructure: the configuration names each endpoint's provider, and the
    shell refuses a configuration in which two endpoints share a provider. The
    configuration schema also refuses an entropy source whose configured
    endpoint count is below `minRpcQuorum`, so a quorum can never be unreachable
    by configuration.
  <!-- TODO(backend entropy spec): the lag margin in blocks per chain, from the measured RPC lag; it is the `tipLagMargin` configuration value. -->
- **W-27.** The shell SHOULD keep each round's evidence (its `CreateRoundAuth`,
  the tip-check answers, and every signed action) in memory for the page's life
  and SHOULD offer it as a JSON download after the round ends, started by the
  player (the only write out of the page, W-12). After the round's deadline the
  shell is also meant to check each round's evidence against the verify API and
  the public record chain; that check needs evidence that outlives the page and
  is deferred ([OQ-1](../wrapper.md#decided-questions)).
  <!-- TODO(later increment): post-round evidence check against the public record. -->
