# Client kit (`se-client-kit`)

Status: **Draft, for human review.** The repository exists (public, default
branch `main`) and holds this knowledge layer and the toolchain; the packages
and apps are empty skeletons so far ([Bootstrap](#bootstrap)). The decisions
behind it are [ADR-001](../decisions/ADR-001-toolchain-and-signing.md). The
Wrapper's behavior is [wrapper.md](./wrapper.md).

## Purpose

- `se-client-kit` is one **public** GitHub monorepo (organization
  `IntraverseGame`) that holds **everything the player's browser runs**: the
  Wrapper, as headless shell logic and as UI, and the libraries the shell is
  made of. There is no other frontend repository.
- **Why public.** The player trusts this code with the key that can cash out
  their round. A player, an operator, an auditor, or a game developer must be
  able to read exactly what holds that key, build it, and compare it with what
  is served. Closed code asks for trust; the kit's design asks for a check.
- It is also how the contracts the SuperEngine backend publishes (the Play API,
  the Snapshot, the signing vectors) get a second, independent implementation,
  in a different language, tested against the same vectors.

## Scope

In scope: the repository layout and packages, how each package gets its
contracts, versioning and compatibility, the supply chain, what must never be
public, the tests and CI jobs, and who owns what.

Out of scope: the Wrapper's behavior ([wrapper.md](./wrapper.md)); the
signed-action grammar (the backend's signed-action spec); the hosting and the
deploy credentials of the released Wrapper, an [open item](#open-items) for the
infrastructure owner; the procedure to release
([runbook](../runbook/client-kit-release.md)).

## Boundary

The kit is a repository of packages and apps. These are its ownership lines.

- **The kit owns:**
  - all browser code: the shell, the UI, the libraries;
  - the `contracts` package (the data vendored from the backend and its lock
    file), and the typed client, the Snapshot validator, and the signing code,
    as implementations of contracts it does not define;
  - the browser e2e suite (its tests; where some of them run is below);
  - its releases: npm packages and the Wrapper bundle.
- **The SuperEngine backend owns** (the source of truth, in private
  repositories):
  - the Play API contract (an OpenAPI document per surface) and its versioning;
  - the Snapshot schema `se.snapshot/1` and its golden vectors;
  - the signed-action spec and its vectors;
  - every rule of what the backend accepts, and its error codes;
  - the preview stack the end-to-end tests run against, and the deploy of a
    released Wrapper to the SuperEngine origin.
- **The contracts repository owns** the registry contract and the signing
  vectors file (`test/vectors/signing.json`, generated with `viem`).
- **Neither side imports the other's code.** They share contracts (documents and
  vectors), copied into the kit with a recorded source commit and a content hash
  ([Contracts](#how-the-kit-gets-its-contracts)). No git submodule is used.

## Contract

### Repository layout

```text
se-client-kit/
  packages/
    contracts/      DATA ONLY: the vendored contracts, generated types, the lock file
    signing/        EIP-712 and secp256k1
    snapshot/       validator and render helpers for se.snapshot/1
    play-client/    typed /play/v1 client
    shell/          headless part of the Wrapper
  apps/
    wrapper/        the Wrapper UI (Vite)
    reference-game/ a minimal sandboxed game for tests and as a sample
  e2e/              Playwright suite and the fake Play API
  tools/            repository checks and their tests (allow-list, test-only entry)
  .changeset/       pending release notes
  package.json, pnpm-workspace.yaml, pnpm-lock.yaml, .node-version
  tsconfig.base.json, .oxlintrc.json, .oxfmtrc.json, stylelint.config.mjs
  .github/          workflows, the setup action, CODEOWNERS, dependabot
```

Every workspace is a pnpm package with wireit scripts (see
[Task orchestration](#task-orchestration-and-caching)); the root `package.json`
fans them out. Exactly: the five `packages/*` and `apps/reference-game` have
`build` and `typecheck`; `apps/wrapper` has `build`, `typecheck`, and `test`
(Vitest with jsdom; today only an environment smoke test); `e2e` has `typecheck`
and `test` (Playwright, with no suites yet) and no `build`. **A package gets a
`test` script with its first real test**, not before: a `test` script that
passes with no tests would be a green check that checks nothing, so the empty
skeletons have none, and the root `test` runs the Wrapper's tests and the
`tools/` tests (`test:tools`). The pull request that adds a package's first test
adds its `test` script and its entry in the root `test` dependencies.

The names are working
names. <!-- TODO(TPO): the npm scope. `@superengine` is the working name used below (for example `@superengine/signing`); the npm organization must exist, be owned by the org owners, and not belong to a person. -->

### Packages

| Package                    | Published                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Depends on (kit)                                                                                           | Runtime dependencies                |
| -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@superengine/contracts`   | npm (runtime entry only) | **Data only, no logic.** Everything vendored from the backend and nothing else: the Play API OpenAPI document, the Snapshot JSON Schema, the signing vectors, the Snapshot vectors (and later the signed-action vectors), the types generated from them, `contracts.lock.json` (source commit and content hash per artifact), and the input of the drift-check job. It has **two entry points**: a **runtime** entry (the schemas and the generated types) and a separate **test-only** entry (the vectors), so vectors can never reach a browser bundle ([rules below](#the-contracts-package)). | none                                                                                                       | none                                |
| `@superengine/signing`     | npm                      | The hand-written, fixed-type EIP-712 encoder and secp256k1 signing and recovery: domain separator, type hashes, `hashStruct`, the `0x1901` digest, `PlayerAction`, `PlayerCashOut`, `PlayerCancel`, and the registry types the shell must recompute or verify (`NewRound`, `CreateRoundAuth`, `MarkReadyAuth`, `CloseRoundAuth`, `PayoutTerms`). Canonical 65-byte signatures. It takes vectors from `contracts` in **tests only** (a development dependency on the test-only entry).                                                                                                             | none at run time                                                                                           | `@noble/curves`, `@noble/hashes`    |
| `@superengine/snapshot`    | npm                      | The hand-written validator over the Snapshot schema's keyword profile (the `Snapshot`, `PlayProblem`, and `AmountRequest` validators) and the render helpers (pure functions over a validated Snapshot). It takes the schema and the types from `contracts`, and its tests take the vectors from `contracts`' test entry.                                                                                                                                                                                                                                                                         | `contracts`                                                                                                | none                                |
| `@superengine/play-client` | npm                      | A typed `fetch` client for the Play API (and the verify API read the Wrapper needs), generated from the OpenAPI documents. It takes its types from `contracts`, returns the Snapshot body as `unknown`, and never interprets it.                                                                                                                                                                                                                                                                                                                                                                  | `contracts`                                                                                                | none (it uses the platform `fetch`) |
| `@superengine/shell`       | npm                      | The headless part of the Wrapper: session and token lifecycle, key custody, the transcript, Web Locks, bind-receipt and tip checks, the controller boundary, the redacting types and logger. It has no DOM dependency beyond the platform APIs it is given.                                                                                                                                                                                                                                                                                                                                       | `signing`, `snapshot`, `play-client` (and `contracts` through them)                                        | none                                |
| `wrapper` (app)            | no: a release bundle     | The UI: rendering, accessibility, the iframe mount, the build. It uses the shell and renders only what the shell hands it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `shell` (and its types)                                                                                    | none                                |
| `reference-game` (app)     | no                       | A minimal game for the tests and as a sample for game developers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nothing but the type definitions of the controller protocol `se.controller/1` (type-only, no runtime code) | none                                |

Dependency direction. There are no cycles, and a package never imports an app:

```text
contracts ──▶ snapshot ────┐
    │                      ├──▶ shell ──▶ wrapper (app)
    └─────▶ play-client ───┤
signing ───────────────────┘
contracts (test-only entry) ──▶ the tests of signing, snapshot, shell, wrapper,
                                and the e2e fake Play API (devDependencies)
```

- `contracts` is the only leaf that holds data; `signing` has no kit dependency
  at run time. `snapshot` and `play-client` depend on `contracts`'s runtime
  entry. `signing` takes vectors from `contracts`' test-only entry in its tests.
  No other package imports `contracts` directly except in tests (the consumers
  of the test-only entry are listed [below](#the-contracts-package)). No package
  imports another sideways (`snapshot` and `play-client` never import each
  other), and a package never imports an app.
- `play-client` returns the Snapshot as `unknown`, so only `snapshot`'s
  validator can turn it into a typed value: a Snapshot cannot reach the renderer
  unvalidated by construction.
- `shell` is the only package that holds a credential. `wrapper` cannot reach
  the key or the token: the shell exposes use cases (`start`, `pick`, `cashOut`)
  and read-only state, never a secret.
- A lint rule enforces the direction: a `no-restricted-imports` entry per
  package and per package's test files in `.oxlintrc.json`, checked in CI by
  `pnpm lint`. A fixture test (`tools/import-direction.test.ts`) runs the real
  configuration over scratch files and fails if a violating import is not
  reported (the cases are in `tools/fixtures/import-direction-cases.ts`). The
  same entries reject another package's internals (`/src`, `/dist`, a relative
  path into a sibling package) and the `contracts` test-only entry outside
  tests.
- The same configuration enforces the other code rules that a linter can
  express: the `correctness`, `suspicious`, `pedantic`, and `perf` categories
  (all errors, and any warning fails the run); no `any`; no `@ts-ignore`,
  `@ts-nocheck`, or reasonless `@ts-expect-error`; no default export in a
  library; no side-effect import (`import "./x"`), so a module has no
  import-time side effect from its imports; a `.ts` extension on relative
  imports; type-only imports marked as such; no non-null assertion, `eval`,
  `new Function`, or `==`; no `console` in library code; no focused or skipped
  test; and an unused lint-disable directive is an error. A top-level call or
  assignment that runs at import time is not expressible as a lint rule and
  stays a review item, and so does the reason on a lint-disable comment or a
  `@ts-expect-error`: the human reviewer and the reviewer agent enforce it,
  there is no rule for it (an unused disable directive is an error). Type-aware
  rules are not enabled (they need `oxlint-tsgolint`, which is not in the
  ADR-001 allow-list; adding it is a follow-up pull request with an ADR
  amendment). `unicorn/require-module-specifiers` is off only because the empty
  package skeletons are `export {};`; the first pull request that gives a
  package real code re-enables it.
- **CSS** is linted by stylelint (`pnpm lint:css`, part of `pnpm lint`) with the
  hand-written `stylelint.config.mjs`: correctness rules (no unknown property,
  at-rule, function, unit, or value; no invalid hex color; no duplicate selector
  or property; no empty block) and the Wrapper's constraints: no `!important`;
  no `@import`; only `data:` and same-origin relative `url()` (the Wrapper runs
  under a strict CSP and is served from the SuperEngine origin); no vendor
  prefixes. It enables no stylistic rule, because oxfmt formats. The cases are
  in `tools/css-lint.test.ts`. Files under `dist`, `.wireit`, `node_modules`,
  and the `.gitignore` paths are not linted.
- **Tool scripts.** The TypeScript scripts under `tools/` run with `tsx`
  (`tsx tools/<script>.ts`, a root development dependency). `tsx` brings
  `esbuild`, whose install script only verifies a prebuilt binary; it is denied
  in `allowBuilds`, so no lifecycle script runs.

### The `contracts` package

`contracts` holds the **data** the kit vendors from the backend and **nothing
else**. It has no logic: no validator, no client, no encoder, no helper. The
logic packages read it and never write to it.

- **Contents.** The Play API OpenAPI document (the Play and verify documents
  only), the Snapshot JSON Schema, the signing vectors, the Snapshot vectors
  (`valid/` and `invalid/`), later the signed-action vectors, the types
  generated from the documents and the schema (`openapi-typescript` for the
  OpenAPI documents; `json-schema-to-typescript` for the Snapshot schema, which
  gives the structural types only: the conditional blindness rules stay with the
  validator in `snapshot`), the **lock file** `contracts.lock.json` (source,
  source commit, and SHA-256 per artifact), and the input of the drift-check job
  (the lock file itself and the list of published sources). Generated files are
  committed and never edited by hand.
- **Two entry points** (`package.json` `exports`):
  - the **runtime entry** (`.`) exports the schemas and the generated types. It
    is the only entry any production code may import;
  - the **test-only entry** (`./testing`) exports the vectors. Only test files
    may import it.
- **Vectors never reach a browser bundle.** Three checks, all required:
  1. a lint rule (an import restriction) fails any import of the test-only entry
     from a file that is not a test file or a test helper;
  2. the `build` job fails if the Wrapper bundle, or the output of any package
     built for release, contains the test-only entry's module or any vector file
     (a content check over the build output);
  3. the published `contracts` tarball excludes the test-only entry (the `files`
     field), so a consumer of the npm package cannot import vectors at all.
- **Dependencies.** `contracts` depends on no other kit package and has no
  runtime dependency. `snapshot` and `play-client` depend on its runtime entry;
  the test-only entry has these consumers, **all of them tests and all of them
  development dependencies**: the unit tests of `signing`, `snapshot`, and
  `shell`; the Wrapper's component tests; and the e2e suite's fake Play API. It
  never reaches a published tarball or a browser bundle (the three checks
  above).
- **Replaceable by design.** If the backend later publishes its contracts as a
  package (OQ-6 decided: publish later, option B), `contracts` is the one
  package that is replaced by that dependency (or becomes a thin re-export of
  it). No logic package changes, because none holds a copy or an import path of
  its own.
- **The lock file lives here.** A contract sync touches one package.

### The cryptography

- `signing` is a hand-written encoder for a **fixed set of types**, over
  `@noble/curves` (secp256k1) and `@noble/hashes` (Keccak-256, SHA-256). It
  follows the rules of the backend's Go verifier: signatures are 65 bytes
  `r ‖ s ‖ v`, `v` in `{27, 28}`, low `s`; recovery rejects any other length,
  `v`, a high `s`, and the zero address; signing is deterministic (RFC 6979) and
  normalizes `s`.
- No general EIP-712 library (`viem`, `ethers`) is a dependency. They are used
  only as the independent generator of the vectors in the contracts repository.
- **Vectors.** The package's tests replay `test/vectors/signing.json` from the
  contracts repository (the file `viem` generated, so an independent
  implementation checks this one) and the worked-round vectors, read through the
  test-only entry of the `contracts` package, where they are copied with their
  source commit noted. The signed-action spec's vectors join them.
  <!-- TODO(signed-action spec): the spec's vector file and where it is published. -->

### How the kit gets its contracts

The kit and the backend share **documents**, never code. Each document is copied
into the `contracts` package (`packages/contracts/`) and pinned in its
`contracts.lock.json`, which records, for each file, the source (by name), the
source commit, and the SHA-256 of the content. **Decided (TPO, 2026-10-15;
[OQ-6](./wrapper.md#decided-questions)): vendor now, publish later.** The
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
   repository**: the kit's CI never fetches from one.
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
4. **Additive changes cost the kit nothing.** Within `/play/v1` and
   `se.snapshot/1` changes are additive, and clients are tolerant readers, so an
   older kit keeps working; the sync adds new fields when the kit wants them.
5. **Review before publish.** Every file copied into this public repository is
   reviewed as [Never in the public repository](#never-in-the-public-repository)
   says. The signing vectors use a well-known local test key and are public by
   design; the review still happens.

### Versioning and compatibility

- The kit uses semantic versioning per package, managed by changesets. The
  published packages (`contracts`, `signing`, `snapshot`, `play-client`, and
  `shell`) version independently; the Wrapper bundle has its own version and a
  release record.
- **Contract compatibility.** A kit built for `/play/v1` and `se.snapshot/1`
  keeps working through every additive change of those contracts. A breaking
  change is a new surface prefix (`/play/v2`) or `se.snapshot/2`, served
  alongside the old one for a deprecation window, and a new **major** of the
  affected kit packages.
- The kit states what it was built against in `contracts.lock.json` and in each
  release's notes: the Play API prefix, the Snapshot schema id, and the signing
  vector set. A Wrapper release is served only against a matching backend
  contract
  ([release runbook](../runbook/client-kit-release.md#verify-before-and-after)).
- The release cadence is independent of the backend's: the kit can ship a UI fix
  without a backend release, and the backend can ship an additive change without
  a kit release.

### Supply chain

The kit publishes code players run and packages others install, so its build is
the attack surface a player cannot see. The rules:

- **Lockfile and install.** `pnpm-lock.yaml` is committed; CI installs with
  `--frozen-lockfile`. Dependency lifecycle scripts are disabled by default
  (only an explicit allow-list may run one), and the lockfile and every
  `package.json` are code-owner paths. A newly published dependency version
  SHOULD wait a configured age before it is accepted (pnpm's minimum release
  age). The age is **7 days** (`minimumReleaseAge: 10080` minutes, strict, in
  `pnpm-workspace.yaml`), no lifecycle script is allowed (`allowBuilds` has no
  `true` entry; `esbuild`, brought by `tsx`, is denied explicitly so the strict
  check passes), the trust policy is `no-downgrade`, and dependencies are saved
  at an exact version. Dependabot's `cooldown` is 7 days to match, for the `npm`
  and the `github-actions` ecosystems.
- **Runtime dependencies are an allow-list**: `@noble/curves` and
  `@noble/hashes`, and nothing else
  ([ADR-001](../decisions/ADR-001-toolchain-and-signing.md)). Anything else
  needs an ADR first. A CI job (`allow-list`, `pnpm check:deps`) fails if any
  `package.json` declares a dependency outside the list in
  `tools/allowed-dependencies.json`, which a test keeps equal to the ADR's
  table. It checks names and specifiers in `dependencies`, `devDependencies`,
  `peerDependencies`, and `optionalDependencies`, in `overrides`,
  `pnpm.overrides`, `resolutions`, `catalog`, and `catalogs` of every
  `package.json`, and in `overrides`, `catalog`, and `catalogs` of
  `pnpm-workspace.yaml`. A specifier must be an exact registry version (or
  `workspace:` for a kit package, or a `catalog:` reference); git, URL, `file:`,
  `link:`, `npm:` alias, range, and tag specifiers are rejected, as is any
  construct in those YAML sections the check cannot read.
- **Pinned toolchain.** The Node version, the package manager (`packageManager`
  with its hash), and every GitHub Action (**by full commit SHA**, updated by
  Dependabot's pull requests) are pinned.
- **Provenance.** Packages are published from GitHub Actions with npm
  provenance, so each version links to the commit and workflow that built it.
  The Wrapper bundle is released with a build-provenance attestation and a
  SHA-256 manifest of every file.
- **Credentials.** The publishing credential is never in the repository. The
  preferred form is npm trusted publishing from the release workflow (no
  long-lived token); otherwise a token in a protected GitHub environment with
  required
  reviewers. <!-- TODO(infrastructure owner): which form the npm organization supports, and the rotation procedure. -->
- **Reproducible build.** The Wrapper build is deterministic for a commit and a
  lockfile, so anyone can rebuild a release and compare its manifest.
- **Vulnerability and license checks** run in CI on every change and on a
  schedule (`pnpm audit` for production dependencies: the CI job fails on high
  and critical advisories only, the weekly scheduled run reports every severity;
  dependency review on pull requests, secret scanning with push protection on
  this public repository).

### How the Wrapper reaches the SuperEngine origin

The Wrapper must be served from the SuperEngine origin and from nowhere else: it
is SuperEngine code whose shell holds the player's key, and the game runs on
another origin.

1. The release workflow builds the Wrapper and publishes a **release bundle**:
   hashed static files, an integrity manifest (SHA-256 per file, from which
   Subresource Integrity attributes are generated), the attestation, and a
   headers file with the recommended `Content-Security-Policy` (no
   `unsafe-inline`, no `unsafe-eval`, `connect-src` limited to the SE origin and
   the configured RPCs, `frame-src` the game origins),
   `Referrer-Policy: no-referrer`, and a `Permissions-Policy`.
2. A deploy job **on the SuperEngine side** pulls a released version by its tag
   and digest, verifies the attestation and the manifest, and uploads it to the
   public, content-addressed artifact store behind the CDN. The environment's
   configuration document points at that version.
3. The **deploy credentials stay on the SuperEngine side**, in a protected
   environment. This repository holds none: it only publishes artifacts anyone
   can read.
4. A rollback is repointing the environment to the previous released digest.

<!-- TODO(infrastructure owner): the hosting hostnames, the repository and the protected environment that run the deploy job, the CDN header rules, and the `frame-ancestors` allow-list (the Wrapper is embedded by each operator's page, so the allow-list comes from operator configuration and cannot be one static header), and the RPC provider list with its CORS behavior and `connect-src` entries (owned by the infrastructure owner; see [wrapper.md](./wrapper.md#configuration)). -->

### Never in the public repository

A public repository cannot take content back once it is cloned, forked, or
cached. The following never enter the kit, in any file, commit, issue, pull
request, workflow log, agent output, or release note:

- secrets: credentials, tokens, private keys (the test keys in the vectors are
  public by design and are the only exception), connection strings, signing
  keys, npm or deploy credentials;
- internal hostnames, internal URLs, dashboard links, account identifiers, cloud
  resource names;
- unpublished backend internals: only the player-facing contracts (the Play API
  document, the Snapshot schema bundle, the signed-action specification, the
  signing vectors) are shared, and only as copies; no operator, wallet, or admin
  API document, no internal module names or designs;
- anything about an operator's credentials or contracts, or a player's data;
- unreleased security findings (they go through `SECURITY.md`).

Every file added from a private source is **reviewed before it is merged**, by
the code owners, against this list. Backend-owned contracts are referenced by
name and version only, never by a link into a private repository.

### Testing and CI

The kit's tests are the executable half of
[wrapper.md's test plan](./wrapper.md#test-plan).

| Level     | Tool                                 | What                                                                                                                                           |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                               | per package; the signing, Snapshot, and transcript vectors; the token schedule; redaction                                                      |
| Component | Vitest and jsdom                     | the Wrapper renders every `valid/` Snapshot                                                                                                    |
| e2e       | Playwright                           | win, loss, cash-out, offline, typed errors, two tabs, the sandbox, accessibility, the no-secret scan                                           |
| Static    | oxlint, stylelint, oxfmt, TypeScript | lint (oxlint for TypeScript, stylelint for CSS), format check (oxfmt, for every file type it supports), `tsc --noEmit`, import-direction rules |
| Tooling   | Vitest, tsx                          | `tools/`: the lint fixtures that prove a violation fails (TypeScript and CSS), the allow-list check, the test-only-entry check                 |

**CI jobs** (GitHub Actions, one required aggregate job `ci-ok`): `lint` and
`format`; `typecheck`; `unit` (`pnpm test`); `allow-list` (the dependency
allow-list); `contracts` (the hash check, the regenerated-types diff, and the
import check that the test-only entry is imported only by tests);
`contracts-drift` (rule 3 above, when a source is published); `build` (the
bundle, its manifest, a size budget, a check that the same bundle is what e2e
runs and what is released (no test or per-environment build), and a check that
no vector reaches any bundle or release output); `e2e-fake` (Playwright against
the in-repo fake Play API, which answers from the contract's vectors); `audit`
(`pnpm audit --prod`, failing on high and critical advisories only);
`dependency-review` (pull requests only); `release` (changesets, provenance, on
the default branch only).

Today `contracts` runs the test-only-entry import check only; the hash check and
the regenerated-types diff arrive with the `contracts` package, and
`contracts-drift` and `release` are not defined yet. `build` builds every
workspace; the manifest, size budget, and no-vector content check join it with
the first release build. `e2e-fake` has no suites yet. The workflows hold no
secret, run with `permissions: {}` at the top and `contents: read` per job, and
pin every Action by full commit SHA.

#### Task orchestration and caching

The scripts are [wireit](https://github.com/google/wireit) scripts, declared in
the `package.json` that owns them with their `command`, input `files`, `output`,
`dependencies`, and `packageLocks: ["pnpm-lock.yaml"]`, so the lockfile and the
shared configuration (`tsconfig.base.json`, `.oxlintrc.json`) are inputs of the
scripts that read them. A task whose inputs are unchanged is skipped and its
outputs restored from the cache.

- **Local:** `.wireit/` in each worktree (git-ignored; like `node_modules`, it
  is per worktree). `pnpm clean:cache` empties it.
- **CI:** `WIREIT_CACHE=github`, using the GitHub Actions cache through
  `google/wireit`'s `setup-github-actions-caching` action (pinned by commit SHA,
  in `.github/actions/setup`). It hands the job's own Actions cache credentials
  to wireit on the runner; no repository secret is involved. There is no remote
  cache service (ADR-001 rejected one because it needs a credential).
- **A cache hit never replaces a gate that could fail.** A script is cached only
  if it declares `files`; the gating checks (`lint`, `format:check`,
  `test:tools`, `check:deps`, `check:contracts`, and the contracts hash check
  when it lands) list every file they read, the test suites list the files they
  read outside their package or depend on the task that produces them, and
  `test:e2e` and `format` declare no `files`, so they always run. `pnpm audit`
  is a plain CI step, never cached, because its result depends on the advisory
  database and not on repository files.

**Test tooling notes.** The DOM for component tests is **jsdom**: it is the most
complete DOM for the axe accessibility checks, and the pieces it lacks (Web
Locks, `crypto`, `fetch`) are injected fakes in the shell's tests anyway. The
**formatter** is oxfmt alone, for TypeScript, JSON, Markdown, YAML, and HTML
(oxfmt covers Markdown and YAML as of 0.72, so prettier was dropped);
`pnpm format` writes and `pnpm format:check` verifies. Files that must stay as
written are listed in `ignorePatterns` of `.oxfmtrc.json` (the lockfile,
changelogs and changesets, and the agent and skill files, whose single-line
frontmatter some agent tools require). The Snapshot types come from
`json-schema-to-typescript`, the typed client's from `openapi-typescript`; both
are development dependencies that write committed, generated files
([ADR-001](../decisions/ADR-001-toolchain-and-signing.md)).

**Where the preview-stack e2e runs.** The SuperEngine preview stack is private,
so a public CI job cannot reach it without a credential. This repository owns
the e2e **suite**; a job owned by the backend repository checks this repository
out at a **pinned commit**, installs with `--frozen-lockfile`, builds the
Wrapper, and runs the suite against its own throwaway stack. That job holds no
secret. The same suite runs against the fake Play API in this repository's own
CI, so a change here is checked without the backend.
<!-- TODO(preview stack): the pin and the job live in the backend repository. -->

### Environment configuration

The Wrapper's build is identical in every environment; the values come from one
environment configuration document ([wrapper.md](./wrapper.md#configuration))
whose schema the kit owns. The release build **refuses** a configuration fixture
with `minRpcQuorum` below 2 outside the `local` and `preview` fixtures, so the
single-RPC gap of the first release cannot ship by accident. This is an
**additional guard**: the Wrapper itself also refuses to start with
`environment: production` and `minRpcQuorum` below 2
([wrapper.md](./wrapper.md#contract), W-26a). The configuration schema, and so
the fixture check, also refuses an entropy source with fewer configured
endpoints than `minRpcQuorum` (W-26b).

### Bootstrap

The repository exists. Bootstrap is the scaffolding that follows this knowledge
layer: the workspace, the six packages and apps (`contracts`, `signing`,
`snapshot`, `play-client`, `shell`, `wrapper`) and the reference game, the lint
and format configuration, the CI workflows, the CODEOWNERS file, and the pinned
versions (ADR-001's table). The toolchain pull request landed the workspace, the
empty skeletons, the lint and format configuration, the CI workflows,
dependabot, changesets, and the pinned versions; CODEOWNERS stays comment-only
until the org owners name themselves. Its checklist, and the repository settings
the org owners apply (branch protection, secret scanning with push protection,
the publishing environment), are in the
[release runbook](../runbook/client-kit-release.md#bootstrap-the-toolchain).

## Errors and edge cases

- **A contract file in the kit is stale.** The drift check flags it; the fix is
  a sync pull request here. Until then the kit works against the contract it
  pinned.
- **A breaking contract change lands first.** It needs a new surface prefix, so
  the old kit keeps working through the deprecation window.
- **A dependency of the kit is compromised.** The lockfile and the allow-list
  limit the exposure to two runtime dependencies; the runbook has the deprecate
  and rotate steps.
- **The kit's vectors and the backend's disagree.** One of them is wrong. Both
  implementations replay the same file, so a disagreement is a failing test in
  one repository, never a silent difference.

## Security

What the kit must never contain is [above](#never-in-the-public-repository).
What the Wrapper must never expose is in [wrapper.md](./wrapper.md#security).
The release path is the main risk: [Supply chain](#supply-chain) and the
runbook's escalation steps.

## Observability

The kit has no runtime component of its own: the Wrapper emits no telemetry in
the first release ([wrapper.md](./wrapper.md#observability)). The release
workflow's logs are public and hold no secret.

## Open items

| Item                                                                                                                                                                                                                                                   | Owner                                               | Marker                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CODEOWNERS (comment-only until the org owners give their handles; branch protection, with a required pull request and no self-approval, is the interim control), branch protection, secret scanning, and the publishing environment of this repository | the two org owners                                  | <!-- TODO(org owners): CODEOWNERS = the two org owners, branch protection, secret scanning with push protection, the publishing environment -->                                                                                                                               |
| The npm organization and scope                                                                                                                                                                                                                         | TPO, then the org owners                            | <!-- TODO(TPO): final npm scope -->                                                                                                                                                                                                                                           |
| License                                                                                                                                                                                                                                                | TPO                                                 | MIT today (set at creation); confirmed by the TPO in review. Not blocking                                                                                                                                                                                                     |
| Hosting of the released Wrapper and its deploy credentials                                                                                                                                                                                             | infrastructure owner                                | <!-- TODO(infrastructure owner): hosting, deploy repository and environment, `frame-ancestors` source -->                                                                                                                                                                     |
| Publication of the backend's contracts and vectors (later step; not a blocker, OQ-6 decided)                                                                                                                                                           | backend maintainers                                 | <!-- TODO(contract publication): where and when -->                                                                                                                                                                                                                           |
| The preview-stack pin and job                                                                                                                                                                                                                          | backend repository                                  | <!-- TODO(preview stack) -->                                                                                                                                                                                                                                                  |
| Type-aware lint (`oxlint-tsgolint`, for rules such as `no-floating-promises`)                                                                                                                                                                          | follow-up pull request (needs an ADR-001 amendment) | <!-- TODO(follow-up): add `oxlint-tsgolint` to the allow-list and enable the type-aware rules -->                                                                                                                                                                             |
| Where the controller protocol's type definitions live, so `reference-game` can import only types                                                                                                                                                       | TPO, with the shell's first pull request            | <!-- TODO(controller protocol): a type-only subpath of `shell` is the working rule; a separate `controller` package is the alternative if game developers should not depend on `shell` at all. Recommended: start with the subpath, split when a second consumer appears. --> |

## References

- [wrapper.md](./wrapper.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`; the
  Snapshot schema `se.snapshot/1` and its bundle; the signed-action spec; the
  signing vectors.
