# How the kit gets its contracts

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

The kit and the backend share **documents**, never code. Each document is copied
into the `contracts` package (`packages/contracts/`) and pinned in its
`contracts.lock.json`, which records, for each file, the source (by name), the
source commit, and the SHA-256 of the content. **Decided (TPO, 2026-10-15;
[OQ-6](../wrapper.md#decided-questions)): vendor now, publish later.** The
sources are private today, so the kit vendors copies and does not wait for the
backend to publish; no git submodule is used. When the backend publishes its
contracts (the Snapshot bundle, the OpenAPI documents, the vectors), the
`contracts` package is replaced by that dependency (option B) without touching a
logic package.

| Contract (by name and version)                                                         | Used by                | Form in the kit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Play API `/play/v1` and the verify API read (OpenAPI documents)                    | `play-client`          | in `contracts`: the Play and verify documents only, never any other surface's document (both documents, synced from se-backend). Types are generated with a pinned `openapi-typescript` (a development dependency) into committed files in `contracts`; `play-client`'s hand-written thin `fetch` layer sits on them. CI regenerates and fails on a diff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The Snapshot schema `se.snapshot/1`, its golden vectors, and the published bundle      | `snapshot`             | in `contracts`: the schema, types (runtime entry), and the `valid/`, `invalid/`, `signature/`, `typed-data/`, and `signed-action/` vectors (test-only entry; a `signature/` vector is a valid Snapshot with the verdict of the shell's W-26 checks; a `typed-data/` vector is the fields of a signed action and its canonical `typedData` bytes, which `signing` replays; a `signed-action/` vector is one such action signed by an independent signer, Foundry `cast`, with its EIP-712 message, hashes, digest, public test key, and signature, and a test checks that its `typedData` and message are those of the `typed-data/` vector it names). <!-- TODO(Snapshot bundle): the backend specifies a content-hashed bundle (schema plus vectors) for TypeScript consumers; until it is published the kit copies the schema file and the vectors by the same procedure, with the same lock entry. --> |
| The signing vectors (`test/vectors/signing.json`) and the signed-action spec's vectors | `signing`              | in `contracts`: the files, unchanged, on the test-only entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The SuperEngine fairness kernel, kernelVersion 1: its public vector sets               | the verify page (VT-2) | in `contracts`: the sets `kernel/public/v1/seed` (Seed and SeedHash), `kernel/public/v1/shuffle-draw` (ShuffleDraw alone, with the rule stated in its description), `kernel/public/v1/steps-derive` (StepsDerive over ShuffleDraw), and `kernel/public/v1/derive` (the step losers along a path), one file each under `vectors/kernel/v1/`, unchanged, on the test-only entry (`kernelVectors.v1`), synced from se-backend `9294d22`. The verify page's unit tests (`apps/verify`) replay all four sets against its kernel derivations, and the kit holds no other kernel logic. The kernel has no vectors yet for Coin Flip's payouts or for `roundSecretHash` ([verify page](../verify-page.md#what-the-page-recomputes-v-12-v-13)).                                                                                                                                                                    |
| The environment configuration schema                                                   | the Wrapper            | owned by the kit (in `shell`), not copied and not in `contracts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Rules:

1. **Vendor, with the source noted.** A contract file is copied by a person (or
   a script run by a person) with access, and the pull request shows the diff
   and the new lock entry. **No kit job holds a credential to read a private
   repository**: the kit's CI never fetches from one. The script is
   `tools/sync-contracts.ts`. It reads each file at a git ref of a local
   checkout (never its working tree), copies it byte for byte, and rewrites the
   lock in the same run. A lock entry (`lockVersion` 1) is `path` (in the
   package), `source` (the repository, by name), `sourceName`, `sourceCommit`
   (the last commit that touched the file, in full), and `sha256`. `sourceName`
   is the artifact's public name, fixed in the script
   (`play/v1 OpenAPI document`, `verify/v1 OpenAPI document`,
   `se.snapshot/1 schema`, `se.snapshot/1 vectors/valid/<file>`,
   `se.snapshot/1 vectors/invalid/<file>`,
   `se.snapshot/1 vectors/signature/<file>`,
   `se.snapshot/1 vectors/typed-data/<file>`,
   `se.snapshot/1 vectors/signed-action/<file>`, `test/vectors/signing.json`,
   and the fairness kernel's set ids `kernel/public/v1/seed`,
   `kernel/public/v1/shuffle-draw`, `kernel/public/v1/steps-derive`, and
   `kernel/public/v1/derive`, each the `set` its file names): a path inside a
   private repository is unpublished backend layout and is never recorded, and a
   test fails on a name that is not one of these. The local checkouts and the
   paths in them are given in a file named by `--sources`, kept outside this
   repository. Vectors are append-only: the script refuses to change or remove a
   locked vector unless it is given `--allow-vector-change`, which is legitimate
   only before the first release. It was used three times: for the pre-release
   exception of rule 4, for the signing vectors of contracts release 1.0.0
   (their `_comment` changed), and for the kernel's `kernel/public/v1/seed` set
   at se-backend `9294d22` (its reference vector's description now names the
   `shuffle-draw` set; its inputs and expected values are unchanged). Generated
   files are rewritten by `tools/generate-contracts.ts --write`.
2. **Verify offline.** The `contracts` job recomputes each copied file's SHA-256
   and fails when it differs from the lock, and fails when the generated types
   in `contracts` differ from a regeneration of the committed documents.
3. **Detect drift.** Until the backend publishes its contracts, drift is
   detected from the backend side, which reads this repository's public lock
   file (no credential needed), and by the person who runs the sync. Once a
   published source exists, a `contracts-drift` job compares each lock entry
   with it and reports a difference as a warning for an additive change and a
   failure for a breaking one.
   <!-- TODO(contract publication, #138): deferred to #138 until go-live (owner: backend maintainers). The published locations; then the drift job and its severity. Reason: there is no public location before the first release; until then the kit vendors each document byte for byte from a pinned commit, with the source commit and a SHA-256 per file in the lock. -->
4. **Additive changes are synced.** Within `/play/v1` and `se.snapshot/1`
   changes are additive. Clients are tolerant readers only within what the
   schema they were built against allows (absent optional fields, members of the
   objects it leaves open); the Snapshot schema closes its objects, so a new
   Snapshot field, `status`, or error `code` is rejected by a kit that has not
   synced it (`snapshot` package, W-28, W-29). Such a change reaches players
   with a kit release that syncs the new schema.

   A change of meaning with no change to the schema is still a contract change:
   the kit restates it in its own specs when it syncs the document or vector
   that carries it. **The cancel's answer** (the Play API document and the
   `valid/coinflip-resolving-cancel` vector, synced from se-backend `b27afc5`):
   `canceled` is final, and once a round shows it its status never changes
   again. A cancel the engine has not answered yet is answered, and read back,
   as `resolving`, with no pick, no reveal, and no `closeReason`, on the
   `readyHash` the cancel was signed on. A later read shows the cancel's
   outcome: `canceled`, or `active` again (a move was applied first, or the
   engine refused the cancel); since `726f0a2` (below) a read after the round
   ended keeps showing it. A cancel of a round that is not `active`, one still
   `resolving` included, is a 422 `FAILED_PRECONDITION`. The schema already
   allowed all of these, so no field or status was added.

   **The last round on the Snapshot read** (the Play API document's
   `getSnapshot` and `cancelRound` descriptions, synced from se-backend
   `726f0a2`; no schema, vector, field, or status changed):
   `GET /play/v1/snapshot` answers the session's most recent round, ended rounds
   included, until the next `rounds:start` creates another: an open round, or a
   `won`, `lost`, or `canceled` one with its result (and on `won` and `lost` its
   `payout`). `idle` means that no round is in progress and none has ended since
   the last `rounds:start`: the session has no round yet, or its last round was
   voided or refused. The answer of that `rounds:start` carries the void or
   refusal reason, and the read never repeats it. After a cancel answered
   `resolving`, a read shows `resolving` until the engine answers, then
   `canceled` or `active`, and the round stays the session's last round once it
   has ended. Before `726f0a2` a read after a round ended showed `idle`. The
   shell's cancel already reads `canceled`, `won`, and `lost` as the round's
   result and keeps `idle` as `ended`, a defensive fallback: the backend says
   `idle` never follows `active` (W-25). The Wrapper offers the next bet beside
   an ended round's result, from that Snapshot's `bet` (W-31 in
   [Rendering from the Snapshot](../wrapper/rendering-from-the-snapshot.md)).

   **A cancel that loses to the round's closure** (the Play API document's
   `cancelRound` and `getSnapshot` descriptions, synced from se-backend
   `b47b286`; no schema, vector, field, or status changed): when the engine had
   already closed the round before the cancel arrived (a final move whose answer
   was lost, or the time limit), the round ends as the engine closed it and the
   cancel is never honored. `rounds:cancel` answers the round's Snapshot with no
   error: `won` or `lost` with its `payout`, or `canceled` with
   `closeReason: "expired"` (the bet refunded). When the engine has not answered
   the cancel yet, the answer is `resolving`, and a later read shows the round's
   result. The Snapshot read now says that the round and `bet.balance` are read
   separately, so `bet.balance` may be newer than the round, and the next read
   shows both as they are. The shell's cancel already reads `won`, `lost`, and
   `canceled` as the round's result (`sent`, W-25), and a round that stays
   `resolving` ends in `check-later`; the Wrapper never shows such a closure as
   canceled by the player (W-33).

   **A cancel that may have been taken, and a round resolved manually** (the
   Play API document's `cancelRound` description, synced from se-backend
   `65504f5`; no schema, route, vector, field, or status changed): after a lost
   response, `UNAVAILABLE`, or `INTERNAL`, the cancel may already have been
   taken, so read `GET /play/v1/snapshot` before sending it again. A round the
   engine cannot settle on its own stays `resolving` until it is resolved
   manually, and the Snapshot keeps showing `resolving` until the round ends.
   The shell reads a 503 and a 500 `INTERNAL` to the cancel as possibly stored:
   it reads only and never sends the cancel again after either (an `active` read
   gives `not-taken`), more conservative than the document, which allows a
   resend after the read (decided in human review, 2026-10-19; W-25). A round
   that stays `resolving` ends in `check-later` ("still resolving — contact
   support").

   **A start, a move, or a cash-out that may have been taken** (the Play API
   document's `startRound` and `continueRound` descriptions, which
   `cashOutRound` follows, synced from se-backend `075b850`; no schema, route,
   vector, field, or status changed): after a lost response, `UNAVAILABLE`, or
   `INTERNAL`, the round may already have been started, or the move taken; the
   same key and body (for a move, the same key and signed action) answer it, so
   sending them again is safe. A resend may fail the same way, and
   `GET /play/v1/snapshot` shows the round either way. The shell sends a start
   again once after those, and after a 503 with no problem body (W-22). For a
   move or a cash-out it stays more conservative (decided in human review,
   2026-10-19; W-16): its one resend follows only a lost send (no answer, or a
   503 not marked `retryable: false`) and a read that shows it not applied;
   after a 500 `INTERNAL`, or a 503 marked `retryable: false`, it resends
   nothing, the action stays pending, and the reads decide.

   **A stale action is a 409, and free-bet grants** (the Play API document,
   synced from se-backend `9ffdcc0`; no Snapshot schema, vector, error code, or
   existing response status changed): a move or a cash-out with a wrong
   `sequence` or `previous` is now answered 409 `STALE_ACTION`, like another
   action at an accepted sequence, where it was a 400 `INVALID_ARGUMENT`; a
   cancel still answers 400. The shell already resynchronizes after either code
   (W-19), and the Wrapper maps `STALE_ACTION` to out-of-sync, so no behavior
   changed. The document also gained `GET /play/v1/grants` (`listGrants`), its
   `GrantList` and `PlayGrant` schemas, and an optional `grantId` on the
   `rounds:start` request. The kit uses none of it (free bets are out of scope):
   the generated types carry them, `PLAY_ROUTES` lists the route, and no client
   function, shell use case, or Wrapper screen reads or sends a grant.

   **The payout** (the Snapshot schema, the Play API document, and the `payout`
   vectors, synced from se-backend `f8cc92b`): an additive change, a new
   optional top-level `payout`, an `Amount` computed by the server and never
   pending, that says what the finished round credited the player. The schema
   allows it on `won` and `lost` only, 0 included (`valid/coinflip-won-payout`,
   `valid/coinflip-lost-payout-zero`), and rejects it on `idle`, `starting`,
   `active`, `resolving`, and `canceled` (`invalid/payout-on-*`); the server
   always sends it on `won` and `lost`, but the schema keeps it optional. It is
   always what the round paid: a `lost` round that its time limit closed after a
   cash-out above 0 but below the bet has that credit as `payout` and the last
   multiplier it survived as `currentMultiplier`
   (`valid/steps-lost-expired-payout`); every other `lost` round has `payout` 0.
   The kit takes it as the schema gives it: the shell does not forward it to the
   game (W-38), and the Wrapper shows it beside a `won` result, and beside a
   `lost` one when it is above 0 (W-31 in
   [Rendering from the Snapshot](../wrapper/rendering-from-the-snapshot.md)).
   The `snapshot` package's per-status types say `payout?: never` on every other
   status, as the schema does.

   **The signing vectors of contracts release 1.0.0**
   (`test/vectors/signing.json`, synced from the contracts repository at release
   `1.0.0`, commit `2f060eb`; the lock records `b9c1556`, the last commit that
   touched the file; contracts pull request 8): an additive change that puts the
   registry's player cancel in the vectors. The file adds a `PlayerCancel` entry
   in `types` (type hash `0xacaf7a5a…9ce6`, the one the kit already encodes),
   `payoutTerms` (six named terms with their hashes), and `closes` (nine full
   rounds, ending in `closed`, or in `canceled` for the player's cancel). Every
   older field is unchanged; the file's bytes changed with its `_comment`, so
   the sync used `--allow-vector-change`. That is allowed only before the first
   release (`AGENTS.md`: a released version's vector files are never edited),
   and nothing has been released yet (all packages `0.0.0`, no tags). It is not
   the OQ-7 exception below. The registry now reverts a payout above `uint128`
   (`PayoutOverflow`) instead of saturating it; the kit computes no payout, so
   no kit code changes. The `signing` tests replay what the kit can encode
   (`close-vectors.test.ts`; the [cryptography spec](./the-cryptography.md) says
   which parts) and skip `payoutTerms` hashes, for which the kit has no encoder.

   **One pre-release exception** (decided with
   [OQ-7](../wrapper.md#decided-questions); nothing had shipped against the old
   shape): `se.snapshot/1` made `proofs.createRoundAuth` required on a config
   Snapshot that carries `proofs` (from a bound `starting` on), a change that is
   not additive. With it the backend changed existing vectors: the config
   `valid/` and `invalid/` vectors that carry `proofs` gained a
   `createRoundAuth`, and `invalid/problem-default-code-retryable-mismatch` was
   removed when `UNAVAILABLE` became retryable by default instead of always
   (`sessions:redeem` sends it with `retryable: false`, now the
   `valid/problem-default-code-unavailable-not-retryable` and
   `valid/problem-redeem-unavailable` vectors). The kit vendored the schema and
   the vectors as they are, with `--allow-vector-change` (rule 1). After the
   first release no such exception exists: `/1` takes additive changes only, and
   a released vector file is never edited or removed.

5. **Review before publish.** Every file copied into this public repository is
   reviewed as
   [Never in the public repository](../client-kit.md#never-in-the-public-repository)
   says. The signing vectors use a well-known local test key and are public by
   design; the review still happens. The `signed-action/` vectors also carry
   that kind of key in their own bytes (`testKey.privateKey`, and the `cast`
   commands in `generatedWith` that use it): the well-known account 3 of the
   default local development mnemonic, the same key as `PLAYER_KEY` in
   `signing`'s fixtures, labelled test-only in the vector. They name no host,
   token, or URL other than the public Foundry image. Decided (human review,
   2026-10-17): the vendored `signed-action/` vectors are, with
   `packages/signing/src/fixtures/keys.ts`, the only files that may hold that
   public development key (the AGENTS.md exception). The key is test-only and
   never funded, and the copies stay byte for byte (vectors are append-only), so
   it is never removed or reworded here; any other key in a copied file is
   refused in review.

   The fairness kernel's vectors (kernelVersion 1) hold test inputs and expected
   values only: hex block values, round secrets, and seeds made for the vectors
   (all-zero, all-`0xff`, and `keccak256` of a short label among them), step
   counts, ShuffleDraw labels (`steps-v1`, `cosmetic-v1`, and made-up ones), and
   error names. Their descriptions name the kernel's public functions (Seed,
   SeedHash, ShuffleDraw, StepsDerive) and the released game Cash or Crash, and
   no path, host, person, or unreleased game. A `secret` there is a vector's
   round secret, never a credential.

   Accepted (human review, 2026-10-16): the signing vectors' `_comment` fields
   name the contracts repository's test tooling. These are names, not contents;
   copies stay byte for byte, so any rewording comes from the source. The
   Snapshot vectors' descriptions that named backend decisions, documents, or
   components were reworded at the source and copied again under the one-time
   pre-release exception (rule 4).

   Issue #4's drift requirement is met, until the published locations exist, by
   the `contracts` job verifying the lock against the committed copies; the
   `contracts-drift` comparison job follows with them.
