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

| Contract (by name and version)                                                         | Used by       | Form in the kit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Play API `/play/v1` and the verify API read (OpenAPI documents)                    | `play-client` | in `contracts`: the Play and verify documents only, never any other surface's document (today the Play document; the verify document is not published yet). Types are generated with a pinned `openapi-typescript` (a development dependency) into committed files in `contracts`; `play-client`'s hand-written thin `fetch` layer sits on them. CI regenerates and fails on a diff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| The Snapshot schema `se.snapshot/1`, its golden vectors, and the published bundle      | `snapshot`    | in `contracts`: the schema, types (runtime entry), and the `valid/`, `invalid/`, `signature/`, `typed-data/`, and `signed-action/` vectors (test-only entry; a `signature/` vector is a valid Snapshot with the verdict of the shell's W-26 checks; a `typed-data/` vector is the fields of a signed action and its canonical `typedData` bytes, which `signing` replays; a `signed-action/` vector is one such action signed by an independent signer, Foundry `cast`, with its EIP-712 message, hashes, digest, public test key, and signature, and a test checks that its `typedData` and message are those of the `typed-data/` vector it names). <!-- TODO(Snapshot bundle): the backend specifies a content-hashed bundle (schema plus vectors) for TypeScript consumers; until it is published the kit copies the schema file and the vectors by the same procedure, with the same lock entry. --> |
| The signing vectors (`test/vectors/signing.json`) and the signed-action spec's vectors | `signing`     | in `contracts`: the files, unchanged, on the test-only entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The environment configuration schema                                                   | the Wrapper   | owned by the kit (in `shell`), not copied and not in `contracts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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
   (`play/v1 OpenAPI document`, `se.snapshot/1 schema`,
   `se.snapshot/1 vectors/valid/<file>`, `se.snapshot/1 vectors/invalid/<file>`,
   `se.snapshot/1 vectors/signature/<file>`,
   `se.snapshot/1 vectors/typed-data/<file>`,
   `se.snapshot/1 vectors/signed-action/<file>`, `test/vectors/signing.json`): a
   path inside a private repository is unpublished backend layout and is never
   recorded, and a test fails on a name that is not one of these. The local
   checkouts and the paths in them are given in a file named by `--sources`,
   kept outside this repository. Vectors are append-only: the script refuses to
   change or remove a locked vector unless it is given `--allow-vector-change`,
   which is legitimate only before the first release. It was used once, for the
   pre-release exception of rule 4. Generated files are rewritten by
   `tools/generate-contracts.ts --write`.
2. **Verify offline.** The `contracts` job recomputes each copied file's SHA-256
   and fails when it differs from the lock, and fails when the generated types
   in `contracts` differ from a regeneration of the committed documents.
3. **Detect drift.** Until the backend publishes its contracts, drift is
   detected from the backend side, which reads this repository's public lock
   file (no credential needed), and by the person who runs the sync. Once a
   published source exists, a `contracts-drift` job compares each lock entry
   with it and reports a difference as a warning for an additive change and a
   failure for a breaking one.
   <!-- TODO(contract publication): the published locations; then the drift job and its severity. -->
4. **Additive changes are synced.** Within `/play/v1` and `se.snapshot/1`
   changes are additive. Clients are tolerant readers only within what the
   schema they were built against allows (absent optional fields, members of the
   objects it leaves open); the Snapshot schema closes its objects, so a new
   Snapshot field, `status`, or error `code` is rejected by a kit that has not
   synced it (`snapshot` package, W-28, W-29). Such a change reaches players
   with a kit release that syncs the new schema.

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

   Accepted (human review, 2026-10-16): the signing vectors' `_comment` fields
   name the contracts repository's test tooling. These are names, not contents;
   copies stay byte for byte, so any rewording comes from the source. The
   Snapshot vectors' descriptions that named backend decisions, documents, or
   components were reworded at the source and copied again under the one-time
   pre-release exception (rule 4).

   Issue #4's drift requirement is met, until the published locations exist, by
   the `contracts` job verifying the lock against the committed copies; the
   `contracts-drift` comparison job follows with them.
