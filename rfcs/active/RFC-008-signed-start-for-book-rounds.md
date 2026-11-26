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

The backend proposes a two-party commit–reveal for book rounds instead of
comparing block timestamps. The shell commits to a private seed, verifies the
engine's signed binding, then opens its commitment. The verify page checks both
openings and recomputes the draw. This is a proposed kit contract; it does not
take effect until the backend accepts RFC-021 and publishes the wire contracts.

## Problem

A book round's result is fixed by the inputs committed at bind. Today the
backend binds a book round to a Solana block a few slots in the future, and
proves that its commitment to the round secret `s` came first by comparing block
timestamps across two chains. Those timestamps carry no enforced bound, so the
proof rests on assumed bounds, and the wait for the future block makes a book
round take several seconds.

## Motivation

- **Speed.** The slot is already finalized; the round does not wait for a future
  block.
- **Trust.** The engine binds without knowing the player's seed. The player
  commits without knowing the engine's secret. This does not prove timely
  delivery or force either side to publish.

## Proposed solution

### 1. What the shell receives

`rounds:start` allocates the round and returns its id and a Snapshot with an
optional top-level `start` member:

```json
"start": {
  "fallback": { "slot": "312345678", "blockhash": "0x…" },
  "expiresAt": "2026-11-26T10:00:10Z"
}
```

- `fallback` is the engine's latest finalized slot and block hash, used only
  when the shell's own reads fail (section 3).
- `expiresAt` is the pre-bind start deadline, not the engine's reveal deadline.
- Only after bind does `start` carry `secretHash` (`H(s)`) and `bound` (the
  engine's `StartBound` signature).

The member is additive within `se.snapshot/1`. This repository adopts it when
the backend publishes the schema change, through the usual vendored copy and
pin.

### 2. The client seed

- Before sending the first commitment, generate 32 fresh bytes with
  `crypto.getRandomValues`. Without custom input, those bytes are the effective
  `clientSeed`. With custom input, derive the effective seed by hashing the
  ASCII tag `RFC008/client-seed/v1`, the 32 fresh bytes, and the UTF-8 bytes of
  the player input, in that order, with SHA-256. The effective seed, not the
  custom input, is both the opening and the draw input.
- Sign `SHA-256(clientSeed)`, never the plaintext seed. Never reuse a seed or
  send it to the operator page, telemetry, or the engine before the verified
  bind. Show the effective seed in the round details after bind.
- Before RT1, atomically insert the signed request and effective seed in
  kit-origin IndexedDB, keyed by deployment, session and round. If another tab
  already inserted one, use that record, never the competing start. If storage
  fails, do not submit. Reloads and retries reuse the stored signed bytes and
  seed for that round.

### 3. The slot

- The shell reads Solana's latest **finalized** slot that has a block, and that
  block's hash, from its own endpoints. It reuses the Solana read path from
  RFC-007 and ADR-013 (the tip check's endpoints and quorum, W-26b).
- The shell may prefetch and cache the slot before `rounds:start` and refreshes
  it once it is more than five slots old.
- **Fallback.** If its own reads fail (fewer than the quorum answer, or they
  disagree), the shell uses `start.fallback` and marks the start with
  `slotSource = 2`. Otherwise it uses its own slot with `slotSource = 1`. The
  shell never chooses the fallback when its own read succeeded.
- The backend checks the signed slot against its finalized view
  (`head − 10 ≤ slot ≤ head + 8` in the proposal). It waits for a permitted
  ahead slot to finalize before checking the hash.

### 4. The signed start

The shell signs a `PlayerStart` with the round's action key, as for the other
signed actions, under the **draw registry's** EIP-712 domain:

```text
PlayerStart(bytes32 round,bytes32 session,bytes32 currency,uint128 stake,
            bytes32 cluster,uint64 slot,bytes32 blockhash,uint8 slotSource,
            bytes32 clientSeedHash)
```

- `round`, `session`, `currency` and `stake` use the same encodings as the other
  signed actions.
- `cluster` is the pinned Solana genesis hash; `clientSeedHash` is the SHA-256
  digest of the effective seed.
- The accepted backend contract supplies field encodings, canonical type strings
  and vectors.

### 5. Commit, reveal, and recovery

1. **Commit.** Send the persisted request to `POST /play/v1/rounds:submitStart`.
   On a lost response, replay the identical request to recover the same binding.
   Do not infer a void from local time or a network failure; require an
   authoritative pre-bind void. On `SECOND_START`, do not generate a replacement
   commitment for that round.
2. **Verify the binding.** Verify `StartBound` under the draw-registry domain
   against a trusted runtime signer and the persisted `PlayerStart`. Require it
   to bind the saved round, stake, slot, block hash and seed commitment to
   `H(s)`. Persist the receipt and `H(s)` before sending the opening. A bad or
   missing signature leaves the opening private. If the backend adds a signed
   absolute `s` publication deadline, preserve it with the receipt; do not infer
   it from an unsigned Snapshot or the local clock.
3. **Reveal.** Send the same `{roundId, clientSeed}` to
   `POST /play/v1/rounds:revealSeed`. Retry transient failures with backoff
   while the kit is open and resume on reload or reconnect when authorized for
   the round. `SEED_MISMATCH` does not change the round; stop automatic retries
   on that error and retain the evidence for recovery. An unrevealed outcome is
   not a verified loss and does not end recovery: a valid late opening yields
   the true outcome, with any winning correction paid through deferred credit.
4. **Recover outside the original browser.** After bind, allow the player to
   download a private recovery file with the signed start, signed binding,
   effective seed, and deployment and round identifiers. Exclude session tokens
   and signing keys. On explicit import, the kit validates both signatures and
   the seed commitment before storing or resubmitting it. Keep the live recovery
   record until the verified final outcome or a confirmed pre-bind void; an
   unrevealed status alone never clears it. The player can use the recovery
   evidence in the verify or support route the backend publishes.

The recovery file proves the engine bound the round and supplies the opening.
Local timestamps and retry logs are not evidence that the engine received it by
a deadline. An open-source kit alone cannot prove timely delivery or force
settlement. That requires an independent intake with a timestamped
acknowledgement the kit can retain. Until one exists, the kit reports
**settlement unconfirmed**, not **engine refused a timely reveal**.

### 6. The verify page

For a signed-start book round, the verify page:

1. checks the `PlayerStart` signature against the round's action key, and the
   key delegation when one is present;
2. checks `StartBound` against the saved start and trusted runtime signer, and
   checks that `s` and the effective seed open their respective hashes;
3. reads `blockhash(slot)` at `finalized` on the signed cluster and compares it
   with the signed value; labels the engine fallback when `slotSource = 2`;
4. recomputes
   `SHA-256("RFC021/seed/v2" ‖ roundId ‖ blockhash(N) ‖ s ‖ clientSeed)` and the
   result with the public kernel bundle;
5. recomputes `resultHash` under the accepted backend contract and compares it
   with the on-chain draw record, when available.

It shows the effective seed and slot on the round's page. Without a verified
opening it shows no verified draw or payout.

## Alternatives

- **Keep the future-block bind.** No kit change, but book rounds stay slow and
  the backend's proof stays on assumed timestamp bounds.
- **A past slot without a client seed.** Rejected. The engine sees every recent
  block before it commits, so it could choose a secret that loses on all of
  them.
- **A client seed with no slot.** Equally fair and simpler for the kit. The
  backend keeps the slot as a public third input, so it is in this RFC.

## Tradeoffs

- **Kit integrity.** Predictable randomness or leaking the effective seed before
  bind defeats the hiding commitment. Public source alone does not establish
  which bundle the player ran.
- **Three requests end to end:** `rounds:start`, `rounds:submitStart`, and
  `rounds:revealSeed`. Measure the full path, including the debit inside RT1.
- **More state in the shell.** Persist the opening and signed evidence or a
  reload can turn a recoverable round into an unrevealed one.

## Impact

- **`shell`:** seed generation, slot selection, durable recovery and replay.
- **`signing`:** `PlayerStart` and `StartBound` verification under the published
  draw-registry domain and signer.
- **`contracts`:** the published Snapshot, Play API and signing contracts.
- **`play-client`:** `rounds:submitStart` and `rounds:revealSeed`.
- **The Wrapper:** commit–reveal, recovery export and import, refusal and
  unconfirmed-settlement states.
- **The verify page:** the checks in section 6.

## Migration considerations

- **Release order:**
  1. This repository ships support for `start`, the client seed and the signing.
  2. The backend publishes the schema change.
  3. The backend enables signed-start book games per operator, once that
     operator's Wrapper supports them.
- **Old Wrappers fail closed:** a Wrapper that predates `start` refuses a
  Snapshot that carries it.
- Book rounds already bound under the future-block mode are unaffected.

## Unresolved questions

1. **The draw registry's domain.** Where does the shell get it: in the Snapshot
   next to the config registry's domain, or in the environment configuration?
2. **Independent reveal intake.** If timely delivery must be provable, which
   service will attest to receipt and make the opening retrievable without the
   engine?
3. **Backend recovery contract.** Which verify or support route accepts late
   openings after the original session expires, and how is it authorized?
4. **Refusal labels.** Which of the backend's refusal codes need their own
   player-facing labels?
5. **Latency.** Measure the full path from bet to result with both sides built.
