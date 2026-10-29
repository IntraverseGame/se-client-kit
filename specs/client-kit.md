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
backend's signed-action spec); the Cloudflare account, the Pages project, its
token, and the DNS, which the infrastructure owner creates (the kit's deploy job
is in scope:
[How the Wrapper reaches the SuperEngine origin](#how-the-wrapper-reaches-the-superengine-origin));
the procedure to release ([runbook](../runbook/client-kit-release.md)).

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
    pages-proxy/    the Pages sites' same-origin API proxy (one worker module)
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
([Verify page](./verify-page.md#build-and-release-v-15-to-v-17));
`apps/pages-proxy` (`@intraverse/se-client-pages-proxy`, private) has `build`
(`tsc`, its one worker module), `typecheck`, and `test` (Vitest)
([The Pages API proxy](#the-pages-api-proxy)). **A package gets a `test` script
with its first real test**, not before: a `test` script that passes with no
tests would be a green check that checks nothing, so the empty skeletons have
none, and the root `test` runs the Wrapper's tests and the `tools/` tests
(`test:tools`). The pull request that adds a package's first test adds its
`test` script and its entry in the root `test` dependencies.

Directories are `packages/<name>` and `apps/<name>`. The npm names are
`@intraverse/se-client-<name>` (scope `@intraverse`, decided in
[ADR-001](../decisions/ADR-001-toolchain-and-signing.md)); the two apps keep the
prefix and are never published. The `intraverse` npm organization is claimed and
owned by the org owners; nothing is published yet, and the packages publish
through npm trusted publishing ([Supply chain](./client-kit/supply-chain.md)).

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
   build). A published release attaches the tar and its `.sha256` to a GitHub
   release (tag `@intraverse/se-client-wrapper@<version>`), the released
   Wrapper's durable home; its build-provenance attestation, of the tar's
   digest, is stored on the repository and in the public Sigstore transparency
   log
   ([ADR-005](../decisions/ADR-005-release-attestation-and-artifact-upload.md);
   [Supply chain](./client-kit/supply-chain.md), Provenance).
2. This repository's CI **deploys `main` to Cloudflare Pages**
   ([ADR-008](../decisions/ADR-008-pages-deploy-with-wrangler.md), which
   supersedes ADR-001 decision 9; `.github/workflows/pages.yml`), to three
   staging projects on three hostnames: the Wrapper's (`se-wrapper-stage`), the
   verifier's (`se-verifier-stage`), and the reference game's (`se-games-stage`,
   at `https://se-games-stage.pages.dev`, a public origin on another registrable
   domain than the Wrapper's, W-37; see [The game's site](#the-games-site)).
   **Every push to `main` deploys staging**, with no switch (no repository
   variable gates a job; the human, 2026-10-27). **Production**
   ([ADR-009](../decisions/ADR-009-production-pages-deploy-trigger-and-source.md);
   `.github/workflows/pages-prod.yml`): the release workflow runs
   `changesets/action` on every push to `main`; with pending changesets it opens
   or updates the bump pull request, and on the push that merges it, it
   publishes and creates a tag and a GitHub release per released package. In the
   same run, separate jobs attest the Wrapper tar, attach it and its `.sha256`
   to the Wrapper's release, and deploy production (no reference game:
   production frames the real game origins): a job with no secret downloads the
   tar by tag, checks its digest, and runs `gh attestation verify` against the
   tag's commit; the proxy worker is built with `tsc` at the tag's commit; the
   configuration is built in the environment `pages-prod-config`, which holds no
   deploy credential; and the deploy job (`pages-prod`, no required reviewer,
   alone in the concurrency group `pages-prod`) refuses any other digest. A
   person can redeploy a released tag by dispatching the same workflow, which
   refuses while a release run is not completed. Production cannot deploy before
   the publish path is on (#154). Staging:
   - A build job with a read-only token and no secret builds the Wrapper
     artifact twice (the release dry run) and requires one digest, makes the
     reference game's artifact from the dry run's two builds and requires one
     digest, and builds the [API proxy](#the-pages-api-proxy) worker with `tsc`.
   - A config job, in the same environment, referencing only its configuration
     secrets and never the token, builds and validates the
     [sites' configuration documents](#the-pages-sites-configuration). It runs
     repository code in the environment that holds the token: accepted for
     staging only (ADR-008, Risks accepted); production builds its configuration
     in a separate environment with no deploy credential.
   - A deploy job that runs no repository script downloads all of them, refuses
     any whose SHA-256 is not its job's digest, and lays out the sites from the
     unchanged artifacts. The Wrapper's site is the Wrapper artifact: the
     Wrapper at `/`, and its copy of the verify page at `/verify/`. The
     verifier's site is the artifact's `verify/` directory plus a copy of its
     page at the root (the page's files are referenced under `/verify/`, its
     build base, and Pages serves the root page for every path that is not a
     file). The game's site is the reference game's artifact, unchanged.

   The Wrapper's and the verifier's sites also get the proxy as their
   `_worker.js`, their own `environment-config.json`, and a `_routes.json` that
   sends only their API paths to the proxy; every site gets its `_headers`
   (below). The job uploads each site, unbundled, with the `wrangler` the
   lockfile pins, and logs every digest. A released version keeps its tag,
   digest, and attestation (step 1); Pages serves `main`.

3. The **deploy credential** (a Cloudflare API token scoped to Pages) exists
   only as a secret of the protected GitHub environment `pages-stage`,
   restricted to `main`, and is used by the deploy step alone; it is never in a
   file or a log. The account id, the site origins, the RPC endpoints, and the
   origin lists are secrets of the same environment, so the public logs show
   them masked. The API's origin is a variable of each Pages project, never in
   this repository or CI. No hostname is written in this repository.
4. A rollback is a Pages rollback to an earlier deployment, per project
   ([runbook](../runbook/client-kit-release.md#deploy-to-cloudflare-pages)). The
   next push to `main` deploys again; to hold a rollback, the workflow is
   disabled until the fix is merged.

#### The Pages API proxy

The two sites' hostnames are not the API's, and the API sends no CORS headers.
Each site reaches the API through its own origin instead: a Cloudflare Pages
advanced-mode worker (`apps/pages-proxy`, one module with no import and no
dependency, emitted by `tsc`) deployed as the site's `_worker.js`. It is on the
path of every signed action.

- **Routes.** The site's `_routes.json` sends only the API paths its pages call
  to the worker: `/play/v1/*` and `/verify/v1/*` on the Wrapper's site (the
  Wrapper and its copy of the verify page), `/verify/v1/*` on the verifier's.
  Every other path is a static asset of the site, with its `_headers`.
- **The site's prefixes.** The worker forwards a request only when its path (as
  `URL` normalizes it, so a dot segment cannot leave the prefix) starts with one
  of the site's prefixes: the Pages project's variable `SE_API_PATH_PREFIXES`, a
  whitespace-separated list of `/play/v1/` and `/verify/v1/` (the Wrapper's site
  both, the verifier's `/verify/v1/` only). A missing or empty list, or one with
  any other entry, is a 502 for every API path. Any other path goes to the
  static assets. `/operator/v1/*` is never forwarded: no page calls it (the
  launch code is redeemed with `POST /play/v1/sessions:redeem`).
- **Refused paths.** A path that holds `%2f`, `%5c`, or `%2e` (in any case), an
  empty segment (`//`), or, under an API prefix, a trailing `/`, is answered 400
  with no body and never forwarded. (A runtime that resolves `%2e%2e` before the
  worker sees the path leaves a path outside the prefixes, which goes to the
  static assets: it is never forwarded either.)
- **Pass-through.** The method, the path, the query, and the body are forwarded
  unchanged to the upstream origin. The body is the incoming stream, never read,
  parsed, or re-encoded, so a signed action arrives byte for byte. A redirect is
  returned to the page, not followed. The upstream request asks for no caching
  (`cache: "no-store"`).
- **Request headers.** Every header is forwarded unchanged except these, which
  are dropped: `Host` (the upstream URL's), the incoming `CF-Connecting-IP`
  (Cloudflare sets its own on the forwarded request), the hop-by-hop headers
  (`Connection` and every header it names, `Keep-Alive`, `TE`, `Trailer`,
  `Transfer-Encoding`, `Upgrade`, and every `Proxy-*` header), and `Forwarded`,
  `X-Real-IP`, `True-Client-IP`, `X-Forwarded-Host`, `X-Forwarded-Proto`,
  `X-Original-URL`, `X-Rewrite-URL`, and `X-HTTP-Method-Override`.
- **The client IP.** The proxy forwards the client IP in `X-Forwarded-For`: it
  replaces any incoming `X-Forwarded-For` (which the client could have written)
  with the incoming `CF-Connecting-IP`, and drops it when there is none. The
  header is trustworthy only if the upstream authenticates the proxy; without
  that, any client can send its own.
- **The answer.** The upstream's status, headers, and body are returned, with
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`
  and `X-Content-Type-Options: nosniff` set, replacing the upstream's own.
  Nothing is cached, and no caching header is added or changed.
- **The upstream.** The origin is the Pages project's production variable
  `SE_API_UPSTREAM_ORIGIN`, exactly an `https` origin (no path, query,
  credentials, or trailing slash), set by the infrastructure owner in each
  project and never in this repository or CI. When it is missing or malformed,
  when the upstream cannot be reached, or when reading a static asset fails, the
  answer is a 502 with no body and no detail.
- **Its own answers** (400, 502) carry the same two security headers.
- **It logs nothing** and emits no telemetry.

With the proxy, the APIs are same-origin: `'self'` in each page's `connect-src`
covers them.

#### The Pages sites' configuration

Each site serves its own environment configuration document
([wrapper.md](./wrapper.md#configuration), and the verify page's V-3),
`environment-config.json` next to its page, written by the deploy; the
artifact's bytes and digest are unchanged. The config job builds both from the
`pages-stage` secrets (`PAGES_WRAPPER_ORIGIN`, `PAGES_VERIFIER_ORIGIN`,
`PAGES_CHAIN_PINS`, `PAGES_RPC_ENDPOINTS`, `PAGES_RPC_ORIGINS`,
`PAGES_GAME_ORIGINS`, `PAGES_OPERATOR_ORIGINS`) with
`apps/wrapper/pages-config.ts`, and validates each with the Wrapper's own
validator for its site's origin; any issue fails the job, naming an input or a
field, never a value.

- `PAGES_CHAIN_PINS` holds the chain pins only (`environment`, `runtimeSigner`,
  `registryDomain`, `entropyChainId`, `minRpcQuorum`, `tipLagMargin`);
  `PAGES_RPC_ORIGINS` must list exactly the origins of `PAGES_RPC_ENDPOINTS`'
  URLs.
- `playApiBaseUrl` is the Wrapper's origin plus `/play/v1` in both documents;
  `verifyApiBaseUrl` is each site's own origin plus `/verify/v1` (its own
  proxy); `verifyBaseUrl` is the verifier's origin plus `/verify` in both, so
  the Wrapper's verify link opens `<verifier origin>/verify/rounds/{roundId}` on
  the verifier's site.
- The same documents feed the sites' policies: the deploy reads the RPC
  endpoints' origins, the game origins, and the operator origins for `_headers`
  from the Wrapper's document, so the policy and the configuration cannot
  disagree.

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
  Pages merges every matching rule, so the Pages deploy writes each more
  specific rule as a detach (`! Name`) of every header of the broader rules,
  then its own headers: `/verify/*` then carries only the verify page's. The
  verifier's site gets the `/verify/*` rule's headers on `/*`. The Wrapper's
  policy is `default-src 'none'`, `'self'` for scripts, styles, images, and
  fonts, `base-uri`, `form-action`, and `object-src` `'none'`, Trusted Types
  required, and three placeholders the deploy side fills from the environment's
  document (the Pages deploy fills them from each site's configuration document:
  the RPC endpoints' origins, the game origins, and the operator origins, each
  sorted and unique; an empty RPC list leaves `connect-src 'self'`, an empty
  game or operator list is `'none'`; the Play and verify APIs are same-origin
  there, through the proxy): `connect-src 'self' {{connectOrigins}}` (the Play
  API's and the RPC endpoints' origins), `frame-src {{gameOrigins}}`, and
  `frame-ancestors {{operatorOrigins}}` (`'none'` when the list is empty).
  `contentSecurityPolicyFor` computes the filled policy for a validated
  document; `verifyContentSecurityPolicyFor` does the same for the verify page's
  (its `connect-src` takes the origin of `verifyApiBaseUrl`, which the validated
  document keeps and which validation holds to the page's own origin,
  verify-page.md V-3a, and the RPC endpoints' origins). `Permissions-Policy`
  turns off camera, microphone, geolocation, payment, USB, MIDI, display
  capture, credential `get`, and clipboard read (clipboard write is not a
  recognised feature and is not listed); this list is proposed for review;
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

#### The game's site

The staging game origin is `se-games-stage`'s own
`https://se-games-stage.pages.dev` (public: a `pages.dev` name, not a custom
hostname; the Wrapper's and the verifier's hostnames are still never written
here). Its W-37 comparison key (the last two labels, ADR-007) is `pages.dev`,
which the Wrapper's custom hostname does not share; a Wrapper on a `*.pages.dev`
name would be refused as `same-site`. The backend's catalog keeps only an origin
per game version, so where the page lives on that origin is the kit's
convention: the Wrapper frames `<game origin>/?parentOrigin=...` (`gameUrlOf`,
W-37), so the reference game's page is served at the root.

- **Layout.** The reference game's `vite build` output (`index.html`, one
  script, one stylesheet), as one deterministic tar,
  `se-client-reference-game.tar` (`tools/reference-game-artifact.ts`), made by
  `tools/reference-game-artifact-cli.ts` from the game's build in both of the
  release dry run's scratch copies (kept with `--keep`; two paths, two time
  zones and locales) with one digest required, and unpacked unchanged at the
  site's root. No proxy, no `_routes.json`, no `environment-config.json`: the
  game calls no API and reads no configuration. The deploy refuses an artifact
  without `index.html` or with a `_worker.js`, `_routes.json`, `_redirects`,
  `_headers`, or `environment-config.json`.
- **Which games.** The one page plays every `steps` round: the catalog's
  `coin-flip-v1` and `cash-or-crash-v1` both name this origin. `book-slot-v1`
  names it too, but a book round is not playable in the first release: the
  Wrapper refuses it before any signature (W-26, the `missing` refusal), and the
  reference game plays `steps` only. A book game is issue #146 (decided
  2026-10-28): the same page plays `book-slot-v1`'s base mode at this origin,
  with no change to the layout or the headers
  ([Book playback](./wrapper/book-playback.md),
  [the reference game](./client-kit/the-reference-game.md)).
- **Headers** (`_headers`, on `/*`), written by the deploy: the page's own
  `<meta>` policy with `frame-ancestors` added, which a `<meta>` cannot carry
  ([the reference game](./client-kit/the-reference-game.md)):
  `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors <the Wrapper's origin> <the operator origins>`,
  the Wrapper's own `Permissions-Policy` (read from its `headers.json` `/*`
  rule, so the two cannot drift; a `headers.json` without one fails the step),
  `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Decided
  by the human, 2026-10-27 (W-37 and W-38 leave the game host's headers to the
  host). The Wrapper's origin is the origin of the Wrapper site's validated
  configuration document's `playApiBaseUrl`, so no new value or hostname is
  needed; a document without an `https` origin there fails the step. The
  operator origins are the same document's `operatorOrigins`, sorted and unique,
  as in the Wrapper's own `frame-ancestors`: `frame-ancestors` checks every
  ancestor ([operator embedding](./wrapper/operator-embedding.md#security)), so
  an operator page that embeds the Wrapper, which embeds the game, must be
  listed too. With no operator origin the list is the Wrapper's origin alone
  (never `'none'` beside an origin).
- **What the policy does not do.** It cannot stop an allowed ancestor, an
  operator origin included, from framing the game directly. What keeps such a
  frame from playing is the game's own parent check (`parentOrigin` against
  `location.ancestorOrigins`, `apps/reference-game/src/parent-origin.ts`;
  [the reference game](./client-kit/the-reference-game.md)) and the Wrapper's
  bridge (W-37, W-38): a framer other than the Wrapper is not the Wrapper's game
  frame, its messages carry its own origin, and the game holds no key, no token,
  and no amount.
- **Configuration.** `PAGES_GAME_ORIGINS` (the Wrapper's `gameOrigins`, and so
  its `frame-src`) holds this origin; the infrastructure owner sets it.

<!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). Production hosting: its Pages projects and hostnames, the `pages-prod` environment with its configuration in a separate environment that holds no deploy credential, and the real operator origins behind `frame-ancestors` (staging holds a placeholder). Hostnames are shared out of band, never written in this repository. Reason: ADR-008 deploys staging only; production is to come. -->

**The RPC providers** ([wrapper.md](./wrapper.md#configuration)): staging's
entropy chain is Somnia's public testnet (chain id 50312; the backend,
2026-10-28), and both sites' configuration names one endpoint, Somnia's public
testnet RPC, which the browser reads directly (it sends CORS for any origin;
nothing is added on the backend's edge). With one provider, staging runs as
`preview` with `minRpcQuorum` 1, so the tip check passes under W-26a's degraded
indicator. The endpoint's URL is configuration (`PAGES_RPC_ENDPOINTS`), set by
the infrastructure owner, never written in this repository.

<!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). Production's RPC provider list (two independent providers per entropy source), with its CORS behavior and `connect-src` entries. Reason: production is to come; the list is shared out of band, never written in this repository. -->

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
dependabot, changesets, and the pinned versions; CODEOWNERS names one code
owner, a repository admin. Its checklist, and the repository settings the org
owners apply (the `main` ruleset, secret scanning with push protection, private
vulnerability reporting, the publishing environment), are in the
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

| Item                                                                                                                                                                                                                                                                                                                                                                    | Owner                                               | Marker                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turning the publish path on (#154): the npm trusted publishers, the `attest` environment and the OIDC precondition, the tag ruleset, the pull request that removes `private` from the five libraries, `RELEASE_PUBLISH_ENABLED`, and the one-time rehearsal of the npm deprecation and dist-tag steps and a Pages rollback. The release workflow itself is built (#134) | org owners, with the TPO                            | <!-- TODO(release, #154): org-owner settings and the first-publish rehearsal (runbook, Bootstrap steps 2 and 6 to 8; Roll back or deprecate) -->                                                    |
| Hosting of the released Wrapper and its deploy credentials (decided for staging: ADR-008's push to Cloudflare Pages; the account, projects, token, and DNS stay the infrastructure owner's)                                                                                                                                                                             | infrastructure owner                                | <!-- TODO(hosting, #133): deferred to #133; production hosting and environment, `frame-ancestors` source. Reason: staging only; production is to come. -->                                          |
| Publication of the backend's contracts and vectors (later step; not a blocker, OQ-6 decided)                                                                                                                                                                                                                                                                            | backend maintainers                                 | <!-- TODO(contract publication, #138): deferred until go-live; where and when -->                                                                                                                   |
| The preview-stack pin and job                                                                                                                                                                                                                                                                                                                                           | backend repository                                  | the kit's side is the preview mode of the e2e suite ([testing-and-ci.md](./client-kit/testing-and-ci.md), [runbook](../runbook/preview-e2e.md)); the pin and the job live in the backend repository |
| Type-aware lint (`oxlint-tsgolint`, for rules such as `no-floating-promises`)                                                                                                                                                                                                                                                                                           | follow-up pull request (needs an ADR-001 amendment) | <!-- TODO(follow-up): add `oxlint-tsgolint` to the allow-list and enable the type-aware rules -->                                                                                                   |

## References

- [wrapper.md](./wrapper.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`; the
  Snapshot schema `se.snapshot/1` and its bundle; the signed-action spec; the
  signing vectors.
