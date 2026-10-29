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
   (the `version` job force-pushes `changeset-release/main`, so an approval must
   not outlive the commit it saw); force-pushes and deletion are blocked.
   Decided deliberately: the required approval count is 0 (the code owner's
   approval is the required review), no status check is required (keep `ci-ok`
   green before merging; the ruleset does not enforce it), and organization
   admins and repository admins may bypass the ruleset. GitHub never lets an
   author approve their own pull request, and there is one code owner, so a pull
   request the code owner authors merges only through the repository-admin
   bypass. Also a **tag ruleset** on the release tag pattern
   **`@intraverse/*@*`** (ADR-009; decided by the human, 2026-10-28; until #154
   it covers `@intraverse/se-client-wrapper@*`): it blocks updating and deleting
   those tags for everyone but the org owners, so a released tag never moves and
   a tag reliably marks "released", and it allows creating them, so the release
   workflow's `publish` job (through `changesets/action`) tags each released
   package with the job's own token (Release, step 3). `changesets-mode` and
   `publish` read the tags before releasing, so a run never tries to overwrite
   one. The `version` and `publish` jobs run repository tooling and hold
   `contents: write` (accepted by ADR-009).
   <!-- TODO(org owners, #154): create the tag ruleset above, on `@intraverse/*@*` (ADR-009); needed before the first real publish. -->
3. **Secret scanning and push protection** on (they are). Dependabot alerts and
   security updates on. **Private vulnerability reporting** on, so a reporter
   can open a private advisory from the Security tab
   ([SECURITY.md](../SECURITY.md)).
4. **Actions settings:** read-only default workflow token; first-time and
   outside contributors' workflows need approval (GitHub's "Fork pull request
   workflows" setting). The release workflow's `version` job opens the bump pull
   request with `changesets/action` (ADR-009), so the repository setting "Allow
   GitHub Actions to create and approve pull requests" is turned on; until it
   is, `version` fails when it opens the pull request. The job token can then
   approve a pull request, but a `github-actions[bot]` approval is not a code
   owner's approval, so the `main` ruleset still holds; an org owner confirms
   it.
   <!-- TODO(org owners, #154): turn on "Allow GitHub Actions to create and approve pull requests" (ADR-009) when the workflow implementation lands, and confirm that a `github-actions[bot]` approval cannot satisfy the `main` ruleset's code-owner review. -->
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
   precondition). The workflow's `publish` job publishes through its publish
   command (`tools/release-publish.ts --publish`, run by `changesets/action`)
   with the npm CLI that comes with the pinned Node (decided by the human,
   2026-10-28), which exchanges the OIDC token itself; trusted publishing needs
   npm 11.5.1 or later. The workflow file keeps its name, `release.yml`: a
   rename changes every trusted publisher and ADR-005's `--signer-workflow`.
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
     (the publish command refuses a private package);
   - an org owner sets the repository **variable** (not a secret)
     `RELEASE_PUBLISH_ENABLED` to `true`. Until it is `true`, the workflow's
     `publish` job and every job after it are skipped, and neither the `release`
     nor the `attest` environment, nor the production environments, is named by
     a run. Setting it back to anything else turns publishing off again. Do not
     merge a bump pull request while it is off (Release);
   - before it is set, the production environments `pages-prod` and
     `pages-prod-config` exist, protected
     ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages), Production):
     the first release deploys production in the same run;
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

The kit uses changesets, and the release workflow
(`.github/workflows/release.yml`) runs `changesets/action` on **every push to
`main`**
([ADR-009](../decisions/ADR-009-production-pages-deploy-trigger-and-source.md)).
Every Action is pinned by full commit SHA and on the Actions allow-list
([supply-chain spec](../specs/client-kit/supply-chain.md), Pinned toolchain).
The workflow starts with `permissions: {}` and has **no concurrency group**:
each push's run is independent and checks out its own commit, so a later push
never cancels the bump merge's run. Its jobs:

| Job               | Runs                                                        | Permissions                                                     | Environment | Repository tooling                                            |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `changesets-mode` | every push to `main`                                        | `contents: read`, `pull-requests: read`                         | none        | no (shell, git, gh, jq)                                       |
| `version`         | changesets pending                                          | `contents: write`, `pull-requests: write`                       | none        | yes (`changeset version`, the version-file guard)             |
| `publish`         | a release candidate and `RELEASE_PUBLISH_ENABLED` `true`    | `contents: write`, `id-token: write`                            | `release`   | yes (`pnpm check`, the dry run, the publish command)          |
| `wrapper-build`   | the Wrapper's release has no tar yet                        | `contents: read`                                                | none        | yes (the dry run)                                             |
| `attest`          | after `wrapper-build`                                       | `contents: read`, `id-token: write`, `attestations: write`      | `attest`    | no (`attest-build-provenance` only)                           |
| `wrapper-assets`  | after `attest`                                              | `contents: write`                                               | none        | no (`gh release upload`)                                      |
| `production`      | after `wrapper-assets` (`.github/workflows/pages-prod.yml`) | at most `contents: read`, `attestations: read`, `actions: read` | its jobs'   | see [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages) |

`changesets-mode` decides, read-only. A changeset is pending when `.changeset/`
holds a `*.md` file other than its `README.md`: then `version` runs. With none
pending, the pushed commit is **the bump merge** when a pull request associated
with it (`GET /repos/{owner}/{repo}/commits/{sha}/pulls`) has head
`changeset-release/main` in this repository (a fork's branch of the same name
never matches), base `main`, was merged, and was merged as this very commit (the
repository squash-merges). For the bump merge, it reads `name` and `version` of
the five libraries and the Wrapper and looks up each `<name>@<version>` tag with
`git ls-remote --tags` on the public URL (no registry, no token; a version
`0.0.0` never counts). The run is a **release candidate** when at least one of
those versions has no tag. Otherwise the run ends there with a "nothing to
release" notice; a release candidate while `RELEASE_PUBLISH_ENABLED` is not
`true` ends with a "publishing was off" notice. Any API or git error fails the
job instead.

The jobs that run repository tooling use the setup action with `cache: "false"`:
no pnpm store cache, and no wireit task cache, so nothing is restored from a
cache into a release build. Lifecycle scripts stay off throughout
(`allowBuilds`, `--ignore-scripts`, and the tarball check refuses any lifecycle
script in a published manifest).

**Rule** (decided by the human, 2026-10-28): **do not merge a bump pull request
while publishing is off, and re-run a failed release run within 30 days**
(GitHub's re-run limit). Later pushes are never the bump merge, so they never
publish it; the recovery is always a manual re-run of the bump merge's run (a
re-run keeps its commit but reads the variables as they are then). After 30
days, a library version already on npm stays published but never gets its tag or
GitHub release, and a version not yet published is skipped; the next bump moves
past both.

1. A pull request that changes a published package or the Wrapper includes a
   changeset (`pnpm changeset`) naming the packages and the bump (major for a
   break, minor for an addition, patch for a fix) and a note for the release. A
   change to a contract's version (a new Play prefix, a new Snapshot schema) is
   a **major**. Before 1.0, a breaking change is a **minor** bump (decided by
   the human, 2026-10-28). Its CI runs `release-dry-run` (below), so a changeset
   that would break a tarball fails before merge.
2. **The bump pull request.** On every push to `main` with changesets pending,
   `version` runs the action in version mode: its version script
   (`tools/release-version.sh`) runs `changeset version` (versions and
   changelogs, from `@changesets/changelog-github`, which calls the GitHub API
   with the job token the action passes it) and then the **version-file guard**
   (`tools/release-version-guard.sh`), which refuses anything but a modified
   `package.json`, an added or modified `CHANGELOG.md` (neither inside
   `.changeset/` nor under `.github/`), or a changeset deleted directly under
   `.changeset/` (never its `README.md`), all regular files: a rename counts as
   a deletion and an addition, and a type or mode change or a path with a
   character outside `A-Z a-z 0-9 . _ / @ -` is refused. The action then commits
   the result to `changeset-release/main` (through the API, signed by GitHub)
   and opens or updates the pull request **"chore: bump versions"**. It runs in
   the same job as the tooling, so the guard is a sanity check, not an isolation
   boundary. The job has no environment and no OIDC token, so the code it runs
   can never publish or attest.

   The bump pull request gets **no CI** (made with the job token, it starts no
   workflow run; accepted by the human): CI runs on `main` after the merge, and
   `publish` runs `pnpm check` again before it publishes. Review it: the
   versions, the changelogs, and that the lock file's contract entries match
   what the notes say. Never commit to the branch by hand (the next push to
   `main` regenerates it); fix a note in its changeset on `main`.

3. **Publish.** Merge the bump pull request (squash). Its push is the bump
   merge; when a version is untagged, the run is a release candidate and
   `publish` waits for a required reviewer of `release`. On approval:
   - it checks again, with `git ls-remote --tags`, that a version is still
     untagged (the job may have waited); if every one is tagged by now, it ends
     with an "already released" notice and runs nothing else;
   - it runs `pnpm check`, requires npm 11.5.1 or later (the first npm with
     trusted publishing), and runs the release dry run (the Wrapper built twice
     with one digest);
   - it runs the action in publish mode with the publish command
     `tools/release-publish.ts --publish`, which builds from the lockfile
     without the task cache, packs the five libraries, runs the same tarball and
     consumer checks as the dry run, and refuses to go on
     (`tools/release-readiness.ts`) while a changeset is pending, a library is
     still `private` or at `0.0.0`, the Wrapper is at `0.0.0`, or the Wrapper
     build differs from the dry run's digest. A version the registry already has
     is skipped only when the registry's `dist.integrity` equals the local
     tarball's SHA-512; other bytes under the same version fail. It publishes
     **the checked tarballs** with the npm CLI of the pinned Node
     (`npm publish <tarball> --provenance --access public --ignore-scripts`, npm
     trusted publishing: no npm token anywhere), in dependency order, then runs
     `changeset git-tag`, which tags every package whose version has no tag yet:
     the published libraries, the Wrapper (private: never on npm, its tag is
     what marks it released), and a library a failed run published without its
     tag. The action pushes those tags on the merge commit; it creates no GitHub
     release (`create-github-releases: false`). Packages that are never released
     (`e2e`, `reference-game`, `verify`, `pages-proxy`) are in the changesets
     `ignore` list, so nothing tags them.
   - The job's last step, **"Create the GitHub releases"**, then requires every
     tag the action reported to exist on the merge commit (an annotated tag is
     peeled to its commit); a missing or misplaced tag fails the job before any
     release is made. Only then does it create **a GitHub release per tag** on
     that commit
     (`gh release create <tag> --verify-tag --target <commit> --title <tag>`, so
     it never creates a tag), with the package's `CHANGELOG.md` section for the
     version as notes, as the action would have written them, and a prerelease
     for a prerelease version. A release that exists is skipped, so "Re-run
     failed jobs" on the run finishes a partial release. The workflow does this
     itself because the action, when a tag push fails, only warns and then
     creates the release anyway, which makes GitHub create the tag at the
     default branch's head instead of the merge commit (decided by the human,
     2026-10-28).
   - When the Wrapper's release has no tar yet, **`wrapper-build`** builds its
     artifact twice at the same commit (one digest required, and its name must
     be the released version) and uploads the tar and its `.sha256` (kept 14
     days); **`attest`** attests that name and digest
     (`actions/attest-build-provenance`, in the `attest` environment; stored on
     the repository and in the public Sigstore transparency log); and
     **`wrapper-assets`** downloads both files, checks them against the attested
     digest, requires exactly one release for the tag with neither file attached
     yet (it lists every release with `gh api --paginate` and compares each
     `tag_name` exactly), attaches them (`gh release upload`), and then appends
     to the release's notes, after the version's CHANGELOG section that the
     releases step wrote, the artifact's name and digest and the
     `gh attestation verify` command of
     [Verify before and after](#verify-before-and-after) for the release's
     commit (`gh release edit --notes-file`; the release is read and edited by
     its exact tag). The release asset is the released Wrapper's durable home
     (ADR-005). These jobs run while the Wrapper's release has no tar attached,
     so "Re-run failed jobs" on a run that failed after the tags still attests
     and attaches the Wrapper, and a duplicate of a complete release does not.
   - **`production`** then deploys that release
     ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages), Production).

   **Published but not tagged.** If the run fails after `npm publish` and before
   the tags, re-run the bump merge's run by hand within 30 days: it is still a
   release candidate, the reviewers approve again, the versions already on npm
   with the same bytes are skipped, and `changeset git-tag` tags them. **Tagged
   but without its releases.** If the run fails after every tag exists (in the
   releases step), use **"Re-run failed jobs"** on the bump merge's run, within
   GitHub's 30 days, never "Re-run all jobs": a full re-run runs
   `changesets-mode` again, which finds every publishable version tagged and
   ends with "nothing to release", so `publish` and its releases step never run,
   while "Re-run failed jobs" keeps `changesets-mode`'s earlier
   `release-candidate=true`. With every version tagged, `publish` then publishes
   nothing, and the releases step checks the tags again, creates the missing
   releases, and starts the Wrapper's jobs if its release has no tar yet. A tag
   the action failed to push leaves its version untagged, so either kind of
   re-run works there, as for "Published but not tagged": the re-run's
   `changeset git-tag` and the action push it on the merge commit.

4. Record in the release notes the contracts the release was built against: the
   Play API prefix, the Snapshot schema id, and the signing vector set (edit the
   GitHub release; its notes already give the Wrapper artifact's digest).
5. **Deploy.** Every push to `main` deploys `main` to the staging Pages
   projects; a release deploys production in the same run (step 3).

### Dry run

`pnpm release:dry-run` (locally), the `release-dry-run` CI job, and the release
workflow's `publish` and `wrapper-build` jobs run `tools/release-dry-run.ts`. It
needs no credential and no network, and publishes nothing:

1. It copies the working tree (the files git would commit, so uncommitted
   changes are included locally; in CI it is the commit) into two scratch
   directories, and installs each from the lockfile offline with lifecycle
   scripts off. Its commands get an environment without token-like variables,
   with pnpm's install-before-run off and an empty npm user configuration (no
   `~/.npmrc` is read). That keeps them from using a credential by accident; it
   is not a security boundary. Since ADR-009, the release workflow's `publish`
   job runs `pnpm check`, the dry run, and `tools/release-publish.ts` while it
   holds `id-token: write` (and `contents: write`): a residual risk ADR-009
   accepted, kept small by the `release` environment's reviewers, two jobs that
   never hold both the pull-request write and the OIDC token, lifecycle scripts
   off, and the lockfile pins (Release).
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
   (ADR-005, decision 4; the Wrapper release's notes give the same command, and
   the production deploy's `prod-verify` runs it):

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
5. **Promotion** is a push from this repository: a merge to `main` deploys
   `main`'s Wrapper artifact to the staging Cloudflare Pages projects, and a
   release deploys its attested tar to production in the same run (see
   [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)); each deploy job
   logs the digest it deployed. After it, play one round in that environment
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
   window the verify page's check 6 reads the old pins for new rounds. The
   Wrapper reads its configuration once, at boot, so a session opened before the
   redeploy keeps the old pins and keeps refusing until it is relaunched.
4. Verify the deployed `<site>/environment-config.json` on the Wrapper's and the
   verifier's sites: `entropyChainId`, `tipLagMargin`, `minRpcQuorum`,
   `environment`, and `registryDomain` are the values sent, and `rpcEndpoints`
   names the one endpoint under the expected source key. Then open a new Wrapper
   session from a fresh launch (a new launch code: codes are single-use), never
   a tab opened before the redeploy, and start a round: it passes the start,
   with the degraded indicator shown.

Expected after a switch, not an alarm: a staging round played on the old chain
(anvil, before the switch) cannot be verified on staging's verify page
afterwards, because check 6 then reads the new chain (Somnia's public testnet).

**Production** (`.github/workflows/pages-prod.yml`;
[ADR-009](../decisions/ADR-009-production-pages-deploy-trigger-and-source.md),
decision 3). A release deploys production in the same run: the release
workflow's `production` job calls `pages-prod.yml` with the Wrapper's new tag
after `wrapper-assets` (a tag or a release made with the job token starts no
other workflow). Production serves the Wrapper's and the verifier's sites, each
with the proxy worker and its configuration document, as on staging; it serves
no reference game, and frames the real game origins. Its jobs:

| Job             | Permissions                            | Environment         | What it does                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-check` | `actions: read`                        | none                | checks the tag's shape, refuses a dispatch while a release run is not completed, and resolves the tag's commit (`git ls-remote`; when the release calls it, the release's own commit)                                                                         |
| `prod-verify`   | `contents: read`, `attestations: read` | none                | downloads the tar and its `.sha256` from the Wrapper's release by tag, checks that the `.sha256` names the tar and matches it, and runs `gh attestation verify` ([Verify before and after](#verify-before-and-after)) with `--source-digest` the tag's commit |
| `prod-worker`   | `contents: read`                       | none                | after `prod-verify` (the attestation proves the commit before its code runs), builds the proxy worker with `tsc` at the tag's commit, with staging's own script (not attested)                                                                                |
| `config-prod`   | `contents: read`                       | `pages-prod-config` | after `prod-verify`, builds and validates the two configuration documents from that environment's secrets (the same seven names as staging's) at the tag's commit; that environment holds no deploy credential                                                |
| `deploy-prod`   | `contents: read`                       | `pages-prod`        | runs no repository code: downloads the tar again by tag, refuses any download whose SHA-256 is not its producing job's digest, lays out the two sites, writes their `_headers` with staging's own script, and runs `wrangler pages deploy`                    |

Only `deploy-prod` is in the concurrency group `pages-prod`
(`cancel-in-progress: false`), so production deploys never overlap and a staging
run never touches them. `pages-prod` has **no required reviewer**: the `release`
approval of `publish` is the human gate, and the deploy refuses any tar whose
attestation does not verify. `pages-prod` holds the secrets
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PAGES_WRAPPER_PROJECT`, and
`PAGES_VERIFIER_PROJECT` (the production project names); `pages-prod-config`
holds `PAGES_WRAPPER_ORIGIN`, `PAGES_VERIFIER_ORIGIN`, `PAGES_CHAIN_PINS`,
`PAGES_RPC_ENDPOINTS`, `PAGES_RPC_ORIGINS`, `PAGES_GAME_ORIGINS`, and
`PAGES_OPERATOR_ORIGINS`. Both are created, protected and restricted to `main`,
before publishing is turned on (Bootstrap step 8). Nothing reaches production
until the publish path is on (#154).

**Redeploy, roll back, or roll forward by tag.** Run the "Pages production"
workflow by hand from `main` with the tag
`@intraverse/se-client-wrapper@<version>` of a released Wrapper: it goes through
the same checks. **The release always wins**: the dispatch refuses while a run
of the release workflow is requested, queued, pending, waiting for its
reviewers, or in progress (even a short "nothing to release" run), so it never
replaces a release's pending deploy; run it again once that run has finished. A
window remains (the check and the deploy are not atomic): if a release run that
started after the check has its pending `deploy-prod` replaced by the
dispatch's, use "re-run failed jobs" on that release run within 30 days, or
redeploy its tag after that. A **Pages rollback** of each production project
([Roll back or deprecate](#roll-back-or-deprecate)) is never blocked by a
release run.
<!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). The production projects and hostnames, the `pages-prod` and configuration environments and their secrets, the operator and game origins, the RPC providers, and `tipLagMargin`; shared out of band, never written in this repository. -->

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
  Rollback), or, for production, redeploy an earlier release by its tag (the
  "Pages production" workflow, which a running release run blocks; a Pages
  rollback is never blocked). Then fix forward here: a changeset, a patch
  release, and a new digest. Nothing in this repository is rolled back; a
  released artifact is never rebuilt in place.
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
- **The publish path is skipped.** `publish` and the jobs after it run only on a
  release candidate (the bump merge, no changeset pending, a version above 0.0.0
  without its tag) and with the variable `RELEASE_PUBLISH_ENABLED` set to `true`
  (Bootstrap step 8). `changesets-mode`'s notice says which: "nothing to
  release" or "publishing was off". For the latter, re-run the bump merge's run
  by hand once the variable is `true`, within 30 days (Release).
- **The `publish` job says "Already released".** Every publishable version was
  tagged by the time the job ran (a re-run after a release, or a duplicate):
  nothing ran, nothing to do.
- **The `publish` job's releases step says "The tag ... does not exist" or "is
  on ..., not on this run's commit".** No GitHub release was created. A missing
  tag means the action's tag push failed (it only warns): re-run the bump
  merge's run within 30 days, and `changeset git-tag` and the action push it on
  the merge commit. A tag on another commit was made by something else (the tag
  ruleset lets only the org owners move or delete one): treat it as an incident
  (Escalation) before an org owner deletes it and the run is re-run.
- **The `publish` job says "Not ready to publish".** A changeset is pending, a
  library is still `private` or at `0.0.0` (Bootstrap step 8), the Wrapper is at
  `0.0.0`, or the Wrapper build differs from the dry run's. Nothing was
  published. Fix the cause on `main`, then re-run the bump merge's run within 30
  days (a fix on `main` changes nothing for that run's commit: a cause in the
  commit itself needs a new changeset and a new bump).
- **The `publish` job says npm "cannot publish with trusted publishing".** The
  Node in `.node-version` brings an npm older than 11.5.1. Nothing was
  published. Move `.node-version` to a Node whose npm is 11.5.1 or later in a
  reviewed pull request, then release a new version with a changeset.
- **The `publish` job failed after some packages were published, or before the
  tags.** Re-run the bump merge's run by hand within 30 days. It is still a
  release candidate (a version is untagged), the reviewers approve again, the
  publish command skips every version the registry holds with the same bytes,
  publishes the rest, and `changeset git-tag` tags them all. After 30 days, a
  library version already on npm stays published but never gets its tag or
  GitHub release; the next bump moves past it.
- **The `publish` job says "The registry disagrees".** A version being released
  is already on npm with other bytes. Never overwrite it: bump the version with
  a changeset and release again; if the published bytes are not ours, treat it
  as a security incident (Escalation).
- **The `attest` or `wrapper-assets` job failed.** The packages are on npm and
  tagged, and the Wrapper's release has no files, so production is unchanged (a
  deploy refuses a release without an attested tar). Re-run the failed jobs of
  the same run; never attest from elsewhere. Once they cannot be re-run any more
  (14 days for the artifact, 30 for the run), an org owner builds and attaches
  nothing by hand: release a new version with a changeset.
- **The wrapper-assets job failed** with "Expected one release" or "already has
  the Wrapper's files". It lists every release of the repository, drafts
  included (`gh api --paginate`), and requires exactly one with the tag and
  neither file attached; an API error fails the step instead. A missing release
  cannot follow a successful `publish` job (its releases step creates every
  release after checking the tags); if one is missing anyway, use "Re-run failed
  jobs" on the bump merge's run within 30 days (its releases step creates it). A
  full re-run ("Re-run all jobs") runs `changesets-mode` again, which finds
  every version tagged and ends with "nothing to release", so `publish` never
  runs; "Re-run failed jobs" keeps its earlier `release-candidate=true`. An org
  owner deletes a partial upload from the release (`gh release delete-asset`);
  then re-run the failed jobs. If only the last step ("Add the verify command to
  the release notes") failed, the files are attached, so a re-run stops at
  "already has the Wrapper's files": an org owner appends the command of
  [Verify before and after](#verify-before-and-after), with the release's
  commit, to the notes by hand (`gh release edit <tag> --notes-file <file>`,
  keeping the changelog text).
- **The `production` jobs failed.** Nothing was deployed, or the deploy failed
  part-way. Re-run the failed jobs of the same run, or redeploy the release by
  its tag ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)). A
  `prod-verify` failure (the `.sha256` or the attestation) is an incident
  (Escalation): never deploy around it.
- **A redeploy by tag says "A release run is ...".** The release always wins:
  wait for that run to finish, then dispatch again. To restore production at
  once, use a Pages rollback, which is never blocked.
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
- **The `version` job says "changed more than it should".** `changeset version`
  changed something other than a modified `package.json`, an added or modified
  `CHANGELOG.md`, or a deleted changeset; each `Unexpected change:` line names
  the status and the path. Nothing was pushed. Find out what wrote it before the
  next push to `main`.
- **The `version` job cannot open the pull request.** The setting "Allow GitHub
  Actions to create and approve pull requests" is off (Bootstrap step 4).
- **The bump pull request has no checks.** Expected: it is made with the job
  token, which starts no workflow (ADR-009). CI runs on `main` after the merge,
  and `publish` runs `pnpm check` before it publishes.
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
