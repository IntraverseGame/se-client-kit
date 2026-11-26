# RFC-008 — A signed start for book rounds

- Status: draft
- Author: <!-- TODO: author -->
- Created: 2026-11-26
- Relates to: the backend's RFC-021 and its ADR-068 (proposed, "player-seeded
  book start"), cited by name;
  [book playback](../../specs/wrapper/book-playback.md); W-26 and W-26b of
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md);
  [the verify page](../../specs/verify-page.md);
  [RFC-007](./RFC-007-solana-entropy-in-the-browser.md) and
  [ADR-013](../../decisions/ADR-013-solana-entropy-sources.md) (the shell's
  Solana reads).

The backend proposes replacing the book round's timestamp gate with a
player-signed start. The engine issues a commitment to its secret first. The
shell then signs over that commitment, a client seed, and a finalized Solana
slot. The verify page uses the signed start and the revealed secret to recompute
the draw. This is a proposal, not implemented behavior. The current specs remain
in force until the backend accepts RFC-021 and publishes the contracts.

## Problem

A book round's result is fixed at bind. Today the backend binds a book round to
a Solana block a few slots in the future and proves that its commitment to the
round secret `s` came first by comparing block timestamps across two chains.
Those timestamps carry no enforced bound, so the proof rests on assumed bounds,
and waiting for the future block makes a book round take several seconds.

## Motivation

- **Speed.** All draw inputs are known at bind. The shell does not have to
  target a future block.
- **Trust.** If the client seed was unpredictable to the engine when it issued
  `H(s)`, the engine cannot precompute the draw. The player does not see `s`
  until the result or void.

## Proposed solution

### 1. What the shell receives

The shell opens the bet with `POST /play/v1/rounds:start` as today. For a
signed-start book game, the engine runs the usual checks, creates the round and
its secret `s`, and returns a `starting` Snapshot with the backend-assigned
round ID. It sends the debit reservation to the operator no later than it sends
`H(s)` to the shell, normally in parallel. The wager is accepted only at bind,
once the debit is acknowledged and the signed start is valid. Config rounds are
unchanged.

The Snapshot's optional top-level `start` member is present only while the book
round is awaiting its signed start:

```json
"start": {
  "secretHash": "0x…",
  "fallback": { "slot": "312345678", "blockhash": "0x…" },
  "expiresAt": "2026-11-26T10:00:10Z",
  "issued": "0x…"
}
```

- `secretHash` is `H(s)`, the engine's commitment to this round's secret.
- `fallback` is the engine's finalized slot and blockhash for this round.
- `expiresAt` is the backend's start deadline. The signature uses Unix seconds.
- `issued` is the runtime's signature over
  `StartIssued(bytes32 round,bytes32 secretHash,uint64 expiresAt)` under the
  operator's draw registry EIP-712 domain.

Before generating or binding a client seed, verify `StartIssued` with the
trusted runtime signer for that domain, using the current round's registry ID
and the commitment and deadline in `start`. Retain the verified issuance. A
missing or invalid issuance is not a basis to sign. `StartIssued` proves the
engine issued that commitment for the round by `expiresAt`, not whether or when
the debit was sent.

The member is additive within `se.snapshot/1`. The kit adopts the published
schema through the usual vendored copy and pin.

### 2. The client seed

- After verifying issuance, generate `clientSeed`, 32 fresh bytes from
  `crypto.getRandomValues`, or use the seed the player set. A player can enter
  their own seed before or after `H(s)` arrives, but the shell binds it into a
  start only after verifying issuance. The shell never reuses a seed across
  rounds.
- Show the client seed in each round's details and let the player set their own
  seed from launch. This is a player feature, not an integrity control.

### 3. The slot

- The shell takes a usable **finalized** Solana slot with a block and its
  blockhash from its own endpoints. It reuses the Solana read path from RFC-007
  and ADR-013 (the tip check's endpoints and quorum, W-26b). There is no
  requirement to target a future slot.
- The shell may prefetch the slot before `rounds:start`. Before signing, check
  the cached sample against the kit's current finalized head. If it is more than
  five slots old, refresh it. If the freshness check or refresh fails, do not
  sign that cached sample.
- Use `slotSource = 1` for a usable kit sample. If the kit cannot obtain one
  (for example, the quorum does not answer or disagrees), use this round's
  `start.fallback` with `slotSource = 2`. If neither is usable, do not sign.
- The engine checks `head − 10 ≤ slot ≤ head + 8`, where `head` is its own
  finalized head. If a slot in that window is ahead of the engine's view, the
  engine waits for its view to reach the slot before checking the finalized
  blockhash. The window keeps the input recent; it is not a security bound.

### 4. The signed start

The shell signs a `PlayerStart` with the session's action key under the
operator's **draw registry** EIP-712 domain:

```text
PlayerStart(bytes32 round,bytes32 session,bytes32 currency,uint128 stake,bytes32 secretHash,bytes32 clientSeed,bytes32 cluster,uint64 slot,bytes32 blockhash,uint8 slotSource)
```

- `round` is the registry encoding of the backend round ID. `session`,
  `currency` and `stake` use the same encodings as the other signed actions;
  `stake` is the stake in base units.
- `secretHash` is the verified `start.secretHash`, and `clientSeed` is the
  32-byte seed itself. `cluster` is the pinned Solana cluster's genesis hash.
- `slot`, `blockhash` and `slotSource` identify the chosen finalized block and
  where the sample came from. Only `slotSource` values 1 and 2 are valid.
- `KeyDelegation` remains optional. Without it the signature proves session-key
  authorization, not wallet authorization. The published backend contracts
  supply exact encodings and vectors.

Sign exactly one start for the backend round. Keep its signed bytes and verified
issuance for that round across retries and reloads. Once signed, do not replace
the start's seed, slot or signature.

### 5. Submission and receipts

Send `{roundId, playerStart, signature}` to `POST /play/v1/rounds:submitStart`.
On retry, including after a lost response, resend the identical signed start. A
retry of `rounds:start` with the same key recovers the same round and
commitment. The first valid signed start stands; a later, different start for
that round returns `SECOND_START` without changing the round. Do not sign
another start for that round.

When the Snapshot or error response carries `startReceipt`, verify its
`StartReceived(bytes32 round,bytes32 startHash)` signature under the draw
registry domain with the trusted runtime signer. Match the round and the EIP-712
digest of the signed start sent in that request, and retain the verified
receipt. It shows only that the engine acknowledged that start, not that it
accepted or bound the round. The engine can withhold the receipt. A missing
receipt proves nothing. A verified receipt has no timestamp: it cannot disprove
`START_TIMEOUT` or show that the start arrived by `expiresAt`.

Use the backend's round state to show the outcome. A timeout or network error in
the shell is not a void. The engine cancels the reservation on a pre-bind void
and reveals `s` with the outcome, even for a refusal, failed debit or abandoned
start. A refused start has no second try; surface `SIGNED_START_FAILED` with the
backend's refusal detail when reported. The backend proposes publishing `s`
through the verify API and round record within `ROUNDS_REVEAL_DEADLINE` of the
signed `expiresAt` (one hour by default, subject to owner confirmation). The
retained `StartIssued` is evidence of this obligation if `s` is not published by
then. The registry has no confirmation deadline under this rule.

### 6. The verify page

For a signed-start book round, the verify page:

1. compares the signed round ID, session, currency and stake with the round
   evidence; checks the `PlayerStart` signature against the round's
   authenticated action key under the draw registry domain, and verifies the key
   delegation when present;
2. checks that the revealed `s` hashes to the signed `secretHash`;
3. reads `blockhash(N)` at `finalized` on the signed cluster and compares it
   with the signed value; labels the engine fallback when `slotSource = 2`;
4. recomputes
   `SHA-256("RFC021/seed/v1" ‖ roundId ‖ blockhash(N) ‖ s ‖ clientSeed)`, using
   the 14-byte ASCII tag and 32-byte registry round ID, then replays the draw
   and payout with the public kernel bundle;
5. for a draw, compares the recomputed `resultHash` with the on-chain draw
   record when available. The hash is
   `keccak256(abi.encode(roundId, packageHash, drawnIndex, payoutAmount, startHash))`,
   using the published contract's encodings, with `startHash` the EIP-712 digest
   of `PlayerStart`.

The page shows the client seed and slot when available. A void with a verified
start can show the would-be payout, not a settled payout. If the start is not
published, the public verifier can check the secret commitment but cannot replay
the draw. A player who retained the signed start can check the would-be result
against the revealed `s`, but cannot prove it arrived in time.

The registry record is written asynchronously after the draw; voids use the
existing record path. Confirmation does not gate the result, payout, playback or
next bet. Until the record is available, the on-chain check is pending. A player
can choose to wait for registry confirmation to independently check the record
before trusting the result or continuing play. This verifies the recorded draw,
not whether the operator credited the payout. The Wrapper still shows the
Snapshot's formatted payout; the existing engine/operator settlement trust is
unchanged.

## Alternatives

- **Keep the future-block bind.** No kit change, but book rounds stay slow and
  the backend's proof stays on assumed timestamp bounds.
- **A past slot without a client seed.** Rejected. The engine sees every recent
  block before it commits, so it could choose a secret that loses on all of
  them.
- **A client seed with no slot.** Equally fair and simpler for the kit. The
  proposal keeps the signed slot as a public third input pending the lab
  decision.

## Tradeoffs

- **Kit integrity.** The player's signature proves which inputs they signed, not
  when the seed was generated or whether it was unpredictable to the engine. The
  generated-seed ordering relies on the kit the engine serves. Publishing the
  source does not establish which bundle the player ran.
- **One extra Play API request per book round.** The signed-start submission can
  run while the debit reservation is in flight. Measure the full bet-to-result
  path, including any kit Solana reads.
- **More state in the shell.** The signed start and engine evidence must survive
  a retry and reload without signing a replacement.

## Impact

- **`shell`:** client seed selection, slot sampling and freshness, round
  fallback, and storage for one-start-per-round replay and evidence.
- **`signing`:** `PlayerStart` signing and verification of `StartIssued` and
  `StartReceived` under the published draw registry domain and runtime signer.
- **`contracts`:** the published Snapshot, Play API and signed-action contracts
  and vectors.
- **`play-client`:** `rounds:submitStart`.
- **The Wrapper:** signed start, player seed settings, and refusal labels.
- **The verify page:** the checks in section 6.

## Migration considerations

- **Release order:**
  1. The backend publishes the Play API, Snapshot and signing contracts.
  2. The kit vendors them and ships signed-start support.
  3. The backend enables signed-start book games per operator, once that
     operator's Wrapper supports them.
- **Old Wrappers fail closed:** do not enable this flow for an unsupported
  Wrapper. A Wrapper that predates `start` still refuses a Snapshot carrying it.
- Book rounds already bound under the future-block mode are unaffected.

## Unresolved questions

1. **The draw registry's domain and runtime signer.** How does the shell obtain
   the trusted domain and signer before verifying issuance?
2. **Reload storage.** Which kit-origin store keeps the signed start and
   receipts across a reload, and when are they cleared?
3. **Refusal labels.** Which of the backend's refusal codes need their own
   player-facing labels?
4. **Latency.** Measure the full path from bet to result with both sides built.
