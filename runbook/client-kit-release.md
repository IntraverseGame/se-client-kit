# Releasing and publishing the client kit

## When to use

Procedures for this repository, `se-client-kit`
([specs/client-kit.md](../specs/client-kit.md),
[ADR-001](../decisions/ADR-001-toolchain-and-signing.md)): scaffolding the
toolchain, syncing a contract, releasing the packages and the Wrapper bundle,
checking a release, deploying `main` to Cloudflare Pages, and rolling back or
deprecating one. They hold **procedures only**: this repository is public, so no
credential, token, hostname, or account identifier appears here, and none may be
added. Where a value is needed, this runbook says which secret or setting holds
it, by name.

Repository settings are the org owners' to apply. GitHub's own settings are the
source of truth for what is configured.

## Prerequisites

- Write access to this repository; for settings and secrets, an org owner.
- The change reviewed and approved by CODEOWNERS (the two org owners), because
  this repository is public.
- Node and `pnpm` at the versions the repository pins (`.node-version` and
  `packageManager`).
- For a contract sync: access to the private source of the contract (a person,
  never a CI job of this repository).

## Steps

### Bootstrap the toolchain

The repository exists (public, `main`) and holds this knowledge layer. The
toolchain is added by the scaffolding pull request plus the settings below. The
org owners apply the settings; ask them for each.

1. **Scaffolding pull request** (review every file before it is merged, per the
   [never-public checklist](../specs/client-kit.md#never-in-the-public-repository)):
   - `pnpm-workspace.yaml` (with `minimumReleaseAge`, an `allowBuilds` with no
     `true` entry that keeps dependency lifecycle scripts off, and
     `trustPolicy`), the root `package.json` with `packageManager` and the
     wireit scripts, `.node-version`, and `pnpm-lock.yaml`;
   - the packages and apps (`contracts` as data only, `signing`, `snapshot`,
     `play-client`, `shell`, the `wrapper` app) and the reference game, each
     empty but building;
   - the lint, format, and type-check configuration, the import-direction rule
     that enforces the dependency direction of the packages, and the rule that
     only tests import the `contracts` test-only entry;
   - `.github/workflows` (CI, and later release, with every Action pinned by
     full commit SHA and `permissions` set per job), the local setup action
     under `.github/actions/setup`, `.github/dependabot.yml` (github-actions and
     `npm`, each with a 7-day cooldown that matches `minimumReleaseAge`),
     `.github/CODEOWNERS` naming the two org owners;
   - the real script list in `AGENTS.md`, `CONTRIBUTING.md`, and the memories.

   Landed by the toolchain pull request: everything above except the release
   workflow and the real CODEOWNERS. Nothing in it needs a repository secret: CI
   runs with no wireit task cache (`WIREIT_CACHE=none`, #53) and caches only the
   pnpm store, with the job's own cache credentials. The release workflow
   (`.github/workflows/release.yml`) and the release dry run landed with the
   publishing work (#12); its publish job stays off until steps 5 to 8 are done.

   `.github/CODEOWNERS` stays comment-only until the org owners give their
   handles; branch protection (below) is the interim control.

2. **Branch protection or a ruleset** on `main`: require a pull request and
   approvals; require review from code owners; block direct and force pushes; no
   self-approval; do not allow administrators to bypass; require the `ci-ok`
   check; dismiss stale approvals when new commits are pushed (the `version` job
   force-pushes its branch, so an approval must not outlive the commit it saw).
   Also a **tag ruleset** that blocks creating, updating, and deleting tags for
   everyone but the org owners, so a workflow token (such as the `version` job's
   `contents: write`) cannot create a tag.
   <!-- TODO(org owners, #3): the tag ruleset that blocks tag creation by Actions (bypass for the org owners only), and "dismiss stale pull request approvals when new commits are pushed" on `main`. -->
3. **Secret scanning and push protection** on. Dependabot alerts and security
   updates on.
4. **Actions settings:** read-only default workflow token; Actions may not
   create or approve pull requests; first-time and outside contributors'
   workflows need approval (GitHub's "Fork pull request workflows" setting).
5. **The publishing environment `release`** (#3): required reviewers designated
   by the org owners, a deployment-branch restriction to `main`, and no
   self-review. Create it **before** anyone sets the variable in step 8: GitHub
   creates an environment that a running job names and that does not exist yet,
   without any protection. The publishing credential, if one is needed at all,
   is a secret of this environment only, never a repository-level secret.
   <!-- TODO(org owners, #3): create the protected `release` environment. -->
   <!-- TODO(infrastructure owner, #3): deferred to #3 (owner: TPO, with the org owners; reason: the npm scope is not claimed yet). The form of the npm credential. Preferred: npm trusted publishing (OIDC) for each of the five packages, trusting this repository, the workflow `release.yml`, and the environment `release`, so no npm token is stored anywhere. Confirm that the pinned pnpm exchanges the OIDC token itself; if it does not, the publish step moves to the npm CLI, which needs a recorded decision. -->
6. **npm:** claim the `intraverse` organization (scope `@intraverse`, packages
   `@intraverse/se-client-<name>`, decided in ADR-001; issue #3 still carries
   the older working name `@superengine`). It is not claimed yet. It is owned by
   the org owners, not a person; two-factor required.
   <!-- TODO(org owners, #3): claim the npm organization `intraverse` and the five package names. -->
7. **Split the publish job (required before step 8; decided by the human).**
   Stripping token-like variables from a child's environment is hygiene, not
   isolation: a process of the same user can read its parent's environment (on
   Linux, `/proc/<pid>/environ`), so a job that holds `id-token: write` must not
   run repository tooling at all. Today the `publish` job still builds, packs,
   and runs `tools/release-publish.ts` while it holds the OIDC request token.
   Before any real publish, a pull request splits it into a **build job**
   without `id-token` (build, pack, check, and upload the five tarballs and the
   Wrapper artifact with their digests) and a **publish-only job** with
   `id-token: write` that runs no repository tooling: it downloads the files,
   verifies their digests against the build job's outputs, and runs
   `pnpm publish <tarball>`. It needs the artifact upload and download Action
   that ADR-005 (to come) proposes, and is built after that ADR is accepted.
   <!-- TODO(release, #134): deferred to #134 (owner: TPO). Split the publish job into a build job without `id-token` and a publish-only job that runs no repository tooling. Must be merged before RELEASE_PUBLISH_ENABLED is ever set. Reason: it waits on ADR-005's acceptance, and no real publish happens before #3. -->
8. **Turn the publish job on**, only after steps 5 to 7 and the trusted
   publishers exist:
   - a reviewed pull request removes `"private": true` from the five libraries'
     `package.json` and the "not published to npm yet" line from their READMEs
     (the publish step refuses a private package);
   - an org owner sets the repository **variable** (not a secret)
     `RELEASE_PUBLISH_ENABLED` to `true`. Until it is `true`, the workflow's
     `publish` job is skipped and the `release` environment is never named by a
     run. Setting it back to anything else turns publishing off again.
   <!-- TODO(org owners, #3): set RELEASE_PUBLISH_ENABLED once the environment and the trusted publishers exist. -->

### Sync a contract into the kit

Run by a person with access, whenever a contract the kit pins changed at its
source (the drift check says so):

A sync touches **one package**, `contracts` (`packages/contracts/`).

1. Fetch the source repositories (`git fetch`) so the refs you name are current.
   The working trees do not matter: the sync reads committed files.
2. Write a sources file **outside this repository** (it holds paths on your
   machine). One entry per group: `play-api-document`, `verify-api-document`,
   `snapshot-schema`, `snapshot-vectors-valid`, `snapshot-vectors-invalid`,
   `snapshot-vectors-signature`, `snapshot-vectors-typed-data`,
   `snapshot-vectors-signed-action`, `signing-vectors`, `kernel-vectors-seed`,
   `kernel-vectors-shuffle-draw`, `kernel-vectors-steps-derive`,
   `kernel-vectors-derive` (`tools/contracts-groups.ts` is the list). Each has
   `name` (the repository, recorded in the lock), `repo` (your local checkout),
   `ref` (for example the default branch on `origin`) and `path` (the file or
   directory in that repository). The lock records only public names, so the
   paths are not in this repository: the source's own documentation names them,
   or ask its owners. Keep your sources file for the next sync. Copy only the
   Play and verify OpenAPI documents, the Snapshot schema and vectors, the
   signing vectors, and the fairness kernel's public sets
   (`kernel/public/v1/*`); never another surface's document.
3. Run `pnpm exec tsx tools/sync-contracts.ts --sources <file>`. It copies the
   files and rewrites `packages/contracts/contracts.lock.json` together. It
   refuses to change or remove a vector that is already locked; pass
   `--allow-vector-change` only before the first release, and say so in the pull
   request. A group you do not mean to move (the signing vectors, for example)
   keeps the ref it was last synced at: name that commit as its `ref`.
4. Run `pnpm exec tsx tools/generate-contracts.ts --write` to regenerate the
   types and the vector catalog, then `pnpm check`. Vectors stay on the
   test-only entry; the lint rule, `check:contracts`, and `check:build-output`
   catch an import from non-test code or a vector in an output.
5. Open a pull request. In the description, say what changed and why; the
   reviewers check every copied file against the never-public checklist.

### Release

The kit uses changesets. The release workflow (`.github/workflows/release.yml`)
runs only by hand (`workflow_dispatch`). Its `dry-run` job always runs and
publishes nothing; its `version` job runs only when it was started from `main`
with **version** ticked, after the dry run passed (step 2); its `publish` job
runs only when it was started from `main` with **publish** ticked, the variable
`RELEASE_PUBLISH_ENABLED` is `true` (Bootstrap step 8), and a required reviewer
of the `release` environment approves. Every Action is pinned by full commit
SHA; the workflow starts with `permissions: {}`; `dry-run` gets
`contents: read`, `version` `contents: write` and `pull-requests: read` (no
`id-token`, no environment), and `publish` `contents: read` and
`id-token: write` (provenance and trusted publishing). The release jobs use the
setup action with `cache: "false"`: no pnpm store cache, and no wireit task
cache (no workflow uses one, and the release build steps set
`WIREIT_CACHE=none`), so nothing is restored from a cache into a release build.
Lifecycle scripts stay off throughout (`allowBuilds`, `--ignore-scripts`, and
the tarball check refuses any lifecycle script in a published manifest).

1. A pull request that changes a published package or the Wrapper includes a
   changeset (`pnpm changeset`) naming the packages and the bump (major for a
   break, minor for an addition, patch for a fix) and a note for the release. A
   change to a contract's version (a new Play prefix, a new Snapshot schema) is
   a **major**. Its CI runs `release-dry-run` (below), so a changeset that would
   break a tarball fails before merge.
2. **Version pull request.** The changesets are applied (`changeset version`:
   versions and changelogs) in a pull request of their own. Review it: the
   versions, the changelogs, and that the lock file's contract entries match
   what the notes say. The changelogs come from `@changesets/changelog-github`
   (repository `IntraverseGame/se-client-kit`), which calls the GitHub API when
   `changeset version` runs, so it needs a `GITHUB_TOKEN`: the token the Actions
   runtime provides to a job, with the least permissions the job needs, passed
   to the step as an environment variable. It is never a stored secret or a
   personal token, and it is never committed. Nothing else needs it: install,
   build, `changeset status`, and the dry run work offline.

   To make it, start the release workflow from `main` with **version** ticked
   and **publish** not ticked (a run with both ticked fails in its first step,
   and nothing runs). After the `dry-run` job passes, the `version` job checks
   out `main` with its whole history (changesets reads the commit that added
   each changeset; no credential is left in `.git/config`), runs
   `pnpm exec changeset version` with the job's `GITHUB_TOKEN`. A step without
   the token then refuses to push anything but a modified `package.json`, an
   added or modified `CHANGELOG.md` (neither inside `.changeset/`, where
   changesets would read it as a pending changeset), or a changeset deleted
   directly under `.changeset/` (never its `README.md`), all regular files: a
   rename counts as a deletion and an addition, and a type or mode change or a
   path with a character outside `A-Z a-z 0-9 . _ / @ -` is refused. Only then
   does the last step commit the result (every git command of the two steps with
   `core.hooksPath=/dev/null` and `core.fsmonitor=false`, the commit and the
   push with `--no-verify`, so no hook or fsmonitor planted in `.git` runs) as
   `github-actions[bot]` (`chore(release): version packages`) and
   **force-pushes** it to the branch `changeset-release/main`; the token reaches
   git through a credential helper that reads the environment, never the command
   line. With no pending changeset it pushes nothing. Actions never open a pull
   request here (Bootstrap step 4), so a person opens the pull request from
   `changeset-release/main` into `main`; the job's summary names the commit. The
   branch is regenerated on every run: never commit to it by hand (the next run
   overwrites it); fix a note in its changeset on `main` and run the job again.
   A push made with `GITHUB_TOKEN` starts no workflow, so when the job updates
   the branch of a pull request that is already open, close and reopen the pull
   request to run its checks on the new commit.

   **Accepted residual risk** (the human, 2026-10-18): the code
   `changeset version` loads runs with the job's `contents: write` token in its
   environment, so it could push to any branch no rule protects, create tags,
   and create releases; the push guard only limits what the job itself pushes.
   Branch protection on `main` and the tag ruleset (Bootstrap step 2) bound it
   until the job is split
   ([ADR-005](../decisions/ADR-005-release-attestation-and-artifact-upload.md),
   Follow-ups).
   <!-- TODO(release, #134): deferred to #134 (owner: TPO). Split the version job once actions/upload-artifact is allowed: `changeset version` with a read-only token, the push in a job that runs no repository tooling. Reason: it waits on ADR-005's acceptance. -->

3. **Publish.** After the version pull request is merged, start the release
   workflow from `main` with **publish** ticked. The `dry-run` job runs first
   and reports the Wrapper digest. The `publish` job then waits for a required
   reviewer of `release`; on approval it runs `tools/release-publish.ts`, which
   builds from the lockfile without the task cache, packs the five libraries,
   runs the same tarball and consumer checks as the dry run, and refuses to go
   on (`tools/release-readiness.ts`) while a changeset is pending, a library is
   still `private` or at `0.0.0`, or the Wrapper build differs from the dry
   run's digest; the digest is required whenever it publishes for real. That
   check is the only guard against publishing a `private` package: pnpm does not
   refuse a private package's tarball. It then publishes **the checked tarballs
   themselves**
   (`pnpm publish <tarball> --provenance --access public --ignore-scripts`), in
   dependency order. A version the registry already has is skipped only when the
   registry's `dist.integrity` equals the local tarball's SHA-512; other bytes
   under the same version fail the job. (This job layout is temporary: Bootstrap
   step 7.)
   <!-- TODO(release, #134): deferred to #134 (owner: TPO; reason: it waits on #3 and on ADR-005's acceptance). Tag the release and attach the Wrapper artifact, its `.sha256`, and its build-provenance attestation to a GitHub release, and upload the dry run's artifact from CI. This needs `contents: write` and `attestations: write`; an ADR to come proposes `actions/attest-build-provenance` and `actions/upload-artifact` for it (decided; not added before that ADR is accepted). -->
4. Record in the release notes the contracts the release was built against: the
   Play API prefix, the Snapshot schema id, and the signing vector set, and the
   Wrapper artifact's digest.

### Dry run

`pnpm release:dry-run` (locally), the `release-dry-run` CI job, and the release
workflow's `dry-run` job run `tools/release-dry-run.ts`. It needs no credential
and no network, and publishes nothing:

1. It copies the working tree (the files git would commit, so uncommitted
   changes are included locally; in CI it is the commit) into two scratch
   directories, and installs each from the lockfile offline with lifecycle
   scripts off. Its commands get an environment without token-like variables,
   with pnpm's install-before-run off and an empty npm user configuration (no
   `~/.npmrc` is read). That keeps them from using a credential by accident; it
   is not a security boundary (Bootstrap step 7).
2. In each copy it runs `changeset version` (with the changelog generator off,
   since that one calls the GitHub API) and `pnpm build` without the task cache.
3. In the first copy it runs `check:build-output` and `check:package-files`,
   packs the five libraries (`pnpm pack`), and checks each tarball
   (`tools/package-tarball.ts`): only `package.json`, `README.md`, `LICENSE`,
   and the `dist/` files `files` selects; the right name and version; exact
   dependency versions (no `workspace:` left); no lifecycle script; every
   `exports` target present except the `contracts` test-only entry, which must
   be absent along with any `testing` or `vectors` path; the build-output checks
   and the vector canary over every packed file. It then unpacks the tarballs
   into a consumer `node_modules`, imports every runtime `exports` entry of
   every package in Node, requires of each type-only entry (a `types` condition
   and nothing else, such as `@intraverse/se-client-shell/controller`) that its
   `.d.ts` target is in the tarball and that importing it fails with
   `ERR_PACKAGE_PATH_NOT_EXPORTED`, and requires
   `@intraverse/se-client-contracts/testing` not to resolve. Last, it runs
   `pnpm publish <tarball> --access public --ignore-scripts --no-git-checks --dry-run --registry http://127.0.0.1:9/`
   for each tarball, so pnpm's own publish checks run against an address nothing
   listens on, with no network. Provenance is exercised only in Actions, where
   the OIDC token exists: the dry run cannot show it.
4. It builds the Wrapper release artifact in each copy (the second with another
   time zone and locale): `se-client-wrapper-<version>.tar`, a deterministic tar
   of `apps/wrapper/dist/` (sorted, fixed metadata, uncompressed), whose SRI,
   policy, and manifest the Wrapper's build already enforced. Its **digest** is
   the SHA-256 of that file (`sha256:<hex>`). The two digests must be equal, and
   the two copies' package tarballs byte-identical.
5. It holds the first copy's Wrapper output to its size budget
   (`tools/size-budget.ts`: every file uncompressed, and the page with its
   scripts and stylesheets gzip-compressed), and the verify page under `verify/`
   to its own, measured apart (specs/verify-page.md, V-16); a measurement over
   its limit is a problem, listed once. (`pnpm check:size-budget` applies the
   same check in `pnpm check` and the `build` CI job.)
6. It writes to `--out` the artifact and its `.sha256`, the five tarballs, and
   `release-dry-run.json` (source commit, versions, tarball hashes, digests, the
   size budget, problems), and prints the same summary (in CI, also to the job
   summary).

Run it locally. `--out` must be an empty directory outside the repository; by
default it is a new temporary directory. Give options to the CLI itself, not
through `pnpm release:dry-run -- ...`: wireit hands extra arguments to a
`shell: true` spawn unescaped (Node's DEP0190 warning).

```sh
pnpm release:dry-run                                        # output in a new temporary directory
pnpm exec tsx tools/release-dry-run.ts --out "$(mktemp -d)"   # output where you say
```

Add `--keep` (to the second form) to keep the scratch copies for inspection. The
offline installs read the store of the repository's own install
(`pnpm store path`, passed as `--store-dir`), so run
`pnpm install --frozen-lockfile` first.

### Verify before and after

Before publishing (in the version pull request's CI): all required jobs green,
`release-dry-run` included, which shows each published package contains its
`README.md` and `LICENSE` and no test-only entry and that the Wrapper digest is
reproducible; the contract hashes match the lock; the bundle is the unmodified
bundle (no test or per-environment build) and contains no vector; the Wrapper is
within its size budget (the dry run's summary shows each measurement, its limit,
and what is left; [the budget](../specs/client-kit/testing-and-ci.md)).

After publishing:

1. **npm provenance:** for each package, the version's page shows the provenance
   statement linking the commit and the workflow run; or run
   `npm audit signatures` against the installed package.
2. **Bundle:** download the Wrapper artifact, check its SHA-256 against the
   release's digest (`shasum -a 256 -c se-client-wrapper-<version>.tar.sha256`),
   unpack it, recompute the SHA-256 of every file and compare with
   `integrity-manifest.json`; verify the attestation with the GitHub CLI
   (`gh attestation verify`) against this repository, once releases carry one.
3. **Reproduce:** check out the released commit and run
   `pnpm install --frozen-lockfile` and `pnpm release:dry-run`; the printed
   Wrapper digest must equal the release's. A difference is an incident (see
   Escalation).
4. **Compatibility:** the release notes' contract versions match what the
   backend serves in the target environment. Do not promote a Wrapper whose Play
   prefix or Snapshot schema the backend does not serve.
5. **Promotion** is a push from this repository, to staging only (production is
   to come): a merge to `main` deploys `main`'s Wrapper artifact to the staging
   Cloudflare Pages projects (the Pages workflow; see
   [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)), and its deploy
   job logs the digest it deployed. After it, play one round in that environment
   from a test launch (the launch page URL, then `#`, then the bare launch
   code), and check there is no console error, the address bar no longer shows
   the code once the page has loaded, and a reload shows "Your session has
   ended" (the code is single use). Until the Play API's redeem answer carries
   `gameOrigin` and the kit vendors it, the Wrapper mounts no game, so a round
   cannot be played to its end there.

### Deploy to Cloudflare Pages

The Pages workflow (`.github/workflows/pages.yml`,
[ADR-008](../decisions/ADR-008-pages-deploy-with-wrangler.md)) deploys `main` on
every push to it, to two staging Pages projects (Direct Upload, production
branch `main`), each on its own hostname. Staging only; production is to come.

- `se-wrapper-stage`: the Wrapper at `/`, with its copy of the verify page at
  `/verify/`;
- `se-verifier-stage`: the verify page (the artifact's `verify/` directory plus
  a root copy of its page). Its base is `<verifier origin>/verify` (the
  configuration's `verifyBaseUrl`), and a round's page is that base plus
  `/rounds/{roundId}`: `https://<verifier host>/verify/rounds/{roundId}`, the
  URL the Wrapper's verify link opens. A link from elsewhere to a round uses the
  same base and suffix.

Each site carries the same-origin API proxy (`apps/pages-proxy`) as its
`_worker.js`, its own `environment-config.json`, a `_routes.json` that sends
only its API paths to the proxy (`/play/v1/*` and `/verify/v1/*` on the
Wrapper's, `/verify/v1/*` on the verifier's), and its `_headers`
([specs/client-kit.md](../specs/client-kit.md#the-pages-api-proxy)).

Three jobs:

- `build`: the release dry run (the Wrapper artifact built twice, one digest
  required) and the proxy worker (`tsc`), with a read-only token and no secret.
- `config-stage`: the two sites' configuration documents, built from the
  `pages-stage` configuration secrets and validated with the Wrapper's own
  validator (`apps/wrapper/pages-config-cli.ts`). It references only those
  secrets, never the token, but it runs in the same environment: an accepted
  risk for staging only (ADR-008, Risks accepted).
- `deploy-stage`: checks every download against its digest, lays out the two
  sites, writes their `_routes.json` and `_headers` (the CSP lists read from the
  configuration documents), and runs `wrangler pages deploy --no-bundle` (pinned
  by the lockfile) once per project. It runs no repository script.

Every job is skipped until `PAGES_STAGE_DEPLOY_ENABLED` is set.

**Setup, once, by the infrastructure owner** (names only here; the values never
enter this repository, an issue, or a log):

1. In Cloudflare: the two projects, their custom hostnames in the shared zone,
   and an API token with Pages edit on that account and nothing else. Done by
   the infrastructure owner.
2. In each Pages project, two plain production environment variables. They take
   effect only on a deployment made after they are set, so set them before the
   first deploy, or redeploy after changing them.
   - **`SE_API_UPSTREAM_ORIGIN`**: the API's origin only (`https://host`, no
     path, no trailing slash). Without it, every API call through the proxy
     answers a bare 502. Done by the infrastructure owner (2026-10-27).
   - **`SE_API_PATH_PREFIXES`**: the site's API prefixes, whitespace-separated:
     `/play/v1/ /verify/v1/` on `se-wrapper-stage`, `/verify/v1/` on
     `se-verifier-stage`. Without it, every API call answers a bare 502. To set.
   - The project's **compatibility date** must be on or after 2024-11-11 (the
     proxy's `fetch` asks for `cache: "no-store"`, which older dates refuse;
     every API call would then answer a bare 502).
3. In GitHub, the environment **`pages-stage`**, deployment branches restricted
   to `main`. Done by the infrastructure owner.
4. Its secrets (no variables; every value is read with `secrets.`):
   - **`CLOUDFLARE_API_TOKEN`**: the token. Set.
   - **`CLOUDFLARE_ACCOUNT_ID`**: the account. Set.
   - **`PAGES_RPC_ORIGINS`**, **`PAGES_GAME_ORIGINS`**,
     **`PAGES_OPERATOR_ORIGINS`**: whitespace-separated lists of bare `https`
     origins (no path, no trailing slash), feeding both the configuration
     documents and the CSP's `connect-src`, `frame-src`, and `frame-ancestors`.
     Set (the infrastructure owner, 2026-10-27), today to placeholders: the
     configuration's disjoint-origins rule (W-49) refuses an origin that is both
     a game origin and an operator origin, so `PAGES_OPERATOR_ORIGINS` holds a
     placeholder distinct from the others.
   - **`PAGES_WRAPPER_ORIGIN`**, **`PAGES_VERIFIER_ORIGIN`**: the two sites'
     origins (`https://host`). Set.
   - **`PAGES_CHAIN_PINS`**: JSON with exactly `environment`, `runtimeSigner`,
     `registryDomain`, `entropyChainId`, `minRpcQuorum`, and `tipLagMargin`
     ([wrapper.md](../specs/wrapper.md#configuration)). Set. Staging is
     `environment: "preview"` with `minRpcQuorum` 1 until it has a
     browser-reachable RPC (#137; ADR-008, decision 8); production must be
     `"production"` with `minRpcQuorum` of at least 2.
     <!-- TODO(#135): staging's `tipLagMargin` in `PAGES_CHAIN_PINS`: the value #135 settles. -->
   - **`PAGES_RPC_ENDPOINTS`**: JSON of `rpcEndpoints`,
     `{"<source>":[{"provider":"…","url":"…"}]}`, keyed by the same entropy
     source as the pins' `entropyChainId` and `tipLagMargin`;
     `PAGES_RPC_ORIGINS` must list exactly the origins of its URLs. Set.
5. Last, the repository variable **`PAGES_STAGE_DEPLOY_ENABLED`** = `true`.

A run with the variable set and the token or the account id missing fails in its
first deploy step, naming what is missing. A configuration value that is missing
or makes an invalid document fails the config job, naming the input or the field
and the issue, never a value.

**Staging has no browser-reachable RPC yet** (#137). Until an RPC is provided,
`PAGES_RPC_ENDPOINTS` can name only a placeholder endpoint (with `minRpcQuorum`
1, which `environment: preview` allows; the Wrapper then shows its
non-dismissable "chain check not independent (development)" indicator, W-26a),
and the on-chain checks cannot pass in the browser: the Wrapper's tip check
before a round's first signature fails ("could not verify the chain", W-26a), so
no round can be started, and the verify page's chain read (check 6) fails ("this
round could not be verified against the chain", V-7). This is the specified
behavior for an unreachable RPC, not a fault of the deploy.

A production deploy later is a second environment (`pages-prod`, with the same
names inside), a second gate (`PAGES_PROD_DEPLOY_ENABLED`), and second config
and deploy jobs with the production project names (ADR-008).

**After the first deploy** (the real test: zone-wide settings can still answer
with a 403 or a challenge page), on each site:

1. A `/play/v1` call through the proxy on the Wrapper's site, and a `/verify/v1`
   call on each site, return the API's JSON (an API error in JSON is fine), with
   `Content-Type: application/json`, not an HTML challenge page, a 403 from the
   edge, or the proxy's bare 502 (a missing project variable, an old
   compatibility date, or an unreachable API). For example
   `curl -s -i -X POST <the Wrapper's site>/play/v1/sessions:redeem -H 'Content-Type: application/json' --data '{}'`.
   The answer carries the proxy's `Content-Security-Policy` and
   `X-Content-Type-Options: nosniff`.
2. On the verifier's site, a `/play/v1` path is not forwarded (the site's static
   page or a 405, never the API's JSON).
3. `<site>/environment-config.json` on each site is that site's document.
4. The response headers of `/` and `/verify/` on the Wrapper's site, and of `/`
   and `/verify/rounds/<a round id>` on the verifier's: each has exactly one
   `Content-Security-Policy` (the Wrapper's on `/`, the verify page's on
   `/verify/` and everywhere on the verifier's site), plus `Referrer-Policy` and
   `Permissions-Policy`. Two policies mean Pages merged the rules: stop
   deploying (unset `PAGES_STAGE_DEPLOY_ENABLED`) and fix the headers step.

Check them again after any change to `headers.json`, the proxy, the
configuration, or the projects' settings.

**Redeploy** `main` without a commit: run the Pages workflow by hand on `main`
(Actions, Pages, Run workflow). Needed after changing a Pages project variable.

**Rollback:** in the Cloudflare dashboard, the project's Deployments, choose the
last good production deployment and Rollback; or the Pages API's rollback of a
deployment, with an API token of the infrastructure owner's (not the CI token's
value, which is never copied out of the environment). Roll back each project
that needs it; a rollback serves that deployment's own files, worker, and
configuration at once. The next merge to `main` deploys again, so fix forward
(or unset `PAGES_STAGE_DEPLOY_ENABLED` to hold the rollback) before merging.
Each deployment records the commit (`--commit-hash`) it came from, and its run
logs every digest.

**Rotate the Pages token:** the infrastructure owner creates a replacement with
the same scope, writes it into the `pages-stage` environment's
`CLOUDFLARE_API_TOKEN`, runs the workflow by hand on `main` to prove it, and
revokes the old token. Record the date (the secret name and date only).

### Roll back or deprecate

- **A bad Wrapper deploy:** roll the Pages projects back to the previous
  deployment ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages),
  Rollback). Then fix forward here: a changeset, a patch release, and a new
  digest. Nothing in this repository is rolled back; a released artifact is
  never rebuilt in place.
- **A bad npm version:** do not unpublish a version others may depend on. An org
  owner, signed in to npm with two-factor (never from CI, never with a token in
  a file), runs
  `npm deprecate @intraverse/se-client-<name>@<version> "<what is wrong>; use <fixed version>"`,
  then the fix ships as a patch through the normal release, and both are
  recorded in the changelog. If the bad version is `latest`, the patch moves
  `latest` on publish; to move it sooner, the same org owner runs
  `npm dist-tag add @intraverse/se-client-<name>@<previous good version> latest`.
  Unpublish only a version that contains a secret or malicious code, and only an
  org owner, within npm's rules, as part of the incident below.
- **A contract mismatch** (the backend moved): sync the contract, release a
  patch or minor, promote; until then keep the previous Wrapper digest in place.

<!-- TODO(#3, #134): deferred to #134 (owner: TPO; reason: it waits on #3). Verify the npm deprecation and dist-tag steps once, on the first published version, and the Pages rollback once. The npm steps cannot be exercised before the npm organization and the `release` environment exist; the dry run covers everything up to the publish. -->

### Rotate the npm credential

If the release uses a stored npm token (rather than trusted publishing):

1. An org owner creates the replacement credential in npm with the narrowest
   scope (publish for the kit's packages only), and writes it into the `release`
   environment secret. It is never pasted in a chat, an issue, or a log.
2. Run a release of a trivial change to prove the new credential works.
3. Revoke the old credential in npm.
4. Record the date (the secret **name** and date only) with the org owners'
   access notes.

<!-- TODO(infrastructure owner, #3): deferred to #3 (owner: TPO, with the org owners). The rotation schedule, and whether a stored token is used at all. Reason: the npm scope and the credential form are not settled yet. -->

## Verification

- The settings in Bootstrap read back correctly: use the read-only `gh api`
  calls for rulesets, environments, collaborators, and CODEOWNERS errors against
  this repository.
- A test pull request cannot be merged without code-owner review and `ci-ok`.
- `pnpm release:dry-run` prints no problem and two equal Wrapper digests.
- A release's packages show provenance, and the bundle matches its manifest.

## Troubleshooting

- **A check passes locally or in CI but should fail (or the reverse).** wireit
  may have restored a cached result. Run `pnpm clean:cache && pnpm check`; then
  fix the script's `files` so every input is declared. In CI, a changed lockfile
  or any declared input already changes the cache key.
- **`pnpm install --frozen-lockfile` fails on a fresh worktree.** `node_modules`
  and `.wireit` are per worktree; the lockfile is out of date only if
  `package.json` changed without `pnpm install`.
- **A new dependency version cannot be resolved.** It is younger than seven days
  (`minimumReleaseAge`); wait, or pick the previous version. Do not lower the
  age.

- **A pull request cannot merge: code-owner review missing.** The two org owners
  are the owners; an author cannot approve their own change, so the other org
  owner reviews.
- **`contracts` job fails on a hash.** A file differs from the lock: re-run the
  sync, or the file was edited by hand; restore it from its source.
- **`contracts` job fails on a generated file.** A vendored document and the
  committed generated files differ: run
  `pnpm exec tsx tools/generate-contracts.ts --write` and commit the result.
- **The sync refuses with "append-only".** A vector that is already locked
  changed or disappeared at its source. Ask the source's owners why; a released
  vector is never edited.
- **Provenance is missing on a version.** The package was published outside the
  release workflow. Deprecate it and republish from the workflow.
- **The publish job waits.** It needs an approval from a required reviewer of
  the `release` environment.
- **The publish job is skipped.** It runs only from `main`, with **publish**
  ticked, and with the variable `RELEASE_PUBLISH_ENABLED` set to `true`
  (Bootstrap step 8).
- **The publish step says "Not ready to publish".** A changeset is pending
  (merge the version pull request first), a library is still `private` or at
  `0.0.0` (Bootstrap step 8), `--expect-wrapper-digest` is missing, or the
  Wrapper build differs from the dry run's.
- **The publish step says "The registry disagrees".** A version being released
  is already on npm with other bytes. Never overwrite it: bump the version with
  a changeset and release again; if the published bytes are not ours, treat it
  as a security incident (Escalation).
- **"the Wrapper output has no index.html, so it is not a release build"** (or
  `verify/index.html`; `check:size-budget`, the dry run, or the publish step).
  `apps/wrapper/dist/` exists but is empty or lacks a page (the Wrapper's, or
  the verify page the Wrapper's build copies from `apps/verify/dist/`): a build
  failed halfway or something else wrote there. Run `pnpm build` again (after
  `pnpm clean:cache` if wireit restored a stale output) and check the Wrapper's
  build output; never release such an output.
- **"over its size budget"** (`check:size-budget`, the dry run, or the publish
  step). The Wrapper's release output, or the verify page under `verify/`, grew
  past a limit. Find what grew (compare `apps/wrapper/dist/` with `main`'s
  build); shrink it, or raise the limit in a reviewed change to
  `tools/size-budget.ts` and the budget list in
  [the testing spec](../specs/client-kit/testing-and-ci.md) together (a test
  keeps them equal), saying why in the pull request. Never raise it to make a
  release pass unexamined.
- **The `version` job says "changed more than it should".** `changeset version`
  changed something other than a modified `package.json`, an added or modified
  `CHANGELOG.md`, or a deleted changeset; each `Unexpected change:` line names
  the status and the path. Nothing was pushed. Find out what wrote it before
  running the job again.
- **The release run failed at once with "Tick either version or publish, not
  both".** The `dry-run` job's first step refuses a run with both inputs, so
  nothing ran. Start the `version` run, merge its pull request, then start a
  `publish` run on its own.
- **The version pull request's checks did not run after the job pushed.** A push
  made with the job's `GITHUB_TOKEN` starts no workflow: close and reopen the
  pull request.
- **The dry run reports "not reproducible".** Two builds of the same files gave
  different bytes. Keep the scratch copies (`--keep`), compare the two
  `apps/wrapper/dist/` trees (or the two tarballs) with `diff -r`, and find what
  the build read from its environment (a path, the time, the time zone, the
  locale). Do not release until it is fixed.
- **The dry run fails to install offline** (`ERR_PNPM_NO_OFFLINE_TARBALL`). The
  store its installs read (`pnpm store path` in the repository, passed as
  `--store-dir`) lacks a package the lockfile names: run
  `pnpm install --frozen-lockfile` in the repository first, which fills that
  store. If `pnpm store path` differs between the repository's install and the
  dry run's, something in the environment moved the store (`PNPM_HOME`, a
  `store-dir` setting); the dry run keeps `PNPM_HOME` and names the store
  explicitly for that reason.
- **The drift check reports a difference.** Run the contract sync.

## Escalation

A compromised publishing credential, a published version that contains a secret
or malicious code, a bundle that does not match its manifest, or a leaked file
in this public repository is a **security incident**: tell the two org owners
and the infrastructure owner at once; deprecate the affected versions; revoke
and rotate the credential (for the Pages token: revoke it in Cloudflare and
replace the `pages-stage` environment secret); roll the Pages projects back to a
known-good deployment; and consider anything that was committed as published (it
cannot be taken back once cloned). An outside finding is reported through
`SECURITY.md`.

## References

- [specs/client-kit.md](../specs/client-kit.md),
  [specs/wrapper.md](../specs/wrapper.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md),
  [ADR-008](../decisions/ADR-008-pages-deploy-with-wrangler.md).
