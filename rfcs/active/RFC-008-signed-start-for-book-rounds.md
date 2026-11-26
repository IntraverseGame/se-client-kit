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

### 1. What the shell knows before a bet

The published session contract tells the shell whether the game uses
signed-start book rounds. A signed-start book round begins with
`POST /play/v1/rounds:submitStart` (RT1); there is no allocation request first.
RT1 carries the bet, action key and optional delegation or grant that would
otherwise go to `rounds:start`, plus the kit's round ID and signed
`PlayerStart`. The normal/config flow still uses `rounds:start` unchanged.

The authenticated backend derives the currency and stake from the session and
bet, checks the signed terms against them, and atomically claims the round ID
globally for that session and normalized request before any debit. The usual
funding and one-open-round checks still apply. The preparation deadline starts
at the backend's first acceptance of RT1, not at the time encoded in the ID.

A successful RT1 returns the binding in the Snapshot's optional top-level
`start` member: `secretHash` (`H(s)`) and `bound` (the engine's `StartBound`
signature). The member does not supply a fallback sample or a deadline before
RT1. It is additive within `se.snapshot/1`; the kit adopts it through the usual
vendored schema copy and pin.

### 2. The client seed

- For each new start intent, generate 32 fresh bytes with
  `crypto.getRandomValues`. Without custom input, those bytes are the effective
  `clientSeed`. With custom input, derive the effective seed by hashing the
  ASCII tag `RFC008/client-seed/v1`, the 32 fresh bytes, and the UTF-8 bytes of
  the player input, in that order, with SHA-256. The effective seed, not the
  custom input, is both the opening and the draw input.
- Sign `SHA-256(clientSeed)`, never the plaintext seed. Never reuse a seed or
  send it to the operator page, telemetry, or the engine before the verified
  bind. Show the effective seed in the round details after verifying the bind.

### 3. The slot

- The shell reads Solana's latest **finalized** slot that has a block, and that
  block's hash, from its own endpoints. It reuses the Solana read path from
  RFC-007 and ADR-013 (the tip check's endpoints and quorum, W-26b).
- The shell may prefetch independently of any bet. Before signing, check the
  sample against the kit's current finalized head. If it is more than five slots
  old, refresh it. If the freshness check or refresh fails, do not sign that
  cached sample.
- **Fallback.** Ordinary session bootstrap (`sessions:redeem`) and scheduled
  token refresh (`sessions:refresh`) responses may carry
  `bookEntropyFallback: {slot, blockhash, expiresAt}`. Cache the engine's
  finalized sample for that deployment, session and pinned cluster. Use it only
  before its `expiresAt`; omission on refresh does not extend that time. Expiry
  is a local availability hint, not a promise that the engine will accept the
  slot. Do not fetch a fallback or trigger a session refresh on demand for a
  round.
- Prefer a usable kit sample (`slotSource = 1`). If the kit cannot obtain one
  (for example, the quorum does not answer or disagrees), use a usable cached
  engine sample (`slotSource = 2`). If neither is usable, fail locally before
  sending RT1 or requesting a debit.
- The backend checks the signed slot against its finalized view
  (`head − 10 ≤ slot ≤ head + 8` in the proposal). It waits for a permitted
  ahead slot to finalize before checking the hash.

### 4. The signed start

For a new intent, the shell generates a canonical lowercase UUIDv7 before
signing. Browser `crypto.randomUUID()` produces a v4 UUID, not a v7 UUID; use an
RFC 9562 UUIDv7 generator with cryptographic randomness. The timestamp in the
UUID is not a trusted clock or a deadline.

The shell signs a `PlayerStart` with the round's action key, as for the other
signed actions, under the **draw registry's** EIP-712 domain:

```text
PlayerStart(bytes32 round,bytes32 session,bytes32 currency,uint128 stake,
            bytes32 cluster,uint64 slot,bytes32 blockhash,uint8 slotSource,
            bytes32 clientSeedHash)
```

- `round`, `session`, `currency` and `stake` use the same encodings as the other
  signed actions. The signed `round` bytes encode the exact UUIDv7 sent in RT1's
  `roundId`; a request path or body that names the round uses the same ID.
- `cluster` is the pinned Solana genesis hash; `clientSeedHash` is the SHA-256
  digest of the effective seed.
- The accepted backend contract supplies field encodings, canonical type strings
  and vectors.

Before sending RT1, atomically record the exact request body (including the bet,
action key, any delegation or grant, and signed `PlayerStart`) and the effective
seed in kit-origin IndexedDB, keyed by deployment, session and round. In the
same transaction, claim the pending start for that deployment and session. If
another tab already recorded the pending start, adopt that record for recovery
rather than sending the competing start. If the transaction fails, do not
submit. Do not store the play token with the record; authenticate the replay
with the current authorized token.

A retry or reload of an unresolved start reuses the stored round ID, request
bytes and seed. Do not re-sign or refresh the slot in a stored request. Only an
explicit new bet after the pending start is authoritatively resolved creates a
new intent, even if the bet terms are identical. It gets a fresh UUIDv7 and
seed. A response lost in transit never creates a new intent.

### 5. Commit, reveal, and recovery

1. **Commit (RT1).** Send the persisted request to
   `POST /play/v1/rounds:submitStart`. On a lost response, replay the identical
   request to recover the same binding or outcome. A changed request for that
   round in the same session is `SECOND_START`; a foreign-session collision is
   `NOT_FOUND` without mutation. Do not generate a replacement commitment for
   that round or infer a void from local time or a network failure; require an
   authoritative pre-bind void.
2. **Verify the binding.** Verify `StartBound` under the draw-registry domain
   against a trusted runtime signer and the persisted `PlayerStart`. Require it
   to bind the saved round, stake, slot, block hash and seed commitment to
   `H(s)`. Persist the receipt and `H(s)` before sending the opening. A bad or
   missing signature leaves the opening private. If the backend adds a signed
   absolute `s` publication deadline, preserve it with the receipt; do not infer
   it from an unsigned Snapshot or the local clock.
3. **Reveal (RT2).** Send the same `{roundId, clientSeed}` to
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

1. compares the signed round ID, session, currency and stake with the round
   evidence; checks the `PlayerStart` signature against the round's action key,
   and verifies the key delegation when present;
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
  proposal keeps the signed slot as a public third input pending the lab
  decision.

## Tradeoffs

- **Kit integrity.** Predictable randomness or leaking the effective seed before
  bind defeats the hiding commitment. Public source alone does not establish
  which bundle the player ran.
- **Two Play API requests on the successful round path:** `rounds:submitStart`
  (including debit and bind) and `rounds:revealSeed`. There is no per-round
  allocation or fallback request. Measure the full bet-to-result path, including
  any kit Solana reads on that path, not just network time for RT1 and RT2.
- **More state in the shell.** Persist the opening and signed evidence or a
  reload can turn a recoverable round into an unrevealed one.

## Impact

- **`shell`:** UUIDv7 and seed generation, slot selection, the session fallback
  cache, durable recovery and replay.
- **`signing`:** `PlayerStart` and `StartBound` verification under the published
  draw-registry domain and signer.
- **`contracts`:** the published session, Snapshot, Play API and signing
  contracts.
- **`play-client`:** `rounds:submitStart` and `rounds:revealSeed`.
- **The Wrapper:** commit–reveal, recovery export and import, refusal and
  unconfirmed-settlement states.
- **The verify page:** the checks in section 6.

## Migration considerations

- **Release order:**
  1. The backend publishes the session, Play API, Snapshot and signing
     contracts.
  2. The kit vendors them and ships signed-start support.
  3. The backend enables signed-start book games per operator, once that
     operator's Wrapper supports them.
- **Old Wrappers fail closed:** do not enable this flow for an unsupported
  Wrapper. A Wrapper that predates `start` still refuses a Snapshot carrying it.
- Book rounds already bound under the future-block mode are unaffected.

## Unresolved questions

1. **The draw registry's domain.** How does the shell obtain it before signing
   RT1: from the session's initial Snapshot or the environment configuration?
2. **Independent reveal intake.** If timely delivery must be provable, which
   service will attest to receipt and make the opening retrievable without the
   engine?
3. **Backend recovery contract.** Which verify or support route accepts late
   openings after the original session expires, and how is it authorized?
4. **Refusal labels.** Which of the backend's refusal codes need their own
   player-facing labels?
5. **Latency.** Measure the full path from bet to result with both sides built.
