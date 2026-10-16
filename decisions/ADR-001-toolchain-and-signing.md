# ADR-001 — Pure TypeScript on a pnpm workspace, and hand-written EIP-712 signing over `@noble`

- Status: accepted
- Date: 2026-10-16 (proposed 2026-10-15)

## Context

`se-client-kit` is the public home of everything the player's browser runs in
SuperEngine ([specs/client-kit.md](../specs/client-kit.md)): the Wrapper, as a
headless shell and a UI, and the libraries it is built from. The shell holds
the action key that can cash out the player's round and the play token, signs
every action, and renders the Snapshot ([specs/wrapper.md](../specs/wrapper.md)).

Three facts shape how it is built:

- **The code that holds the key is the code to keep small.** Every dependency
  in it is attack surface the player cannot see.
- **It does what the backend does, in another language.** It signs the same
  EIP-712 messages the backend's Go verifier checks and validates the same
  Snapshot the backend serves. Two independent implementations checked against
  the same vectors are where the confidence comes from.
- **It is public and it publishes.** Anyone can read it, and its packages and
  Wrapper bundle are installed and served to players, so the build and the
  release are part of the trust.

The backend's decision to host this code in one public repository, and the
rules that follow from it, are recorded on the backend's side (the backend's
decision record for this repository, which is in a private repository and is not
linked from here). This ADR records the kit's own technical decisions.

## Decision

1. **One monorepo** holds everything the player's browser runs. There is no
   other frontend repository.
2. **Packages** (working scope `@superengine`; the final npm scope is a TPO
   decision, below):

   | Package                             | Role                                                                                                                                                                                         |
   | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `contracts`                         | **data only**: everything vendored from the backend (the Play API OpenAPI document, the Snapshot schema, the signing and Snapshot vectors), the types generated from them, and the lock file |
   | `signing`                           | EIP-712 and secp256k1: the fixed set of types, canonical signatures                                                                                                                          |
   | `snapshot`                          | the hand-written validator and the render helpers for `se.snapshot/1`                                                                                                                        |
   | `play-client`                       | a typed client for `/play/v1`, with its types taken from `contracts`                                                                                                                         |
   | `shell`                             | the headless part of the Wrapper: sessions, key custody, transcript, checks, the controller boundary                                                                                         |
   | `wrapper` (app, not an npm package) | the UI, built into a release bundle                                                                                                                                                          |

   Dependency direction: `contracts` is a leaf; `snapshot` and `play-client`
   depend on it; `signing` depends on nothing at run time and takes vectors from
   `contracts`' test-only entry in its tests; `shell` depends on `signing`,
   `snapshot`, and `play-client`; the `wrapper` app depends on `shell`; the
   reference game depends on nothing but the type definitions of the controller
   protocol. No cycles, enforced in CI. The shell is the only code that touches a
   credential.
   **`contracts` is data only, with two entry points**: a runtime entry (the
   schemas and generated types) and a test-only entry (the vectors). Vectors must
   never reach a browser bundle: a lint rule limits imports of the test-only entry
   to tests, the build fails if any bundle or release output contains a vector,
   and the published tarball excludes the test-only entry.

3. **Toolchain:**
   - **pure TypeScript with no UI framework.** The Wrapper's UI is a bet
     selector, a status, a result, an error panel, and an iframe host; a
     framework would put a large dependency graph in the code that holds the
     key. Native elements also carry most of the accessibility the UI needs;
   - **pnpm** with pnpm workspaces;
   - **Vite** to build the Wrapper app, and **Vitest** for unit and component
     tests, with **jsdom** as the DOM for component tests (the most complete DOM
     for axe-core checks; Web Locks, `crypto`, and `fetch` are injected fakes);
   - **oxc** for lint and format of TypeScript and JSON (`oxlint`, `oxfmt`), and
     **prettier for Markdown and YAML only**, which oxfmt does not cover;
   - **generated types**: `openapi-typescript` for the OpenAPI documents and
     `json-schema-to-typescript` for the Snapshot JSON Schema (structural types
     only; the conditional rules stay in the hand-written validator). Both write
     committed files into `contracts` and are development dependencies;
   - **Playwright** for browser end-to-end tests, with an axe-core integration
     for accessibility (a development dependency);
   - **changesets** for versioning and release notes;
   - **GitHub Actions** for CI and release, with **npm provenance** for every
     published package.
4. **Cryptography in `signing`**: a hand-written, fixed-type EIP-712 encoder
   over `@noble/curves` and `@noble/hashes`, mirroring the backend's Go
   decision. Signatures are canonical 65-byte `r ‖ s ‖ v`, `v` in `{27, 28}`,
   low `s`; recovery rejects any other length, `v`, a high `s`, and the zero
   address; signing is deterministic (RFC 6979). The vectors come from the
   contracts repository's `test/vectors/signing.json` (generated with `viem`, so
   an independent implementation checks the kit) and the worked-round vectors,
   copied into the kit with the source commit noted. The signed-action grammar
   and `T_0` belong to the backend's signed-action spec and are not decided here.
5. **Contracts are shared as documents, never code.** The kit copies the Play
   API document, the Snapshot schema and vectors, and the signing vectors into
   the `contracts` package, pinned in its lock file with the source commit and a
   SHA-256 per file. A contract sync touches that one package. No git submodule. The kit's CI holds no credential for a private
   repository. **Decided (TPO, 2026-10-15; [wrapper.md OQ-6](../specs/wrapper.md#decided-questions)):
   vendor now, publish later.** The kit does not wait for the backend to publish;
   when the backend publishes its contracts, the `contracts` package is replaced
   by that dependency without touching a logic package, and a drift-check job
   compares against the published sources.
6. **The Snapshot validator is hand-written** over the schema's small keyword
   profile (no `ajv`): `ajv` compiles validators with `new Function`, which a
   Content Security Policy without `unsafe-eval` forbids, and the same profile is
   already evaluated by a short evaluator on the backend side. A standalone-compiled
   `ajv` stays an option if the evaluator proves hard to maintain.
7. **Supply-chain minimum.** A committed lockfile installed frozen; dependency
   lifecycle scripts off by default; GitHub Actions pinned by full commit SHA;
   provenance on every publish; a build that is reproducible from a commit and
   the lockfile; secret scanning with push protection on.
8. **npm dependency allow-list.** Runtime dependencies of published packages are
   `@noble/curves` and `@noble/hashes`, in `signing` only. Everything else (the
   tools above, `typescript`, `openapi-typescript`, type packages) is a
   development dependency that does not reach a published artifact. A new
   runtime dependency needs an ADR first; a new development tool needs an
   amendment of the table below.
9. **The Wrapper bundle** is released with an integrity manifest and an
   attestation. A deploy job on the SuperEngine side pulls a released version by
   digest, verifies it, and serves it from the SuperEngine origin. Hosting and the
   deploy credentials are an open item for the infrastructure owner; this
   repository holds no deploy credential.
10. **Three TypeScript rules** (accepted with this ADR; `AGENTS.md` and the
    conventions memory point here):
    - **named exports only** in libraries; no default exports;
    - **public entry points only**: a package is imported through its
      `package.json` `exports`, never through its internals;
    - **no import-time side effects**: a published package is tree-shakeable ESM
      and does nothing when imported.

## Alternatives considered

- **A UI framework (React or another).** Faster for a large UI. Rejected: the
  Wrapper's UI is small, and a framework's dependency graph, its runtime, and
  its build plugins would sit in the program that holds the key. A framework can
  be adopted later by an ADR if the UI grows.
- **`viem` or `ethers` for signing.** Mature and complete. Rejected for the
  shipped code: a general JSON-driven EIP-712 encoder and a wide dependency
  graph for a fixed set of eight types, in the most security-sensitive file of
  the kit. They are the right independent generator of the vectors, which is the
  role they keep. Adding a type is an edit to the package and a new vector.
- **Merge `contracts` into `snapshot`.** One package fewer. Rejected: the vendored
  data is used by `snapshot`, `play-client`, and the tests of `signing`, so
  putting it in `snapshot` makes `play-client` and `signing` depend on the
  validator package for data, blurs data and logic, and leaves the lock file and
  the Play API document in a package named for one contract. A data-only package
  also gives the drift check one input and lets a published backend package
  replace it without touching any logic.
- **Split the vectors into their own package.** Rejected for now: the vectors and
  the schemas change together under one lock file, and a second package would
  split one sync across two. The two entry points of `contracts` give the same
  guarantee (vectors never in a bundle) with one package, and the split stays
  possible if the entry points prove too weak.
- **One repository per package (polyrepo).** Independent access and versioning.
  Rejected: the packages change together with the Wrapper, share one vector
  set and one CI, and would need cross-repository version choreography for a team
  of two coding engineers.
- **Nx or Turborepo on top of the workspace.** Task graphs and remote caching.
  Rejected for now: a handful of projects need no build orchestrator, remote caching
  needs a credential (a secret in a public repository's CI), and pnpm's
  workspace filtering is enough. Revisit if build time hurts.
- **A git submodule or a fetch in CI for the contracts.** No copies. Rejected:
  the sources are private, so it needs a credential in a public repository's
  workflow, and a submodule pins a private repository's history into a public
  one. A copy with a lock and a drift check needs none.
- **`ajv` for the Snapshot.** See decision 6.

## Consequences / tradeoffs

- **A small, reviewable surface.** Two runtime dependencies, one encoder for a
  fixed type set, pinned by vectors another implementation produced.
- **One more package, with a strict rule.** `contracts` must stay free of logic,
  and the vector-isolation checks must stay in CI; a reviewer treats any function
  added to it as a defect.
- **Supply-chain risk is the kit's main risk.** The allow-list, frozen installs,
  SHA-pinned Actions, and provenance bound it; they do not remove it. A
  compromised publishing credential or Action is a player-facing incident
  ([runbook](../runbook/client-kit-release.md)).
- **Contract copies can drift.** The lock file, the offline hash check, and the
  drift job make drift visible; they do not make it impossible.
- **The kit releases on its own cadence**, with a compatibility statement per
  release (the Play API prefix, the Snapshot schema, the vector set).
- **The e2e suite needs the private preview stack for the preview run.** It runs
  from a job owned by the backend repository at a pinned kit commit, and against a
  fake Play API in this repository's CI.
- **Open items** (each with a `TODO` marker in the specs): the npm scope (the
  TPO); the license, MIT today, confirmed in review (the TPO); the npm
  publishing credential form (the infrastructure owner); hosting and deploy of
  the released Wrapper (the infrastructure owner); where the backend later
  publishes its contracts (a later step, not a blocker).
- **Accepted as proposals (TPO, 2026-10-15):** the hand-written Snapshot
  validator instead of `ajv` (decision 6); `@axe-core/playwright` and
  `openapi-typescript` as development dependencies; GitHub Actions pinned by
  full commit SHA; a pull deploy, so deploy credentials never enter this public
  repository (decision 9); and the kit's end-to-end suite run from a job owned by
  the backend repository at a pinned kit commit. The ADR as a whole was
  accepted on 2026-10-16.

### Dependency table

| Package                                                                                                                                                                                                              | Kind                    | Why                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@noble/curves`                                                                                                                                                                                                      | runtime, `signing` only | secp256k1 signing and recovery with RFC 6979                                                                              |
| `@noble/hashes`                                                                                                                                                                                                      | runtime, `signing` only | Keccak-256 and SHA-256                                                                                                    |
| `typescript`, `vite`, `vitest`, `jsdom`, `oxlint`, `oxfmt`, `prettier` (Markdown and YAML), `@playwright/test`, `@axe-core/playwright`, `@changesets/cli`, `openapi-typescript`, `json-schema-to-typescript`, `pnpm` | development only        | compile, build, test, DOM for component tests, lint, format, accessibility checks, release notes, and the generated types |

Exact versions are pinned by the lockfile and the `packageManager` field.
<!-- TODO(scaffolding): pin the versions in the toolchain pull request and record them here. -->

## References

- [specs/client-kit.md](../specs/client-kit.md), [specs/wrapper.md](../specs/wrapper.md),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`; the
  Snapshot schema `se.snapshot/1`; the signed-action spec; the signing vectors.
