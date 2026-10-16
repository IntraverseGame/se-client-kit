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

| Contract (by name and version)                                                         | Used by       | Form in the kit                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Play API `/play/v1` and the verify API read (OpenAPI documents)                    | `play-client` | in `contracts`: the Play and verify documents only, never any other surface's document. Types are generated with a pinned `openapi-typescript` (a development dependency) into committed files in `contracts`; `play-client`'s hand-written thin `fetch` layer sits on them. CI regenerates and fails on a diff.                                                  |
| The Snapshot schema `se.snapshot/1`, its golden vectors, and the published bundle      | `snapshot`    | in `contracts`: the schema, types (runtime entry), and the `valid/` and `invalid/` vectors (test-only entry). <!-- TODO(Snapshot bundle): the backend specifies a content-hashed bundle (schema plus vectors) for TypeScript consumers; until it is published the kit copies the schema file and the vectors by the same procedure, with the same lock entry. --> |
| The signing vectors (`test/vectors/signing.json`) and the signed-action spec's vectors | `signing`     | in `contracts`: the files, unchanged, on the test-only entry                                                                                                                                                                                                                                                                                                      |
| The environment configuration schema                                                   | the Wrapper   | owned by the kit (in `shell`), not copied and not in `contracts`                                                                                                                                                                                                                                                                                                  |

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
   is the artifact's public name, fixed in the script (`se.snapshot/1 schema`,
   `se.snapshot/1 vectors/valid/<file>`, `se.snapshot/1 vectors/invalid/<file>`,
   `test/vectors/signing.json`): a path inside a private repository is
   unpublished backend layout and is never recorded, and a test fails on a name
   that is not one of these. The local checkouts and the paths in them are given
   in a file named by `--sources`, kept outside this repository. Vectors are
   append-only: the script refuses to change or remove a locked vector unless it
   is given `--allow-vector-change`, which is legitimate only before the first
   release. Generated files are rewritten by
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
5. **Review before publish.** Every file copied into this public repository is
   reviewed as
   [Never in the public repository](../client-kit.md#never-in-the-public-repository)
   says. The signing vectors use a well-known local test key and are public by
   design; the review still happens. Accepted (human review, 2026-10-16): the
   signing vectors' `_comment` fields name the contracts repository's test
   tooling, and three Snapshot vectors' descriptions
   (`valid/cashorcrash-won-expired.json`,
   `valid/coinflip-canceled-expired-no-action.json`,
   `invalid/status-unknown.json`) cite backend decisions, a backend document and
   a backend module operation by name. These are names, not contents; vectors
   are append-only and copies stay byte for byte, so any rewording comes as a
   new vector at the source.

   Issue #4's drift requirement is met, until the published locations exist, by
   the `contracts` job verifying the lock against the committed copies; the
   `contracts-drift` comparison job follows with them.
