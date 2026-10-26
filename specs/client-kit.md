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

Out of scope: the Wrapper's behavior ([wrapper.md](./wrapper.md)) and the verify
page's ([verify-page.md](./verify-page.md)); the signed-action grammar (the
backend's signed-action spec); the hosting and the deploy credentials of the
released Wrapper, an [open item](#open-items) for the infrastructure owner; the
procedure to release ([runbook](../runbook/client-kit-release.md)).

## Boundary

The kit is a repository of packages and apps. These are its ownership lines.

- **The kit owns:**
  - all browser code: the shell, the UI, the libraries;
  - the `contracts` package (the data vendored from the backend and its lock
    file), and the typed client, the Snapshot validator, and the signing code,
    as implementations of contracts it does not define;
  - the browser e2e suite (its tests; where some of them run is in
    [Testing and CI](./client-kit/testing-and-ci.md));
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
  ([Contracts](./client-kit/how-the-kit-gets-its-contracts.md)). No git
  submodule is used.

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
    verify/         the verify page (today its fairness-kernel derivations only)
  e2e/              Playwright suite and the fake Play API
  tools/            repository checks and their tests (allow-list, test-only entry)
  .changeset/       pending release notes
  package.json, pnpm-workspace.yaml, pnpm-lock.yaml, .node-version
  tsconfig.base.json, tsdown.base.ts, .oxlintrc.json, .oxfmtrc.json, stylelint.config.mjs
  .github/          workflows, the setup action, CODEOWNERS, dependabot
```

Every workspace is a pnpm package with wireit scripts (see
[Task orchestration](./client-kit/testing-and-ci.md#task-orchestration-and-caching));
the root `package.json` fans them out. Exactly: the five `packages/*` and
`apps/wrapper` and `apps/reference-game` have `build` (Vite), `typecheck`, and
`test` (Vitest with jsdom); `e2e` (`@intraverse/se-client-e2e`, private) has
`typecheck` and `test` (Playwright: the e2e harness's own tests and a smoke run
on the Wrapper's bundle,
[The e2e harness](./client-kit/testing-and-ci.md#the-e2e-harness)) and no
`build`; `apps/verify` (`@intraverse/se-client-verify`, private) has `typecheck`
and `test` (Vitest) and no `build` until its page is built
([Verify page](./verify-page.md#build-and-release-v-15-to-v-17)). **A package
gets a `test` script with its first real test**, not before: a `test` script
that passes with no tests would be a green check that checks nothing, so the
empty skeletons have none, and the root `test` runs the Wrapper's tests and the
`tools/` tests (`test:tools`). The pull request that adds a package's first test
adds its `test` script and its entry in the root `test` dependencies.

Directories are `packages/<name>` and `apps/<name>`. The intended npm names are
`@intraverse/se-client-<name>` (scope `@intraverse`, decided in
[ADR-001](../decisions/ADR-001-toolchain-and-signing.md)); the two apps keep the
prefix and are never published. The npm organization and the names are not
claimed on npm yet: that is part of the publishing work (#12).

### Packages

The package table (published name, responsibility, kit and runtime
dependencies), the public-README rules that `pnpm check:readmes` enforces, the
dependency direction, and the lint, code-style, CSS, and tool-script rules. See
[`client-kit/packages.md`](./client-kit/packages.md).

### The `contracts` package

What `contracts` holds (data only), its runtime and test-only entry points, the
pinned source layout, the tarball, the public types, and the three checks that
keep vectors out of every browser bundle and published tarball. See
[`client-kit/the-contracts-package.md`](./client-kit/the-contracts-package.md).

### The `snapshot` package

The `se.snapshot/1` validators, their issues and fail-closed keyword profile,
strictness, the `ValidSnapshot` and `ValidPlayProblem` narrowing, the amount
readers, and the tests. See
[`client-kit/the-snapshot-package.md`](./client-kit/the-snapshot-package.md).

### The `play-client` request layer

The hand-written request layer under the Play API operations: no kept
credential, the base URL and request options, timeout and cancel, the error
types, the retry classes, the token schedule, idempotency keys, and what is
provisional; then the operations, one function per `operationId` of the vendored
Play API document, and their fake-server tests. See
[`client-kit/the-play-client-request-layer.md`](./client-kit/the-play-client-request-layer.md).

### The `shell` package

The first slice of the headless shell: its public API, the redacting types and
logger, key custody, the signer lock, the transcript state, and what is
provisional. See
[`client-kit/the-shell-package.md`](./client-kit/the-shell-package.md).

### The reference game

The minimal Coin Flip game the e2e suite runs and game developers read, how it
checks every message, and what it shows per status and per reject. Where the
controller protocol's types live is decided: a type-only subpath of `shell`
(`@intraverse/se-client-shell/controller`) now, split into a `controller`
package when a second consumer appears; the lint, the game's build, and
`pnpm check:build-output` enforce that it is type-only. See
[`client-kit/the-reference-game.md`](./client-kit/the-reference-game.md).

### The cryptography

The fixed-type EIP-712 encoder and secp256k1 signing in `signing`: what it
encodes today, key custody in the signer, the `SigningError` codes, the
transcript helper, the action grammar, and the vectors. See
[`client-kit/the-cryptography.md`](./client-kit/the-cryptography.md).

### How the kit gets its contracts

Vendor now, publish later: which backend documents are copied into `contracts`,
the lock file, and the rules to vendor, verify offline, detect drift, sync
additive changes, and review before publish. See
[`client-kit/how-the-kit-gets-its-contracts.md`](./client-kit/how-the-kit-gets-its-contracts.md).

### Versioning and compatibility

- The kit uses semantic versioning per package, managed by changesets. The
  published packages (`contracts`, `signing`, `snapshot`, `play-client`, and
  `shell`) version independently; the Wrapper bundle has its own version and a
  release record. The changelogs are generated by `@changesets/changelog-github`
  (`.changeset/config.json`, repository `IntraverseGame/se-client-kit`), which
  needs a GitHub token only when `changeset version` runs in the release job:
  the `GITHUB_TOKEN` the Actions runtime provides to that job with least
  privilege, never a stored secret and never in the repository
  ([release runbook](../runbook/client-kit-release.md#release)).
- **Contract compatibility.** A kit built for `/play/v1` and `se.snapshot/1`
  keeps working through every additive change that stays within the schema it
  was built against; a change that adds a Snapshot field, `status`, or error
  `code` needs a kit release that syncs it (rule 4 of
  [How the kit gets its contracts](./client-kit/how-the-kit-gets-its-contracts.md)).
  A breaking change is a new surface prefix (`/play/v2`) or `se.snapshot/2`,
  served alongside the old one for a deprecation window, and a new **major** of
  the affected kit packages. **One pre-release exception** (decided with
  [OQ-7](./wrapper.md#decided-questions), before any release): `se.snapshot/1`
  made `proofs.createRoundAuth` required on a config Snapshot that carries
  `proofs`, and existing `valid/` and `invalid/` vectors were changed or removed
  with it; the kit vendored that change as is
  ([rule 4](./client-kit/how-the-kit-gets-its-contracts.md)). After the first
  release, `/1` takes additive changes only.
- The kit states what it was built against in `contracts.lock.json` and in each
  release's notes: the Play API prefix, the Snapshot schema id, and the signing
  vector set. A Wrapper release is served only against a matching backend
  contract
  ([release runbook](../runbook/client-kit-release.md#verify-before-and-after)).
- The release cadence is independent of the backend's: the kit can ship a UI fix
  without a backend release, and the backend can ship an additive change that
  stays within the synced schema without a kit release.

### Supply chain

Lockfile and install policy, the runtime-dependency allow-list, the pinned
toolchain, provenance, credentials, bundling, the reproducible build, and the
vulnerability and license checks. See
[`client-kit/supply-chain.md`](./client-kit/supply-chain.md).

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
   `Referrer-Policy: no-referrer`, and a `Permissions-Policy`. The bundle is one
   file, `se-client-wrapper-<version>.tar` (a deterministic tar of the build
   output), identified by its **digest**, `sha256:` and the SHA-256 of that
   file; the release dry run requires two builds of the same commit to give the
   same digest ([Supply chain](./client-kit/supply-chain.md), Reproducible
   build).
   <!-- TODO(#12): attaching the artifact and its attestation to a GitHub release; an ADR to come proposes `actions/attest-build-provenance` and `actions/upload-artifact`. -->
2. A deploy job **on the SuperEngine side** pulls a released version by its tag
   and digest, verifies the attestation and the manifest, and uploads it to the
   public, content-addressed artifact store behind the CDN. The environment's
   configuration document points at that version.
3. The **deploy credentials stay on the SuperEngine side**, in a protected
   environment. This repository holds none: it only publishes artifacts anyone
   can read.
4. A rollback is repointing the environment to the previous released digest.

The Wrapper's build produces these files itself (`apps/wrapper`,
`release-integrity.ts` and `release-headers.ts`), and fails closed if the page
would need a looser policy:

- the page's `<script src>` and `<link href>` carry `integrity="sha256-..."`; an
  inline script, an inline style or `style` attribute, an event-handler
  attribute, or a reference outside the bundle refuses the build;
- the page carries the environment-independent part of the policy in a `<meta>`
  element
  (`script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'`),
  so it holds even where a header is missing;
- `headers.json` holds the recommended headers by path pattern: `/*` for the
  Wrapper's, and `/verify/*` for the verify page's
  ([verify page](./verify-page.md), V-16 and Security), which replace the
  Wrapper's for that path rather than add to them. That holds only if the host
  applies the most specific rule; a host that merges every matching rule (some
  do) would send both policies, and the browser would enforce both: the
  Wrapper's `connect-src` does not list the verify API's origin, so the page
  could not reach a verify API on another origin. The hosting step therefore
  excludes `/verify/*` from `/*`, or serves the Wrapper's rule only with headers
  safe on every path, and checks the real response headers of a preview deploy.
  No hosting step exists yet. The Wrapper's policy is `default-src 'none'`,
  `'self'` for scripts, styles, images, and fonts, `base-uri`, `form-action`,
  and `object-src` `'none'`, Trusted Types required, and three placeholders the
  deploy side fills from the environment's document:
  `connect-src 'self' {{connectOrigins}}` (the Play API's and the RPC endpoints'
  origins), `frame-src {{gameOrigins}}`, and
  `frame-ancestors {{operatorOrigins}}` (`'none'` when the list is empty).
  `contentSecurityPolicyFor` computes the filled policy for a validated
  document; `verifyContentSecurityPolicyFor` does the same for the verify page's
  (its `connect-src` takes the origin of `verifyApiBaseUrl`, which the validated
  document keeps, and the RPC endpoints' origins). `Permissions-Policy` turns
  off camera, microphone, geolocation, payment, USB, MIDI, display capture,
  credential `get`, and clipboard read (clipboard write is not a recognised
  feature and is not listed); this list is proposed for review;
- the verify page (`apps/verify`, built on its own) is copied into the output
  under `verify/` with the same rules: its own `<meta>` policy (the one above
  with `worker-src 'none'`), SRI on every script and stylesheet, which must lie
  under `verify/`, and its files in the manifest (`release-verify.ts`);
- `integrity-manifest.json` holds the SHA-256 of every other file;
- the Wrapper has no public directory (`publicDir: false`), so every file goes
  through the build;
- after the build has written everything, the output directory is read back from
  disk. Only regular files and directories may be in it: a symbolic link (to a
  file or a directory), a socket, a FIFO, or a device fails the build, and so
  does an output directory that is itself a link. Its files must be exactly the
  manifest's files plus the manifest (a file another step wrote, such as a
  copied `public/` file, fails the build), and each must match its manifest
  hash. The file types are an allow-list, compared in lower case: `.js` and
  `.css`, each loaded by a tag of the page that carries `integrity` (a dynamic
  `import()` chunk, which would load without SRI, fails the build); `.json` for
  `integrity-manifest.json` and `headers.json` only; and `index.html` and
  `verify/index.html`, each written exactly so, as the only HTML. Every other
  type fails the build (another HTML spelling such as `Evil.HTML`, `.htm`, or
  `.xhtml`, an `.svg`, which can hold a script, a `.cjs`, an image, a font); a
  type the Wrapper needs is added to the allow-list explicitly.

<!-- TODO(infrastructure owner): the hosting hostnames, the repository and the protected environment that run the deploy job, the CDN header rules, and the `frame-ancestors` allow-list (the Wrapper is embedded by each operator's page, so the allow-list comes from operator configuration and cannot be one static header), and the RPC provider list with its CORS behavior and `connect-src` entries (owned by the infrastructure owner; see [wrapper.md](./wrapper.md#configuration)). -->

### Never in the public repository

A public repository cannot take content back once it is cloned, forked, or
cached. The following never enter the kit, in any file, commit, issue, pull
request, workflow log, agent output, or release note:

- secrets: credentials, tokens, private keys (the test keys the vectors were
  signed with are public by design and are the only exception: in
  `packages/signing/src/fixtures/keys.ts`, and in the vendored `signed-action/`
  vectors, which embed the same public test key and cannot be edited; the e2e
  suite may pass the signed-action vector's test key to its seeded random stub,
  read from `contracts`' test-only entry at run time, and never copies it into a
  file), connection strings, signing keys, npm or deploy credentials;
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

The test levels and tools, the CI jobs, and task orchestration and caching with
wireit (what may be cached and how inputs are listed). See
[`client-kit/testing-and-ci.md`](./client-kit/testing-and-ci.md).

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
The release path is the main risk: [Supply chain](./client-kit/supply-chain.md)
and the runbook's escalation steps.

## Observability

The kit has no runtime component of its own: the Wrapper emits no telemetry in
the first release ([wrapper.md](./wrapper.md#observability)). The release
workflow's logs are public and hold no secret.

## Open items

| Item                                                                                                                                                                                                                                                                                                                                                                               | Owner                                               | Marker                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CODEOWNERS (comment-only until the org owners give their handles; branch protection, with a required pull request and no self-approval, is the interim control), branch protection, secret scanning, and the publishing environment of this repository                                                                                                                             | the two org owners                                  | <!-- TODO(org owners): CODEOWNERS = the two org owners, branch protection, secret scanning with push protection, the publishing environment -->                                                     |
| Claiming the `intraverse` npm organization and the `@intraverse/se-client-*` names (decided; not claimed yet)                                                                                                                                                                                                                                                                      | the org owners, with the publishing work (#12)      | <!-- TODO(org owners): claim the npm organization `intraverse` and the package names -->                                                                                                            |
| The rest of the release workflow (#12): the tag and GitHub release that carry the Wrapper artifact, and its build-provenance attestation (decided: an ADR to come proposes `actions/attest-build-provenance` and `actions/upload-artifact`). The version pull request job is built (the workflow's `version` job pushes `changeset-release/main`; a person opens the pull request) | TPO, with the publishing work (#12)                 | <!-- TODO(#12): GitHub release, attestation -->                                                                                                                                                     |
| License                                                                                                                                                                                                                                                                                                                                                                            | TPO                                                 | MIT today (set at creation); confirmed by the TPO in review. Not blocking                                                                                                                           |
| Hosting of the released Wrapper and its deploy credentials                                                                                                                                                                                                                                                                                                                         | infrastructure owner                                | <!-- TODO(infrastructure owner): hosting, deploy repository and environment, `frame-ancestors` source -->                                                                                           |
| Publication of the backend's contracts and vectors (later step; not a blocker, OQ-6 decided)                                                                                                                                                                                                                                                                                       | backend maintainers                                 | <!-- TODO(contract publication): where and when -->                                                                                                                                                 |
| The preview-stack pin and job                                                                                                                                                                                                                                                                                                                                                      | backend repository                                  | the kit's side is the preview mode of the e2e suite ([testing-and-ci.md](./client-kit/testing-and-ci.md), [runbook](../runbook/preview-e2e.md)); the pin and the job live in the backend repository |
| Type-aware lint (`oxlint-tsgolint`, for rules such as `no-floating-promises`)                                                                                                                                                                                                                                                                                                      | follow-up pull request (needs an ADR-001 amendment) | <!-- TODO(follow-up): add `oxlint-tsgolint` to the allow-list and enable the type-aware rules -->                                                                                                   |

## References

- [wrapper.md](./wrapper.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`; the
  Snapshot schema `se.snapshot/1` and its bundle; the signed-action spec; the
  signing vectors.
