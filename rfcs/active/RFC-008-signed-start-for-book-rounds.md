# RFC-008 — A signed start for book rounds

- Status: draft
- Author: <!-- TODO: author -->
- Created: 2026-11-26
- Relates to: the backend's RFC-021 and its ADR-068 (proposed, "player-seeded
  book start"), cited by name; [book playback](../../specs/wrapper/book-playback.md);
  W-26 and W-26b of
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md);
  [the verify page](../../specs/verify-page.md);
  [RFC-007](./RFC-007-solana-entropy-in-the-browser.md) and
  [ADR-013](../../decisions/ADR-013-solana-entropy-sources.md) (the shell's
  Solana reads).

The backend proposes that a book round prove that the engine's commitment came
before its entropy by the player's signature, not by block timestamps. This
RFC describes the kit's part: the shell generates a client seed, reads a
finalized Solana slot, signs one start per round, and sends it, and the verify
page recomputes the round from it. Nothing here applies until the backend
accepts its RFC-021 and publishes the contracts below. Until then, the
backend's accepted specs and this repository's specs stand.

## Problem

A book round's result is fixed when the round binds. Today the backend binds
a book round to a Solana block a few slots in the future, and proves that its
commitment to the round secret `s` came first by comparing block timestamps
across two chains. Those timestamps carry no enforced bound, so the proof rests
on assumed bounds, and the wait for the future block makes a book round take
several seconds.

## Motivation

- **Speed.** With the player's input, every input to the seed is known at bind,
  so a book round needs no entropy wait.
- **Trust.** No timestamp comparison, and nothing the engine chooses alone.
- **A familiar fairness model.** A server-seed hash shown before the wager,
  plus a client seed, is the model regulators and players already know as
  "provably fair".

## Proposed solution

### 1. What the shell receives

The backend proposes a new optional top-level member of the Snapshot, `start`,
present only on a `starting` Snapshot of a book round that is waiting for its
start:

```json
"start": {
  "secretHash": "0x…",
  "fallback": { "slot": "312345678", "blockhash": "0x…" },
  "expiresAt": "2026-11-26T10:00:10Z"
}
```

- `secretHash` is `H(s)`, the engine's commitment to the round secret.
- `fallback` is the engine's latest finalized slot and its block hash, used only
  when the shell's own reads fail (section 3).
- `expiresAt` is when the backend stops waiting for the start.

The member is additive within `se.snapshot/1`. This repository adopts it when
the backend publishes the schema change, through the usual vendored copy and
pin.

### 2. The client seed

- The shell generates `clientSeed`, 32 bytes from `crypto.getRandomValues`,
  **only after** it has received `start.secretHash` for that round. It never
  creates a client seed in advance, never derives it from anything, and never
  reuses one.
- **One start per round.** The shell signs exactly one start per round. It keeps
  the signed bytes for that round id for the lifetime of the round, and every
  retry resends **the identical bytes**: never a new client seed. A page reload
  keeps them, so a reload doesn't produce a second start.
- The ordering guarantee lives here: the backend's design relies on this code
  to create the client seed only after the commitment arrives. That is a
  property of this open-source code, not something a third party can prove
  from chain data, and the specs say so.

### 3. The slot

- The shell reads Solana's latest **finalized** slot that has a block, and that
  block's hash, from its own endpoints. It reuses the Solana read path from
  RFC-007 and ADR-013 (the tip check's endpoints and quorum, W-26b).
- It may read and cache the slot **before** `secretHash` arrives. That is safe,
  because only the client seed has to come after the commitment, and it keeps
  the read out of the start's latency.
- **Fallback.** If its own reads fail (fewer than the quorum answer, or they
  disagree), the shell uses `start.fallback` and marks the start with
  `slotSource = 2`. Otherwise it uses its own slot with `slotSource = 1`. The
  shell never chooses the fallback when its own read succeeded.
- The backend accepts a slot that is finalized, has the stated block hash, and
  is no more than 10 slots behind its own finalized head. A slot ahead of the
  backend's view is not refused.

### 4. The signed start

The shell signs a `PlayerStart` with the round's action key, as for the other
signed actions, under the **draw registry's** EIP-712 domain:

```text
PlayerStart(bytes32 round,bytes32 session,bytes32 currency,uint128 stake,
            bytes32 secretHash,bytes32 clientSeed,uint64 slot,bytes32 blockhash,
            uint8 slotSource,bytes32 startId)
```

- `round`, `session`, `currency` and `stake` use the same encodings as the other
  signed actions.
- `secretHash` is exactly `start.secretHash`.
- `startId` is a single-use id the shell generates once per round, next to the
  client seed.
- The exact type string, field encodings and vectors come from the backend's
  signed-action specification once accepted. This RFC copies none of them
  early.

### 5. Sending it

- `POST /play/v1/rounds:submitStart` with `{roundId, playerStart, signature}`,
  as the backend's Play API document will define it.
- On a network error the shell resends the identical body until
  `start.expiresAt`. After that it shows the round as voided when the Snapshot
  says so.
- If the backend refuses the start (`SIGNED_START_FAILED`, with a refusal code
  as its detail), the round is voided, the bet is refunded, and the secret is
  revealed. The shell shows the refusal with its label and never retries with a
  different start.

### 6. The verify page

For a signed-start book round, the verify page:

1. checks the `PlayerStart` signature against the round's action key, and the
   key delegation when one is present;
2. checks that the revealed `s` hashes to `secretHash`;
3. reads `blockhash(slot)` at `finalized` from its own Solana endpoints and
   compares it with the signed value. For `slotSource = 2` it says the slot came
   from the engine;
4. recomputes the seed as `SHA-256(blockhash(N) ‖ s ‖ clientSeed)`, and the
   result with the public kernel bundle;
5. recomputes the record's `resultHash`, which now also covers the hash of the
   signed start.

It shows the client seed and the slot on the round's page.

## Alternatives

- **Keep the future-block bind.** No kit change, but book rounds stay slow and
  the backend's proof stays on assumed timestamp bounds.
- **A past slot without a client seed.** Rejected. The engine sees every recent
  block before it commits, so it could choose a secret that loses on all of
  them.
- **A client seed with no slot.** Equally fair and simpler for the kit. The
  backend keeps the slot as a public third input, so it is in this RFC.

## Tradeoffs

- **The shell becomes part of the fairness argument.** If the shell created its
  seed before seeing the commitment, or predictably, the engine could aim its
  secret at it. That is why section 2's rules are strict, and why they belong
  in the open-source code.
- **One more request per book round**, the start submission. It runs while the
  debit is in flight on the backend, so the backend expects it to add little,
  but nobody has measured it yet.
- **More state in the shell.** The signed start must survive a retry and a
  reload for the round's lifetime.

## Impact

- **`shell`:** client seed generation, the slot read and cache, the fallback,
  one-start-per-round storage, signing and submitting the start.
- **`signing`:** the `PlayerStart` typed data and its vectors, once the backend
  publishes them.
- **`contracts`:** the vendored Snapshot schema with `start`, and the updated
  signed-action specification and vectors.
- **`play-client`:** the `rounds:submitStart` call.
- **The Wrapper:** the book start flow and the refusal labels.
- **The verify page:** the checks in section 6.

## Migration considerations

- **Release order:**
  1. This repository ships support for `start`, the client seed and the
     signing.
  2. The backend publishes the schema change.
  3. The backend enables signed-start book games per operator, once that
     operator's Wrapper supports them.
- **Old Wrappers fail closed:** a Wrapper that predates `start` refuses a
  Snapshot that carries it.
- Book rounds already bound under the future-block mode are unaffected.

## Unresolved questions

1. **The draw registry's domain.** Where does the shell get it: in the
   Snapshot next to the config registry's domain, or in the environment
   configuration?
2. **Reload storage.** Which storage keeps the signed start across a reload
   (session storage, or the shell's existing store), and when is it cleared?
3. **Showing the client seed before the result.** Should the Wrapper show it, or
   let the player set their own? The backend leaves this open.
4. **Refusal labels.** Which of the backend's refusal codes need their own
   player-facing label, and which share a generic one?
5. **Latency.** A measurement of the full start, from bet to result, once both
   sides are built.
