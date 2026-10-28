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
- The change reviewed and approved by the code owner in CODEOWNERS, because this
  repository is public.
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
     `.github/CODEOWNERS` naming the code owner;
   - the real script list in `AGENTS.md`, `CONTRIBUTING.md`, and the memories.

   Landed by the toolchain pull request: everything above except the release
   workflow and the real CODEOWNERS. Nothing in it needs a repository secret: CI
   runs with no wireit task cache (`WIREIT_CACHE=none`, #53) and caches only the
   pnpm store, with the job's own cache credentials. The release workflow
   (`.github/workflows/release.yml`) and the release dry run landed with the
   publishing work (#12), and its publish path with #134; the publish path stays
   off until steps 5 to 8 are done.

   `.github/CODEOWNERS` names one code owner for `*` and, explicitly, for every
   path that can reach the supply chain or a credential (#3).

2. **The `main` ruleset** (in place; decided by the org owners, 2026-10-27): a
   pull request is required, with review from code owners and every review
   thread resolved; stale approvals are dismissed when new commits are pushed
   (the `version-push` job force-pushes its branch, so an approval must not
   outlive the commit it saw); force-pushes and deletion are blocked. Decided
   deliberately: the required approval count is 0 (the code owner's approval is
   the required review), no status check is required (keep `ci-ok` green before
   merging; the ruleset does not enforce it), and organization admins and
   repository admins may bypass the ruleset. GitHub never lets an author approve
   their own pull request, and there is one code owner, so a pull request the
   code owner authors merges only through the repository-admin bypass. Also a
   **tag ruleset** on the release tag pattern
   (`@intraverse/se-client-wrapper@*`; decided by the human, 2026-10-28): it
   blocks updating and deleting those tags for everyone but the org owners, so a
   released tag never moves, and it allows creating them, so the release
   workflow's `github-release` job tags each release with the job's own token
   (Release, step 3). The `build` job refuses a release whose tag exists, so a
   run never tries to overwrite one. No job that runs repository tooling holds a
   write token.
   <!-- TODO(org owners, #154): create the tag ruleset above; needed before the first real publish. -->
3. **Secret scanning and push protection** on (they are). Dependabot alerts and
   security updates on. **Private vulnerability reporting** on, so a reporter
   can open a private advisory from the Security tab
   ([SECURITY.md](../SECURITY.md)).
4. **Actions settings:** read-only default workflow token; Actions may not
   create or approve pull requests; first-time and outside contributors'
   workflows need approval (GitHub's "Fork pull request workflows" setting).
5. **The publishing environment `release`** (decided by the org owners,
   2026-10-27): there are two required reviewers, self-review is allowed (a
   reviewer may approve a deployment they started), and deployments are
   restricted to `main`. It must exist **before** anyone sets the variable in
   step 8: GitHub creates an environment that a running job names and that does
   not exist yet, without any protection. No publishing credential is stored in
   it (step 6).
6. **npm:** the `intraverse` organization is claimed (scope `@intraverse`,
   packages `@intraverse/se-client-<name>`, decided in ADR-001). It is owned by
   the org owners, not a person; two-factor required. The publish credential is
   **npm trusted publishing (OIDC)** from `release.yml` in the `release`
   environment (decided by the org owners, 2026-10-27): no npm token is stored
   anywhere. Trusted publishing is configured per package on npmjs.com, for each
   of the five packages, trusting this repository, the workflow `release.yml`,
   and the environment `release` (the environment is required: ADR-005's
   precondition). The workflow's `publish` job publishes with the npm CLI that
   comes with the pinned Node (decided by the human, 2026-10-28), which
   exchanges the OIDC token itself; trusted publishing needs npm 11.5.1 or
   later.
   <!-- TODO(org owners, #154): configure the npm trusted publisher of each of the five packages (repository, `release.yml`, environment `release`). -->
7. **The attestation environment `attest` and the OIDC precondition**
   ([ADR-005](../decisions/ADR-005-release-attestation-and-artifact-upload.md),
   decision 2). An org owner creates the environment `attest`: no secret, no
   required reviewer, deployments restricted to `main`. The workflow's `attest`
   job runs in it, so its OIDC token names `attest`, never `release`. Before
   step 8, the org owner confirms that every npm trusted publisher of the kit
   (step 6), and any other consumer that trusts this repository's OIDC tokens,
   requires the environment `release`; otherwise the `attest` job's token could
   publish. The check is repeated whenever a trusted publisher or another OIDC
   consumer is added. Like `release`, `attest` must exist before step 8: GitHub
   creates an environment that a running job names, and that does not exist yet,
   without any protection.
   <!-- TODO(org owners, #154): create the `attest` environment and confirm the precondition. -->
8. **Turn the publish path on**, only after steps 5 to 7 and the trusted
   publishers exist:
   - a reviewed pull request removes `"private": true` from the five libraries'
     `package.json` and the "not published to npm yet" line from their READMEs
     (the `build` job refuses a private package);
   - an org owner sets the repository **variable** (not a secret)
     `RELEASE_PUBLISH_ENABLED` to `true`. Until it is `true`, the workflow's
     `build`, `publish`, `attest`, and `github-release` jobs are skipped, and
     neither the `release` nor the `attest` environment is named by a run.
     Setting it back to anything else turns publishing off again;
   - after the first real publish, the one-time rehearsal in
     [Roll back or deprecate](#roll-back-or-deprecate).
   <!-- TODO(org owners, #154): the reviewed pull request that removes `private`, then RELEASE_PUBLISH_ENABLED, once steps 5 to 7 are done and the trusted publishers exist. -->

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
runs only by hand (`workflow_dispatch`). Every Action is pinned by full commit
SHA and on the Actions allow-list
([supply-chain spec](../specs/client-kit/supply-chain.md), Pinned toolchain);
the workflow starts with `permissions: {}`, and no job that holds a write token
or an OIDC token runs repository tooling. Its jobs:

| Job              | Runs                           | Permissions                                                | Environment | Repository tooling                     |
| ---------------- | ------------------------------ | ---------------------------------------------------------- | ----------- | -------------------------------------- |
| `dry-run`        | always                         | `contents: read`                                           | none        | yes (the dry run)                      |
| `version`        | **version**, from `main`       | `contents: read`, `pull-requests: read`                    | none        | yes (`changeset version`)              |
| `version-push`   | after `version`, if it changed | `contents: write`                                          | none        | no (git only)                          |
| `build`          | the publish gate               | `contents: read`                                           | none        | yes (`tools/release-publish.ts`)       |
| `publish`        | after `build`                  | `contents: read`, `id-token: write`                        | `release`   | no (`npm publish` of checked tarballs) |
| `attest`         | after `publish`                | `contents: read`, `id-token: write`, `attestations: write` | `attest`    | no (`attest-build-provenance` only)    |
| `github-release` | after `attest`                 | `contents: write`                                          | none        | no (`gh release create`)               |

The publish gate: started from `main` with **publish** ticked, and the variable
`RELEASE_PUBLISH_ENABLED` is `true` (Bootstrap step 8); `publish` also waits for
a required reviewer of the `release` environment. The jobs that run repository
tooling use the setup action with `cache: "false"`: no pnpm store cache, and no
wireit task cache (no workflow uses one, and the release build steps set
`WIREIT_CACHE=none`), so nothing is restored from a cache into a release build.
Lifecycle scripts stay off throughout (`allowBuilds`, `--ignore-scripts`, and
the tarball check refuses any lifecycle script in a published manifest).

1. A pull request that changes a published package or the Wrapper includes a
   changeset (`pnpm changeset`) naming the packages and the bump (major for a
   break, minor for an addition, patch for a fix) and a note for the release. A
   change to a contract's version (a new Play prefix, a new Snapshot schema) is
   a **major**. Before 1.0, a breaking change is a **minor** bump (decided by
   the human, 2026-10-28). Its CI runs `release-dry-run` (below), so a changeset
   that would break a tarball fails before merge.
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
   and nothing runs). After the `dry-run` job passes, two jobs make the branch:
   - **`version`** checks out `main` with its whole history (changesets reads
     the commit that added each changeset; no credential is left in
     `.git/config`), runs `pnpm exec changeset version` with the job's read-only
     `GITHUB_TOKEN` (`contents: read`, `pull-requests: read`), and uploads
     everything it changed as one binary patch, kept one day. With no pending
     changeset it uploads nothing, and `version-push` is skipped.
   - **`version-push`** runs no repository tooling. It checks out the same
     commit, applies the patch (`git apply`, which refuses a path outside the
     tree, inside `.git`, or beyond a symbolic link), and refuses to push
     anything but a modified `package.json`, an added or modified `CHANGELOG.md`
     (neither inside `.changeset/`, where changesets would read it as a pending
     changeset), or a changeset deleted directly under `.changeset/` (never its
     `README.md`), all regular files: a rename counts as a deletion and an
     addition, and a type or mode change or a path with a character outside
     `A-Z a-z 0-9 . _ / @ -` is refused. Only then does it commit the result
     (every git command of the apply, check, and push steps with
     `core.hooksPath=/dev/null` and `core.fsmonitor=false`, the commit and the
     push with `--no-verify`) as `github-actions[bot]`
     (`chore(release): version packages`) and **force-push** it to the branch
     `changeset-release/main` with its `contents: write` token; the token
     reaches git through a credential helper that reads the environment, never
     the command line.

   Actions never open a pull request here (Bootstrap step 4), so a person opens
   the pull request from `changeset-release/main` into `main`; the job's summary
   names the commit. The branch is regenerated on every run: never commit to it
   by hand (the next run overwrites it); fix a note in its changeset on `main`
   and run the job again. A push made with `GITHUB_TOKEN` starts no workflow, so
   when the job updates the branch of a pull request that is already open, close
   and reopen the pull request to run its checks on the new commit. The code
   `changeset version` loads holds only a read-only token, so the residual risk
   accepted on 2026-10-18 (that code holding `contents: write`) is closed.

3. **Publish.** After the version pull request is merged, start the release
   workflow from `main` with **publish** ticked. The `dry-run` job runs first,
   reports the Wrapper digest, names the release
   (`@intraverse/se-client-wrapper@<version>`, the tag changesets gives the
   Wrapper), and uploads the Wrapper artifact and its `.sha256` (kept 14 days,
   for review). Then:
   - **`build`** refuses a release whose tag exists, then runs
     `tools/release-publish.ts`, which builds from the lockfile without the task
     cache, packs the five libraries, runs the same tarball and consumer checks
     as the dry run, and refuses to go on (`tools/release-readiness.ts`) while a
     changeset is pending, a library is still `private` or at `0.0.0`, the
     Wrapper is at `0.0.0`, or the Wrapper build differs from the dry run's
     digest. That check is the guard the kit relies on against publishing a
     `private` package. A version the registry already has is skipped only when
     the registry's `dist.integrity` equals the local tarball's SHA-512; other
     bytes under the same version fail the job. It writes the publish plan (the
     SHA-256 and file name of each tarball to publish, in dependency order) and
     uploads the five tarballs, kept one day.
   - **`publish`** waits for a required reviewer of `release`. On approval it
     fails unless the npm is 11.5.1 or later, downloads the tarballs, refuses a
     plan line of another shape, checks each planned tarball's SHA-256, and
     publishes **the checked tarballs themselves**
     (`npm publish <tarball> --provenance --access public --ignore-scripts`), in
     the plan's order. It runs no repository tooling: only a checkout of
     `.node-version`, `actions/setup-node`, the download, and npm.
   - **`attest`** attests the dry run's Wrapper digest
     (`actions/attest-build-provenance`, in the `attest` environment). The
     attestation is stored on the repository (GitHub's attestations API) and in
     the public Sigstore transparency log; it is not a release asset. A dry run
     never attests.
   - **`github-release`** downloads the dry run's artifact and its `.sha256`,
     checks both against the attested digest, and creates the tag on the
     dispatched commit and the GitHub release, with the tar and its `.sha256`
     attached and notes that give the digest and the `gh attestation verify`
     command. The release asset is the released Wrapper's durable home
     (ADR-005).
4. Record in the release notes the contracts the release was built against: the
   Play API prefix, the Snapshot schema id, and the signing vector set (edit the
   GitHub release; its notes already give the Wrapper artifact's digest).
5. **Deploy.** Merging the version pull request (step 2) deploys `main` to the
   staging Pages projects, as every push does, and is the decided trigger of the
   production deploy (the human, 2026-10-27; ADR-008), which is not built yet
   (#133; [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages),
   Production).

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
   is not a security boundary (Release, step 3: no job that holds a credential
   runs repository tooling).
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
   (ADR-005, decision 4; the release notes give the same command):

   ```sh
   gh attestation verify se-client-wrapper-<version>.tar \
     --repo IntraverseGame/se-client-kit \
     --signer-workflow IntraverseGame/se-client-kit/.github/workflows/release.yml \
     --source-ref refs/heads/main \
     --source-digest <the release's commit> \
     --deny-self-hosted-runners
   ```

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
every push to it, to three staging Pages projects (Direct Upload, production
branch `main`), each on its own hostname. Staging only; production is to come.

- `se-wrapper-stage`: the Wrapper at `/`, with its copy of the verify page at
  `/verify/`;
- `se-verifier-stage`: the verify page (the artifact's `verify/` directory plus
  a root copy of its page). Its base is `<verifier origin>/verify` (the
  configuration's `verifyBaseUrl`), and a round's page is that base plus
  `/rounds/{roundId}`: `https://<verifier host>/verify/rounds/{roundId}`, the
  URL the Wrapper's verify link opens. A link from elsewhere to a round uses the
  same base and suffix;
- `se-games-stage`: the reference game, at the root of
  `https://se-games-stage.pages.dev` (no custom domain; this origin is public),
  where the Wrapper frames it (`<game origin>/?parentOrigin=...`). The backend's
  catalog names this origin for `coin-flip-v1`, `cash-or-crash-v1`, and
  `book-slot-v1`. Coin Flip and Cash or Crash play; **a `book-slot-v1` launch is
  not playable yet** (the Wrapper refuses book rounds in the first release,
  W-26, and the reference game plays `steps` only; a separate issue covers it).

The Wrapper's and the verifier's sites carry the same-origin API proxy
(`apps/pages-proxy`) as their `_worker.js`, their own `environment-config.json`,
and a `_routes.json` that sends only their API paths to the proxy (`/play/v1/*`
and `/verify/v1/*` on the Wrapper's, `/verify/v1/*` on the verifier's)
([specs/client-kit.md](../specs/client-kit.md#the-pages-api-proxy)). The game's
site is static: the game's build and nothing else
([The game's site](../specs/client-kit.md#the-games-site)). Every site has its
`_headers`; the game's `frame-ancestors` is the Wrapper's origin and the
operator origins (every ancestor of the game), from the Wrapper's configuration
document. It cannot stop a listed operator from framing the game directly; the
game's own parent check and the Wrapper's bridge keep such a frame from playing.

Three jobs:

- `build`: the release dry run (the Wrapper artifact built twice, one digest
  required), the reference game's artifact, `se-client-reference-game.tar`, from
  the dry run's two kept builds (one digest required), and the proxy worker
  (`tsc`), with a read-only token and no secret.
- `config-stage`: the two sites' configuration documents, built from the
  `pages-stage` configuration secrets and validated with the Wrapper's own
  validator (`apps/wrapper/pages-config-cli.ts`). It references only those
  secrets, never the token, but it runs in the same environment: an accepted
  risk for staging only (ADR-008, Risks accepted).
- `deploy-stage`: checks every download against its digest, lays out the three
  sites, writes the Wrapper's and the verifier's `_routes.json` and every site's
  `_headers` (the CSP lists and the Wrapper's origin read from the configuration
  documents), and runs `wrangler pages deploy --no-bundle --branch main` (pinned
  by the lockfile) once per project. It runs no repository script.

**Every push to `main` deploys staging.** There is no switch: no repository
variable gates a job (the human, 2026-10-27), and every job runs only from
`main`. The setup below must therefore be complete before a push reaches `main`;
a run that names an environment that does not exist creates it unprotected. To
stop deploying (to hold a rollback, or while something is fixed), disable the
workflow (below).

**Setup, once, by the infrastructure owner** (names only here; the values never
enter this repository, an issue, or a log):

1. In Cloudflare: the three projects, the Wrapper's and the verifier's custom
   hostnames in the shared zone (`se-games-stage` has none: it is served at its
   `pages.dev` origin), and an API token with Pages edit on that account and
   nothing else. Done by the infrastructure owner (`se-games-stage` created
   2026-10-27).
2. In the Wrapper's and the verifier's Pages projects, two plain production
   environment variables (`se-games-stage` needs none: it has no proxy), set by
   the infrastructure owner in their code (below). They take effect only on a
   deployment made after they are set, so they were set before the first deploy,
   and a change needs a redeploy (below).
   - **`SE_API_UPSTREAM_ORIGIN`**: the API's origin only (`https://host`, no
     path, no trailing slash). Without it, every API call through the proxy
     answers a bare 502. Done by the infrastructure owner (2026-10-27).
   - **`SE_API_PATH_PREFIXES`**: the site's API prefixes, whitespace-separated:
     `/play/v1/ /verify/v1/` on `se-wrapper-stage`, `/verify/v1/` on
     `se-verifier-stage`. Without it, every API call answers a bare 502. Done by
     the infrastructure owner (2026-10-27).
   - The project's **compatibility date** must be on or after 2024-11-11 (the
     proxy's `fetch` asks for `cache: "no-store"`, which older dates refuse;
     every API call would then answer a bare 502). Confirmed by the
     infrastructure owner (2026-10-27).
3. In GitHub, the environment **`pages-stage`**, deployment branches restricted
   to `main`. Done by the infrastructure owner.
4. Its secrets (no variables; every value is read with `secrets.`):
   - **`CLOUDFLARE_API_TOKEN`**: the token. Set.
   - **`CLOUDFLARE_ACCOUNT_ID`**: the account. Set.
   - **`PAGES_RPC_ORIGINS`**, **`PAGES_GAME_ORIGINS`**,
     **`PAGES_OPERATOR_ORIGINS`**: whitespace-separated lists of bare `https`
     origins (no path, no trailing slash), feeding both the configuration
     documents and the CSP's `connect-src`, `frame-src`, and `frame-ancestors`.
     `PAGES_GAME_ORIGINS` holds `https://se-games-stage.pages.dev`, the staging
     game origin (the infrastructure owner, 2026-10-27). Set (the infrastructure
     owner, 2026-10-27), today to placeholders: the configuration's
     disjoint-origins rule (W-49) refuses an origin that is both a game origin
     and an operator origin, so `PAGES_OPERATOR_ORIGINS` holds a placeholder
     distinct from the others.
   - **`PAGES_WRAPPER_ORIGIN`**, **`PAGES_VERIFIER_ORIGIN`**: the two sites'
     origins (`https://host`). Set.
   - **`PAGES_CHAIN_PINS`**: JSON with exactly `environment`, `runtimeSigner`,
     `registryDomain`, `entropyChainId`, `minRpcQuorum`, and `tipLagMargin`
     ([wrapper.md](../specs/wrapper.md#configuration)). Set. Staging is
     `environment: "preview"` with `minRpcQuorum` 1 while it reads one RPC
     provider (ADR-008, decision 8). Its one entropy source keeps the key
     `anvil` with `entropyChainId` 50312, Somnia's public testnet, and
     `tipLagMargin` 100 blocks (the backend's value, 2026-10-28;
     [W-26b](../specs/wrapper/signing-start-move-cash-out-and-cancel.md));
     `registryDomain` stays at chain id 31337 by design (the registry is not on
     the entropy chain), so do not change it to 50312. Production must be
     `"production"` with `minRpcQuorum` of at least 2; its `tipLagMargin` comes
     from the backend's measurement of the RPC lag (#133).
   - **`PAGES_RPC_ENDPOINTS`**: JSON of `rpcEndpoints`,
     `{"<source>":[{"provider":"…","url":"…"}]}`, keyed by the same entropy
     source as the pins' `entropyChainId` and `tipLagMargin`;
     `PAGES_RPC_ORIGINS` must list exactly the origins of its URLs. Set.

**The three Pages projects are managed as code by the infrastructure owner**
(since 2026-10-28): their environment variables, bindings, and compatibility
date. Nothing changed for the kit's deploys. Ask the infrastructure owner for
any change to a project setting; never make it in the Cloudflare dashboard,
because their next apply removes a setting added outside their code. A setting
reaches a site only with its next deployment, so after such a change, when the
infrastructure owner asks, redeploy `main` (**Redeploy**, below) or push to
`main`.

No repository variable is needed. A run with the token or the account id missing
fails in its first deploy step, naming what is missing. A configuration value
that is missing or makes an invalid document fails the config job, naming the
input or the field and the issue, never a value.

**Staging's entropy chain is Somnia's public testnet** (chain id 50312; the
backend, 2026-10-28; [wrapper.md](../specs/wrapper.md#configuration)).
`PAGES_RPC_ENDPOINTS` names one endpoint, Somnia's public testnet RPC, under the
source key `anvil`, and `PAGES_RPC_ORIGINS` its origin; the browser reads it
directly (it sends CORS for any origin; nothing is added on the backend's edge).
With `minRpcQuorum` 1, which `environment: preview` allows, the Wrapper's tip
check passes with that one endpoint and shows its non-dismissable "chain check
not independent (development)" indicator (W-26a), so staging rounds play past
the start. Book rounds bind further ahead there (about 3 s), so a book draw
takes about 3 s longer on staging; that is expected (the backend, 2026-10-28;
[W-26b](../specs/wrapper/signing-start-move-cash-out-and-cancel.md)). No
record-chain RPC is needed in the browser before INC1 anchoring. The URL is the
infrastructure owner's value, never written in this repository. Production's RPC
providers (two independent per entropy source), their CORS behavior, and their
`connect-src` entries are #133's, shared out of band.

**Switching staging's entropy chain** (as for the move from anvil to Somnia's
public testnet, 2026-10-28). The engine and the Wrapper must pin the same chain,
so the secrets change right after the backend's switch, not before:

1. The infrastructure owner sends the values: the RPC endpoint and its origin,
   and the chain pins (`entropyChainId` and `tipLagMargin` per source, with any
   other pin that changes). They are shared out of band, never in an issue, a
   pull request, or a log.
2. Right after the backend's switch, a maintainer sets the three `pages-stage`
   secrets: `PAGES_RPC_ENDPOINTS`, `PAGES_RPC_ORIGINS`, and `PAGES_CHAIN_PINS`.
3. Dispatch the Pages workflow on `main` (**Redeploy**, below). Until that
   redeploy the deployed configuration still pins the old chain, so every
   staging round is refused at check 3 (`cross-field`: the round's
   `entropyChainId` is not the pinned one) and shows "this round failed
   verification"; `T_0` is not settled, so nothing is signed (W-26). In the same
   window the verify page's check 6 reads the old pins for new rounds.
4. Verify the deployed `<site>/environment-config.json` on the Wrapper's and the
   verifier's sites: `entropyChainId`, `tipLagMargin`, `minRpcQuorum`,
   `environment`, and `registryDomain` are the values sent, and `rpcEndpoints`
   names the one endpoint under the expected source key. Then start a round on
   staging: it passes the start, with the degraded indicator shown.

Expected after a switch, not an alarm: a staging round played on the old chain
(anvil, before the switch) cannot be verified on staging's verify page
afterwards, because check 6 then reads the new chain (Somnia's public testnet).

**Production (not built yet, #133).** A production deploy runs when the
changesets version pull request is merged into `main` (the versions bumped and
the changelogs written; [Release](#release), step 2): that release is then
deployed to the production projects too (the human, 2026-10-27; ADR-008). It is
a second deploy environment (`pages-prod`, with the same names inside), a
configuration environment with no deploy credential, and second config and
deploy jobs with the production project names (ADR-008). Nothing reacts to that
merge today beyond the staging deploy every push gets: the release workflow
pushes the version branch and publishes only by hand, and the merge itself
triggers nothing else.
<!-- TODO(hosting, #133): the production deploy, triggered by the merge of the changesets version pull request into `main`. -->

**After the first deploy** (the real test: zone-wide settings can still answer
with a 403 or a challenge page), checks 1 to 4 on the Wrapper's and the
verifier's sites and check 5 on the game's site:

1. A `/play/v1` call through the proxy on the Wrapper's site, and a `/verify/v1`
   call on each of those two sites, return the API's JSON (an API error in JSON
   is fine), with `Content-Type: application/json`, not an HTML challenge page,
   a 403 from the edge, or the proxy's bare 502 (a missing project variable, an
   old compatibility date, or an unreachable API). For example
   `curl -s -i -X POST <the Wrapper's site>/play/v1/sessions:redeem -H 'Content-Type: application/json' --data '{}'`.
   The answer carries the proxy's `Content-Security-Policy` and
   `X-Content-Type-Options: nosniff`.
2. On the verifier's site, a `/play/v1` path is not forwarded (the site's static
   page or a 405, never the API's JSON).
3. On the Wrapper's and the verifier's sites, `<site>/environment-config.json`
   is that site's document (the game's site has none).
4. The response headers of `/` and `/verify/` on the Wrapper's site, and of `/`
   and `/verify/rounds/<a round id>` on the verifier's: each has exactly one
   `Content-Security-Policy` (the Wrapper's on `/`, the verify page's on
   `/verify/` and everywhere on the verifier's site), plus `Referrer-Policy` and
   `Permissions-Policy`. Two policies mean Pages merged the rules: stop
   deploying (`gh workflow disable pages.yml`) and fix the headers step.
5. On the game's site, `/` answers the game page with one
   `Content-Security-Policy` whose `frame-ancestors` is the Wrapper's origin
   followed by the operator origins (the Wrapper's alone when there are none),
   plus the Wrapper's `Permissions-Policy`, `Referrer-Policy`, and
   `X-Content-Type-Options`. A launch of `coin-flip-v1` through the Wrapper
   loads `<game origin>/?parentOrigin=...` in its frame with a 200 and no
   `frame-ancestors` or `frame-src` violation in the browser console (the frame
   stays hidden until a round is ready, W-31). On staging, a started round
   passes the tip check and shows the game, under the degraded indicator
   (W-26a).

Check them again after any change to `headers.json`, the proxy, the
configuration, the reference game, or the projects' settings.

**Redeploy** `main` without a commit: run the Pages workflow by hand on `main`
(Actions, Pages, Run workflow). Needed after a change to a Pages project
setting.

**Rollback:** in the Cloudflare dashboard, the project's Deployments, choose the
last good production deployment and Rollback; or the Pages API's rollback of a
deployment, with an API token of the infrastructure owner's (not the CI token's
value, which is never copied out of the environment). Roll back each project
that needs it; a rollback serves that deployment's own files, worker, and
configuration at once. The next merge to `main` deploys again, so fix forward
before merging, or hold the rollback by disabling the workflow
(`gh workflow disable pages.yml`, or Actions, Pages, Disable workflow) and
re-enable it (`gh workflow enable pages.yml`) once the fix is merged; a push
while it is disabled deploys nothing, so redeploy `main` by hand after
re-enabling it. Disabling the workflow does not cancel a run that has not
finished (queued, pending in the `pages` concurrency group, waiting, or
running), which would deploy over the rollback: before rolling back, list every
unfinished Pages run
(`gh run list --workflow pages.yml --all --json databaseId,status --jq '.[] | select(.status != "completed") | .databaseId'`;
`--all` because `gh run list` leaves out a disabled workflow's runs without it)
and cancel each (`gh run cancel <id>`). Each deployment records the commit
(`--commit-hash`) it came from, and its run logs every digest.

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

<!-- TODO(release, #154): deferred to #154 (owner: TPO, with an org owner for npm; reason: nothing is published yet). Rehearse once: the npm deprecation and dist-tag steps on the first published version, and a Pages rollback. The npm steps cannot be exercised before the first publish; the dry run covers everything up to the publish. -->

### Rotate the npm credential

The release uses npm trusted publishing (Bootstrap step 6), so there is no
stored npm token to rotate: each publish exchanges the job's short-lived OIDC
token. These steps apply only if a later, recorded decision moves to a stored
token:

1. An org owner creates the replacement credential in npm with the narrowest
   scope (publish for the kit's packages only), and writes it into the `release`
   environment secret. It is never pasted in a chat, an issue, or a log.
2. Run a release of a trivial change to prove the new credential works.
3. Revoke the old credential in npm.
4. Record the date (the secret **name** and date only) with the org owners'
   access notes.

## Verification

- The settings in Bootstrap read back correctly: use the read-only `gh api`
  calls for rulesets, environments, collaborators, and CODEOWNERS errors against
  this repository.
- A test pull request cannot be merged without a code owner's approval and every
  review thread resolved (except by an organization admin's bypass). `ci-ok` is
  not enforced by the ruleset; check it is green before merging.
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

- **A pull request cannot merge: code-owner review missing.** There is one code
  owner; they review. An author cannot approve their own change, so a pull
  request the code owner authors merges through the repository-admin bypass. An
  unresolved review thread blocks the merge too.
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
- **The publish path is skipped.** `build`, `publish`, `attest`, and
  `github-release` run only from `main`, with **publish** ticked, and with the
  variable `RELEASE_PUBLISH_ENABLED` set to `true` (Bootstrap step 8).
- **The `build` job says "The tag ... exists".** That Wrapper version is
  released already; a release is never redone. Release a new version with a
  changeset.
- **The `build` job says "Not ready to publish".** A changeset is pending (merge
  the version pull request first), a library is still `private` or at `0.0.0`
  (Bootstrap step 8), the Wrapper is at `0.0.0`, `--expect-wrapper-digest` is
  missing, or the Wrapper build differs from the dry run's.
- **The `publish` job says npm "cannot publish with trusted publishing".** The
  Node in `.node-version` brings an npm older than 11.5.1. Nothing was
  published. Move `.node-version` to a Node whose npm is 11.5.1 or later in a
  reviewed pull request, then start a new publish run.
- **The `publish` job refuses the plan or a checksum.** A plan line has another
  shape, or a downloaded tarball is not the bytes `build` checked. Nothing after
  it was published. Treat a checksum mismatch as an incident (Escalation) before
  running again.
- **The `attest` job failed after `publish`.** The packages are on npm, and the
  Wrapper is not deployable (a deploy refuses an unattested digest). Re-run the
  failed jobs of the same run (`attest`, then `github-release`); never attest
  from elsewhere.
- **The `publish` job failed after some packages were published.** Do not re-run
  the job: its plan is a fixed output of that run's `build`, and `npm publish`
  refuses a version the registry already has, so a re-run fails on the first
  package that went out. Fix the cause and start a **new** publish run from
  `main`. Its `build` asks the registry again and leaves out every version the
  registry holds with the same bytes (the build is reproducible), so only the
  rest are published; its `publish` needs a `release` reviewer's approval again.
  If `main` has moved and a package's bytes now differ under the same version,
  `build` stops with "The registry disagrees": release a new version with a
  changeset instead.
- **The `attest` or `github-release` job cannot be re-run any more.** The dry
  run's artifact is kept 14 days, and GitHub re-runs a run's jobs only for a
  limited time. Start a new publish run from `main` (the same caveat on a moved
  `main` applies): `build` finds every package on npm with these bytes and plans
  nothing, `publish` publishes nothing (it still needs the approval), `attest`
  attests the same digest again (a second attestation of the same bytes is
  harmless), and `github-release` creates the release from the new dry run's
  artifact. Compare the new run's Wrapper digest with the first run's: they are
  equal when `main` has not moved. If `main` has moved and the Wrapper's bytes
  differ, do not release them under this version: release a new version with a
  changeset (decided by the human, 2026-10-28). This works only while the
  release's tag does not exist (next entry).
- **The `github-release` job failed.** The packages are published and the
  Wrapper attested. With files to attach, `gh release create` makes a draft
  release first and creates the tag only when it publishes the draft after the
  uploads, so a failed upload may leave a **draft release** behind and no tag.
  Before creating one, the job lists every release of the repository, drafts
  included (`gh api --paginate`), and refuses when any has exactly the tag ("A
  release for … exists already"); an API error fails the step instead of
  counting as "no release". So a re-run or a new run never adds a second one. An
  org owner checks the releases page:
  - **a draft, or a release without its files:** finish it by hand from the
    failed run's dry-run artifact (download the tar and its `.sha256`, run
    `sha256sum --check --strict`, compare the digest with the `attest` job's
    subject, then `gh release upload <tag> <tar> <tar>.sha256`, and publish the
    draft, which creates the tag on its target commit), or delete it and start
    again as below;
  - **nothing was created** (for example a tag ruleset that blocks creation on
    the release tag pattern, against Bootstrap step 2: an org owner corrects
    it): re-run the failed job of the same run, or, once the re-run window or
    the artifact has expired, start a new publish run as in the entry above;
  - **a published release or its tag exists but is incomplete or wrong:** a new
    run stops in `build` because the tag exists. Finish it by hand as above, or
    delete the release and its tag (the tag ruleset lets only the org owners
    delete a tag) and start a new publish run.
- **The `build` job says "The registry disagrees".** A version being released is
  already on npm with other bytes. Never overwrite it: bump the version with a
  changeset and release again; if the published bytes are not ours, treat it as
  a security incident (Escalation).
- **"the Wrapper output has no index.html, so it is not a release build"** (or
  `verify/index.html`; `check:size-budget`, the dry run, or the `build` job).
  `apps/wrapper/dist/` exists but is empty or lacks a page (the Wrapper's, or
  the verify page the Wrapper's build copies from `apps/verify/dist/`): a build
  failed halfway or something else wrote there. Run `pnpm build` again (after
  `pnpm clean:cache` if wireit restored a stale output) and check the Wrapper's
  build output; never release such an output.
- **"over its size budget"** (`check:size-budget`, the dry run, or the `build`
  job). The Wrapper's release output, or the verify page under `verify/`, grew
  past a limit. Find what grew (compare `apps/wrapper/dist/` with `main`'s
  build); shrink it, or raise the limit in a reviewed change to
  `tools/size-budget.ts` and the budget list in
  [the testing spec](../specs/client-kit/testing-and-ci.md) together (a test
  keeps them equal), saying why in the pull request. Never raise it to make a
  release pass unexamined.
- **The `version-push` job says "changed more than it should".**
  `changeset version` changed something other than a modified `package.json`, an
  added or modified `CHANGELOG.md`, or a deleted changeset; each
  `Unexpected change:` line names the status and the path. Nothing was pushed.
  Find out what wrote it before running the job again.
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
