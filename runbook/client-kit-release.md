# Releasing and publishing the client kit

## When to use

Procedures for this repository, `se-client-kit`
([specs/client-kit.md](../specs/client-kit.md),
[ADR-001](../decisions/ADR-001-toolchain-and-signing.md)): scaffolding the
toolchain, syncing a contract and setting up its drift job, releasing the
packages and the Wrapper bundle, checking a release, deploying `main` to
Cloudflare Pages, and rolling back or deprecating one. They hold **procedures
only**: this repository is public, so no credential, token, hostname, or account
identifier appears here, and none may be added. Where a value is needed, this
runbook says which secret or setting holds it, by name.

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
   **`@intraverse/*@*`** (ADR-009; decided by the human, 2026-10-28): it blocks
   updating and deleting those tags for everyone but the org owners, so a
   released tag never moves and a tag reliably marks "released", and it allows
   creating them, so the release workflow's `publish` job (through
   `changesets/action`) tags each released package with the job's own token
   (Release, step 3). `changesets-mode` and `publish` read the tags before
   releasing, so a run never tries to overwrite one. The `version` and `publish`
   jobs run repository tooling and hold `contents: write` (accepted by ADR-009).
   Keep **immutable releases** off (off as of 2026-11-17;
   `gh api 'repos/{owner}/{repo}/immutable-releases'` reads it): `publish`
   creates each release published, and `wrapper-assets` attaches the Wrapper's
   tar afterwards with `gh release upload`, which an immutable release refuses.
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
   <!-- TODO(org owners, #154): confirm that a `github-actions[bot]` approval cannot satisfy the `main` ruleset's code-owner review. -->
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
   decision 2). The environment `attest` exists: there is no secret and no
   required reviewer, and deployments are restricted to `main`. The workflow's
   `attest` job runs in it, so its OIDC token names `attest`, never `release`.
   Before step 8, an org owner confirms that every npm trusted publisher of the
   kit (step 6), and any other consumer that trusts this repository's OIDC
   tokens, requires the environment `release`; otherwise the `attest` job's
   token could publish. The check is repeated whenever a trusted publisher or
   another OIDC consumer is added. Like `release`, `attest` must exist before
   step 8: GitHub creates an environment that a running job names, and that does
   not exist yet, without any protection.
   <!-- TODO(org owners, #154): confirm the precondition. -->
8. **Turn the publish path on**, only after steps 5 to 7 and the trusted
   publishers exist:
   - the five libraries' `package.json` have no `"private": true` and their
     READMEs no "not published to npm yet" line (done in a reviewed pull
     request). The publish command still refuses a private package, but the
     variable below, not `private`, is the switch;
   - an org owner sets the repository **variable** (not a secret)
     `RELEASE_PUBLISH_ENABLED` to `true`. Until it is `true`, the workflow's
     `publish` job and every job after it are skipped, and neither the `release`
     nor the `attest` environment, nor the production environments, is named by
     a run. Setting it back to anything else turns publishing off again. Do not
     merge a bump pull request while it is off (Release);
   - before it is set, the production environments `pages-prod` and
     `pages-prod-config` exist, protected, and hold their secrets, set under
     #133 ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages),
     Production): the first release deploys production in the same run. A
     missing or refused value in either environment fails the release's
     `prod-check` job before anything is published (Release); an unset
     `PAGES_OPERATOR_ORIGINS` still deploys with no page allowed to embed the
     Wrapper, and a deploy token that is set but expired or lacks the Pages
     permission still fails the deploy after npm has published;
   - `pages-prod-config`'s chain values are production's first document, which
     waits for RFC-007's slice 1, both production browser providers passing P-1
     to P-6, and staging's canary
     ([Solana entropy sources](#solana-entropy-sources), Production's first
     document); the variable waits for them too;
   - after the first real publish, the one-time rehearsal in
     [Roll back or deprecate](#roll-back-or-deprecate) (#208).
   <!-- TODO(org owners, #154): RELEASE_PUBLISH_ENABLED, once steps 5 to 7 are done, the trusted publishers exist, and the production environments hold their secrets (#133). -->

### Sync a contract into the kit

Run by a person with access, whenever a contract the kit pins changed at its
source (the `contracts-drift` job says so, or the backend asks):

A sync touches **one package**, `contracts` (`packages/contracts/`).

1. Fetch the source repositories (`git fetch`) so the refs you name are current.
   The working trees do not matter: the sync reads committed files.
2. Write a sources file **outside this repository** (it holds paths on your
   machine). One entry per group: `play-api-document`, `verify-api-document`,
   `snapshot-schema`, `snapshot-vectors-valid`, `snapshot-vectors-invalid`,
   `snapshot-vectors-signature`, `snapshot-vectors-typed-data`,
   `snapshot-vectors-signed-action`, `signing-vectors`, `kernel-vectors-seed`,
   `kernel-vectors-shuffle-draw`, `kernel-vectors-steps-derive`,
   `kernel-vectors-derive`, `kernel-vectors-round-secret-hash`,
   `kernel-vectors-coin-flip-payout`, `kernel-vectors-weighted-draw`,
   `kernel-vectors-book-draw`, `kernel-vectors-book-table-commitment`,
   `key-delegation-notices`, `key-delegation-vectors`
   (`tools/contracts-groups.ts` is the list). Each has `name` (the repository,
   recorded in the lock), `repo` (your local checkout), `ref` (for example the
   default branch on `origin`) and `path` (the file or directory in that
   repository). The lock records only public names, so the paths are not in this
   repository: the source's own documentation names them, or ask its owners.
   Keep your sources file for the next sync. Copy only the Play and verify
   OpenAPI documents, the Snapshot schema and vectors, the signing vectors, the
   fairness kernel's public sets (`kernel/public/v1/*`), and
   `key-delegation/v1`'s notices and vectors; never another surface's document.
   The notices keep every entry too, matched by id: the script refuses a notices
   file that removes or renames an entry, changes an entry's text or hash, moves
   a status back, holds an unknown status, or repeats an `id` or a hash, and no
   flag lifts that; a new entry may appear anywhere, and the order does not
   matter. **A notice that turns `approved`** (after the backend's legal review)
   reaches players only with a kit release that syncs it: production offers the
   wallet delegation from that release's deploy on, where `PAGES_SIGNER_ORIGIN`
   is set
   ([Turning on the wallet delegation](#turning-on-the-wallet-delegation)).
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

Before the first production release (decided by the human, 2026-11-17): the
contracts were synced from the backend's `main` ahead of the release; sync them
again, the same way, from the backend's release commit before cutover, so the
lock names what production serves.

### Set up the contracts drift job

Once, by an org owner, when the backend has handed over the locations of its
published contracts (#138). The job is specified in
[The contracts drift job](../specs/client-kit/the-contracts-drift-job.md).

1. Create the GitHub environment **`contracts-drift`**: deployments restricted
   to `main`, no required reviewer (it deploys nothing). Create it before the
   workflow first runs: GitHub creates an environment that a running job names,
   and that does not exist yet, without any protection.
2. Set its two secrets, each the public origin of an environment's API
   (`https://`, the host, and an optional port; no path and no trailing `/`,
   which the job refuses): `CONTRACTS_ORIGIN_STAGING` and
   `CONTRACTS_ORIGIN_PRODUCTION`. They are not credentials; they are secrets so
   that no hostname is written in this repository or shown in a public run log.
   The backend maintainers give the origins out of band; never write them in a
   file, an issue, or a pull request. Leave production's unset until production
   serves the files: the job skips an unset origin with a notice.
   <!-- TODO(contracts, #138): the two origins, from the backend maintainers, and the date production serves the files. -->
3. Run the workflow once by hand (Actions, `contracts-drift`, Run workflow, on
   `main`) and read its summary: every backend entry in sync, or each finding
   explained (below). From then on it runs once a day.

The job holds `contents: read` only and no credential. To turn it off, disable
the workflow in the Actions tab; deleting a secret only skips that environment.

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

| Job               | Runs                                                                         | Permissions                                                     | Environment                                                         | Repository tooling                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `changesets-mode` | every push to `main`                                                         | `contents: read`, `pull-requests: read`                         | none                                                                | no (shell, git, gh, jq)                                                                                                                                      |
| `version`         | changesets pending                                                           | `contents: write`, `pull-requests: write`                       | none                                                                | yes (`changeset version`, the version-file guard)                                                                                                            |
| `prod-check`      | as `publish` (`.github/workflows/pages-prod-check.yml`)                      | `contents: read` (`deploy-check`: none)                         | `pages-prod-config` (`config-check`), `pages-prod` (`deploy-check`) | `config-check` yes (the shell and Wrapper builds, the configuration builder in production mode, the deploy's headers script); `deploy-check` no (shell only) |
| `publish`         | a release candidate and `RELEASE_PUBLISH_ENABLED` `true`, after `prod-check` | `contents: write`, `id-token: write`                            | `release`                                                           | yes (`pnpm check`, the dry run, the publish command)                                                                                                         |
| `wrapper-build`   | the Wrapper's release has no tar yet                                         | `contents: read`                                                | none                                                                | yes (the dry run)                                                                                                                                            |
| `attest`          | after `wrapper-build`                                                        | `contents: read`, `id-token: write`, `attestations: write`      | `attest`                                                            | no (`attest-build-provenance` only)                                                                                                                          |
| `wrapper-assets`  | after `attest`                                                               | `contents: write`                                               | none                                                                | no (`gh release upload`)                                                                                                                                     |
| `production`      | after `wrapper-assets` (`.github/workflows/pages-prod.yml`)                  | at most `contents: read`, `attestations: read`, `actions: read` | its jobs'                                                           | see [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)                                                                                                |

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
   merge; when a version is untagged, the run is a release candidate. First,
   **`prod-check`** checks production's settings
   (`.github/workflows/pages-prod-check.yml`;
   [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages), Production;
   ADR-009, amendment note of 2026-11-17), in two jobs:
   - `config-check`, in `pages-prod-config` (no deploy credential) at the merge
     commit, builds and validates the two production configuration documents
     from that environment's seven secrets in production mode, with the
     production deploy's own `config-prod` steps, then builds the Wrapper and
     runs the deploy's own headers step on the documents;
   - `deploy-check`, in `pages-prod`, with no checkout and no repository code,
     runs the deploy's own "Require the Pages settings" step: the token, the
     account id, and both project names set, the names Pages project names, and
     different.

   Its failure means a production value is missing or would be refused at deploy
   time (`environment` not `production`, a quorum below 2, an origin the headers
   step refuses, a `_headers` line over 2,000 characters, a missing or malformed
   deploy setting, or any of the validator's issues): **nothing was published**,
   `publish` did not start, and no approval was asked. Fix the value (the errors
   name the input or setting, the field or header, and a code, never a value)
   and use "Re-run failed jobs" on the run within 30 days. Neither environment
   has a required reviewer, so this asks for no approval. Only when it passes
   does `publish` wait for a required reviewer of `release`. On approval:
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
   policy, and manifest the Wrapper's build already enforced. The artifact is
   the same for every environment and holds no configuration document (the
   deploys write each site's), so the dry run reads no chain pins and has none
   to keep up to date: an entropy source of either kind changes nothing here.
   Production's pins are checked by the release's `prod-check` (Release, step
   3). Its **digest** is the SHA-256 of that file (`sha256:<hex>`). The two
   digests must be equal, and the two copies' package tarballs byte-identical.
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
   ended" (the code is single use).

### Deploy to Cloudflare Pages

The Pages workflow (`.github/workflows/pages.yml`,
[ADR-008](../decisions/ADR-008-pages-deploy-with-wrangler.md)) deploys `main` on
every push to it, to four staging Pages projects (Direct Upload, production
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
  `book-slot-v1`. Coin Flip and Cash or Crash are `steps` rounds; a
  `book-slot-v1` launch is a book round, which the Wrapper and the reference
  game play in the game's base mode (W-50 to W-56, issue #146): the shell checks
  it under W-52, which replaced W-26's `missing` refusal, and signs nothing for
  it;
- `se-signer-stage`: the wallet signing page
  ([specs/signing-page.md](../specs/signing-page.md)), at the root of its own
  `pages.dev` origin (no custom domain; its origin is a secret's value, never
  written in this repository), laid out from the Wrapper artifact's `signer/`
  directory with a root copy of its page. The Wrapper opens it as a popup when a
  player links a wallet. It is deployed only when `PAGES_SIGNER_ORIGIN` is set,
  and it has no proxy and no API.

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
- `config-stage`: the sites' configuration documents (the Wrapper's, the
  verifier's, and, with `PAGES_SIGNER_ORIGIN` set, the signing page's), built
  from the `pages-stage` configuration secrets with
  `apps/wrapper/pages-config-cli.ts`, the Wrapper's and the verifier's validated
  with the Wrapper's own validator, which also refuses an origin the headers
  step would (Production, below), and the signing page's with the page's own
  (`apps/signing-page/config-check-cli.ts`, run on the written file). Each
  document is uploaded with its digest, the signing page's only when it was
  written. It references only those secrets, never the token, but it runs in the
  same environment: an accepted risk for staging only (ADR-008, Risks accepted).
- `deploy-stage`: checks every download against its digest, lays out the sites
  (the signing page's, only with its document, from the artifact's `signer/`
  with a root copy of its page and its own `environment-config.json`; `signer/`
  then leaves the Wrapper's site), writes the Wrapper's and the verifier's
  `_routes.json` and every site's `_headers` (the CSP lists and the Wrapper's
  origin read from the configuration documents; the signing page's from the
  `/signer/*` rule of `headers.json`; a `Cross-Origin-Opener-Policy` in any rule
  is refused), refuses, right before the upload, a Wrapper or verifier site that
  holds `signer/` and a signing page site with a `_worker.js`, `_routes.json`,
  or `_redirects`, and runs `wrangler pages deploy --no-bundle --branch main`
  (pinned by the lockfile) once per project, the signing page's first. It runs
  no repository script.

**Every push to `main` deploys staging.** There is no switch: no repository
variable gates a job (the human, 2026-10-27), and every job runs only from
`main`. The setup below must therefore be complete before a push reaches `main`;
a run that names an environment that does not exist creates it unprotected. To
stop deploying (to hold a rollback, or while something is fixed), disable the
workflow (below).

**Setup, once, by the infrastructure owner** (names only here; the values never
enter this repository, an issue, or a log):

1. In Cloudflare: the four projects, the Wrapper's and the verifier's custom
   hostnames in the shared zone (`se-games-stage` and `se-signer-stage` have
   none: each is served at its `pages.dev` origin), and an API token with Pages
   edit on that account and nothing else. Done by the infrastructure owner
   (`se-games-stage` created 2026-10-27). `se-signer-stage` needs no environment
   variable (it has no proxy); it must exist before the merge that first deploys
   it ([Turning on the wallet delegation](#turning-on-the-wallet-delegation)).
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
     Set (the infrastructure owner, 2026-10-27). `PAGES_GAME_ORIGINS` holds
     `https://se-games-stage.pages.dev`, the staging game origin (the
     infrastructure owner, 2026-10-27); `PAGES_RPC_ORIGINS` the origin of
     staging's RPC endpoint (below); `PAGES_OPERATOR_ORIGINS` the staging
     operators' origins (2026-10-30). Every entry must be `https` and lowercase:
     the deploy's headers step refuses any other entry (for `PAGES_RPC_ORIGINS`,
     through `PAGES_RPC_ENDPOINTS`, which it must match), so even
     `http://localhost`, which the Wrapper's validator accepts, fails the
     deploy; the validator refuses an uppercase letter too. The configuration's
     disjoint-origins rule (W-49) refuses an operator list that holds the
     Wrapper's or the verifier's origin or a game origin (each site's document
     is checked against its own origin), or a repeated entry; the deploy adds
     the Wrapper's origin to the game's `frame-ancestors` itself.
     `PAGES_OPERATOR_ORIGINS` (here and in `pages-prod-config`) lists only
     origins whose every page the operator fully controls: on a listed origin,
     any page that can hold an `<iframe>` opens the Wrapper with no script of
     its own (ADR-011), so an origin that serves user content or could take
     injected HTML is never listed. `gh secret set` replaces the whole value,
     and nobody can read a secret back. The current list is `operatorOrigins` in
     the Wrapper site's served `<site>/environment-config.json` (public by
     design); the live `se-games-stage` page's `frame-ancestors` shows it too,
     sorted, after the Wrapper's origin. Both show the list of the deployment
     now live, which during a rollback is older than the last successful run,
     and not necessarily the secret. To see a rollback, open the Wrapper and
     game projects' Deployments, or ask the infrastructure owner: each live
     production deployment should be the newest successful one. If either is
     rolled back, do not build the value from it: it can lack newer origins or
     hold one removed on purpose. Agree the value with whoever set the secret,
     and redeploy `main` first only when it is safe to end the rollback. Until a
     value is agreed, leave the secret as it is. If neither is rolled back,
     compare the secret's update time in `gh secret list --env pages-stage` with
     the start time of the `config-stage` job in the last successful Pages run.
     If the secret was updated at or after that time, or the timing is unclear,
     the two may differ, so redeploy `main` first to serve the secret's value,
     or ask whoever set it. Nobody else should change the secret between this
     check and setting the new value. To add an operator, first confirm with the
     operator that the new origin serves no user content and is fully under its
     control (above), then set the secret to the current list plus the new
     origin (`gh secret set PAGES_OPERATOR_ORIGINS --env pages-stage`), then
     redeploy `main` (**Redeploy**, below): the configuration documents and the
     Wrapper's and the game's `frame-ancestors` carry it only from that
     deployment.
   - **`PAGES_WRAPPER_ORIGIN`**, **`PAGES_VERIFIER_ORIGIN`**: the two sites'
     origins (`https://host`). Set.
   - **`PAGES_SIGNER_ORIGIN`** (optional): the signing page's origin, the
     `pages.dev` origin of `se-signer-stage` (`https://host`, lowercase, no
     path, no trailing slash). It becomes the Wrapper's `signingPageOrigin` and
     the signing page's own origin; without it the environment offers no wallet
     delegation and no signing page is deployed. Set it only once the
     environment's backend accepts `keyDelegation` on a start (ask the backend
     team).
   - **`PAGES_ACCEPT_PENDING_NOTICES`** (optional): `true`, or unset. With
     `true`, the Wrapper and the signing page may offer and sign a `pending`
     notice while none is `approved` (staging, so the delegation can be tried
     before the legal review approves a text). It takes effect only with
     `PAGES_SIGNER_ORIGIN`, but any other value (`false`, `TRUE`, a space) fails
     the configuration job either way. Set it to `true` only where the
     environment's backend accepts pending notices (ask the backend team);
     otherwise every delegated start is refused `KEY_DELEGATION_NOTICE_UNKNOWN`.
     Never in production: the configuration job refuses it there.
   - **`PAGES_CHAIN_PINS`**: JSON with exactly `environment`, `runtimeSigner`,
     `registryDomain`, `entropyChainKind`, `entropyChainId`, `minRpcQuorum`, and
     `tipLagMargin` ([wrapper.md](../specs/wrapper.md#configuration)), and
     optionally `earlierPins` (below). Set. `entropyChainKind` (RFC-007) gives
     each entropy source its kind, `"evm"` or `"solana"`, keyed like
     `entropyChainId` and `tipLagMargin`, one entry for each source of
     `PAGES_RPC_ENDPOINTS` and no other; it enters the secret only by the
     one-step migration below (**Adding `entropyChainKind`**). Staging is
     `environment: "preview"` with `minRpcQuorum` 1 while it reads one RPC
     provider (ADR-008, decision 8). Its one entropy source keeps the key
     `anvil`, of kind `evm` (`"entropyChainKind": { "anvil": "evm" }`), with
     `entropyChainId` 50312, Somnia's public testnet, and `tipLagMargin` 100
     blocks (the backend's value, 2026-10-28;
     [W-26b](../specs/wrapper/signing-start-move-cash-out-and-cancel.md));
     `registryDomain` is at chain id 127823, Etherlink Shadownet (the backend,
     2026-11-03): the registry is not on the entropy chain, so do not change it
     to 50312. A `solana` source (kind `solana`, `entropyChainId` 101,
     mainnet-beta, `tipLagMargin` 64 slots, provisional) joins `anvil` on
     staging only later, by step 8 of RFC-007's section 9, with its own
     procedure ([Solana entropy sources](#solana-entropy-sources), below): added
     beside `anvil` at `minRpcQuorum` 1 (step 8.2), and `anvil` kept until the
     backend's switch and drain (se-backend#548) are done, when one
     configuration change drops it and raises `minRpcQuorum` to 2 (step 8.4). An
     environment's browser endpoints never include the provider its own engine
     reads (the code owner, 2026-11-18), so staging's `solana` endpoints may be
     a different provider pair from production's. Production must be
     `"production"` with `minRpcQuorum` of at least 2, and every `solana` source
     on cluster 101 (the validators' `production-cluster`); its `tipLagMargin`
     comes from the backend's measurement of the RPC lag (#133).

     The verify page checks a round's signature under the configured
     `registryDomain` and `runtimeSigner`, or under a pair listed in
     `earlierPins` ([V-3b](../specs/verify-page.md#configuration-v-3)):
     `[{"registryDomain":{"chainId":<number>,"verifyingContract":"<address>"},"runtimeSigner":"<address>"}]`,
     with no end time. So a change of domain or signer fails earlier rounds'
     check 3 ("The backend's signature"), and their links read as not matching
     their evidence, only when the outgoing pair is not listed. On staging,
     2026-11-03, with no list yet: a Coin Flip round closed before the switch
     failed only check 3, and a round played after it passed all seven.
     - **Append the outgoing pair in the same edit** of the secret that changes
       the current one. The config job refuses an entry that is the current
       pair, so appending it without changing the current pins fails the job;
       going back to a listed pair means removing it from the list and appending
       the pair being left in the same edit, unless that pair's rounds should
       fail (a leaked or revoked key).
     - **The list may hold more than one pair.** Each change of domain or signer
       appends the pair it leaves and keeps the entries already there. Order
       does not affect matching: a round's domain and signer select the pair.
       `gh secret set` replaces the whole value and nobody can read a secret
       back, so build the new value from the verifier's served
       `environment-config.json`, the one document that holds the list (that of
       the deployment now live, which during a rollback is older than the last
       successful run). Take only the fields of `PAGES_CHAIN_PINS`
       (`environment`, `runtimeSigner`, `registryDomain`, `entropyChainKind`,
       `entropyChainId`, `minRpcQuorum`, `tipLagMargin`, `earlierPins`): the
       document's other fields fail the config job. No `earlierPins` field means
       an empty list. To see a rollback, open the verifier project's
       Deployments, or ask the infrastructure owner: the live production
       deployment should be the newest successful one. If the verifier is rolled
       back, do not build the value from it: it can lack newer entries or hold a
       pair removed because its key leaked or was revoked. Agree the value with
       whoever set the secret, and redeploy `main` first only when it is safe to
       end the rollback. Until a value is agreed, leave the secret as it is. If
       the verifier is not rolled back, compare the secret's update time in
       `gh secret list --env pages-stage` with the start time of the
       `config-stage` job in the last successful Pages run. If the secret was
       updated at or after that time, or the timing is unclear, the two may
       differ, so redeploy `main` first to serve the secret's value, or ask
       whoever set it. Nobody else should change the secret between this check
       and setting the new value, because `gh secret set` replaces the whole
       value.
     - **Never list a leaked or revoked key's pair.** Its rounds then fail check
       3 on purpose; the page has no other handling for them. A pair already
       listed whose key leaks or is revoked comes off the list as soon as that
       is known, followed by a redeploy; until then the page still accepts what
       that key signs.
     - **The field goes into the secret only after the kit that supports it is
       on `main`.** Before that, the config job refuses it
       (`field earlierPins is not a chain pin`).
     - **In production, the config job runs at the deployed tag's commit**
       (`config-prod` in `pages-prod.yml`), so the document and the page always
       come from one release; the release's own `prod-check` check runs the same
       build at the same commit before it publishes. A release without support
       for the field fails that job with the same issue and deploys nothing, and
       the sites stay as they are. Set the field in `pages-prod-config` no
       earlier than when the release that first carries it is about to deploy.
       After that, a dispatch to an earlier tag fails the same way until the
       field is removed from the secret, and that release then fails earlier
       rounds' check 3 again. A rollback in Pages runs no config job and
       restores that deployment's own document.
     - Only the verifier's `environment-config.json` carries the list, and only
       when it has an entry; the Wrapper's never does, and the Wrapper still
       binds and checks only under the current pins. A verify page opened on the
       Wrapper's own site reads the Wrapper's document, so it does not accept an
       earlier pair; the Wrapper's verify link opens the verifier's site.
     - The list covers check 3 only: a change of an entropy chain still fails
       earlier rounds' checks 2 and 6.

   - **`PAGES_RPC_ENDPOINTS`**: JSON of `rpcEndpoints`,
     `{"<source>":[{"provider":"…","url":"…"}]}`, keyed by the same entropy
     sources as the pins' `entropyChainKind`, `entropyChainId`, and
     `tipLagMargin`; `PAGES_RPC_ORIGINS` must list exactly the origins of its
     URLs. Set. A Solana source's endpoints go under the key `solana`, each
     first through the provider checklist
     ([Solana entropy sources](#solana-entropy-sources)).

**The Pages projects are managed as code by the infrastructure owner** (since
2026-10-28): their environment variables, bindings, and compatibility date.
Nothing changed for the kit's deploys. Ask the infrastructure owner for any
change to a project setting; never make it in the Cloudflare dashboard, because
their next apply removes a setting added outside their code. A setting reaches a
site only with its next deployment, so after such a change, when the
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
providers (two independent providers for its one source, `solana`, chosen in
se-backend#375, neither the one production's engine reads), their CORS behavior,
and their `connect-src` entries are #133's, shared out of band, and each passes
the provider checklist first
([Solana entropy sources](#solana-entropy-sources)).

**Switching staging's entropy chain** (as for the move from anvil to Somnia's
public testnet, 2026-10-28). The engine and the Wrapper must pin the same chain,
so the secrets change right after the backend's switch, not before. The move to
Solana mainnet-beta does not follow this procedure: it adds the new source
beside the old one before the backend's switch
([Solana entropy sources](#solana-entropy-sources)).

1. The infrastructure owner sends the values: the RPC endpoint and its origin,
   and the chain pins (`entropyChainKind`, `entropyChainId`, and `tipLagMargin`
   per source, with any other pin that changes). They are shared out of band,
   never in an issue, a pull request, or a log.
2. Right after the backend's switch, a maintainer sets the three `pages-stage`
   secrets: `PAGES_RPC_ENDPOINTS`, `PAGES_RPC_ORIGINS`, and `PAGES_CHAIN_PINS`.
3. Dispatch the Pages workflow on `main` (**Redeploy**, below). Until that
   redeploy the deployed configuration still pins the old chain, so every
   staging config round (a book round runs no W-26 check, W-52) is refused at
   check 3 (`cross-field`: the round's `entropyChainId` is not the pinned one)
   and shows "this round failed verification"; `T_0` is not settled, so nothing
   is signed (W-26). In the same window the verify page's check 6 reads the old
   pins for new rounds. The Wrapper reads its configuration once, at boot, so a
   session opened before the redeploy keeps the old pins and keeps refusing
   until it is relaunched.
4. Verify the deployed `<site>/environment-config.json` on the Wrapper's and the
   verifier's sites: `entropyChainKind`, `entropyChainId`, `tipLagMargin`,
   `minRpcQuorum`, `environment`, and `registryDomain` are the values sent, and
   `rpcEndpoints` names the one endpoint under the expected source key;
   `earlierPins` is on the verifier's alone, with the outgoing pair last, if the
   domain or the signer changed. Then open a new Wrapper session from a fresh
   launch (a new launch code: codes are single-use), never a tab opened before
   the redeploy, and start a Coin Flip or Cash or Crash round: it passes the
   start, with the degraded indicator shown.

Expected after a switch, not an alarm: a staging round played on the old chain
(anvil, before the switch) cannot be verified on staging's verify page
afterwards, because check 6 then reads the new chain (Somnia's public testnet).
A change of `registryDomain` or `runtimeSigner` does the same through the verify
page's check 3 only when the outgoing pair is not in `earlierPins`, which is on
purpose for a leaked or revoked key's pair and a missed step otherwise
(`PAGES_CHAIN_PINS`, above).

**Adding `entropyChainKind`** (RFC-007, Q12; once, with the kit change that
makes the field required, RFC-007's slice 1). For a human maintainer with the
`pages-stage` environment's secrets, or the infrastructure owner. The kit with
that change refuses a `PAGES_CHAIN_PINS` without the field
(`invalid-entropy-chain-kind`), and every kit before it refuses one with the
field (`field entropyChainKind is not a chain pin`: the field list is closed),
so the secret and the code change in one step, with no other merge to `main`
between them (every push to `main` deploys staging). Staging's document is the
only one to migrate: `pages-prod-config` holds no document yet, and production's
first document carries the field from the start (RFC-007, Migration).

1. Wait until the pull request with the change is approved by every gate and
   ready to merge. Agree who sets the secret and who merges, and hold every
   other merge to `main` from step 2 until step 3 is done.
2. Right before the merge, set `PAGES_CHAIN_PINS` in `pages-stage` to its
   current value plus `"entropyChainKind": { "anvil": "evm" }`, and nothing else
   changed (`gh secret set PAGES_CHAIN_PINS --env pages-stage`). Build the
   current value as for `earlierPins` (above): from the verifier's served
   `environment-config.json`, only the fields of `PAGES_CHAIN_PINS`, after
   checking for a rollback and for a newer secret. Never paste the value into an
   issue, a pull request, or a log.
3. Merge the pull request at once. Its push to `main` runs the Pages workflow:
   `config-stage` builds both documents with the new code and the new secret,
   and `deploy-stage` deploys them.
4. Verify both sites' `<site>/environment-config.json`: `entropyChainKind` is
   `{ "anvil": "evm" }`, and every other value is what it was. Then open a new
   Wrapper session from a fresh launch and start a Coin Flip or Cash or Crash
   round: it passes the start, with the degraded indicator shown, as before.

**A failed configuration job in that window** means the secret and the code
disagree: one has landed without the other. A run of the old code with the new
secret (a merge or a redeploy between steps 2 and 3) fails `config-stage` with
`PAGES_CHAIN_PINS: field entropyChainKind is not a chain pin`; a run of the new
code with the old secret (a merge before the secret was set) fails it with
`invalid-entropy-chain-kind at entropyChainKind`. Either way the job stops the
deploy before anything is uploaded: the deployed sites stay as they were, and
sessions keep the configuration they booted with. Complete the step that is
missing (set the secret, or merge the pull request), then redeploy `main`
(**Redeploy**, below) once both have landed: a new run, never "Re-run failed
jobs" on the failed one, which keeps its old commit. If the change will not
merge after all, set the secret back to its value without the field and redeploy
`main`.

**Production** (`.github/workflows/pages-prod.yml`;
[ADR-009](../decisions/ADR-009-production-pages-deploy-trigger-and-source.md),
decision 3). A release deploys production in the same run: the release
workflow's `production` job calls `pages-prod.yml` with the Wrapper's new tag
after `wrapper-assets` (a tag or a release made with the job token starts no
other workflow). Production serves the Wrapper's and the verifier's sites, each
with the proxy worker and its configuration document, as on staging; it serves
no reference game, and frames the real game origins. Its jobs:

| Job             | Permissions                            | Environment         | What it does                                                                                                                                                                                                                                                                                                                       |
| --------------- | -------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-check` | `actions: read`                        | none                | checks the tag's shape, refuses a dispatch while a release run is not completed, and resolves the tag's commit (`git ls-remote`; when the release calls it, the release's own commit)                                                                                                                                              |
| `prod-verify`   | `contents: read`, `attestations: read` | none                | downloads the tar and its `.sha256` from the Wrapper's release by tag, checks that the `.sha256` names the tar and matches it, and runs `gh attestation verify` ([Verify before and after](#verify-before-and-after)) with `--source-digest` the tag's commit                                                                      |
| `prod-worker`   | `contents: read`                       | none                | after `prod-verify` (the attestation proves the commit before its code runs), builds the proxy worker with `tsc` at the tag's commit, with staging's own script (not attested)                                                                                                                                                     |
| `config-prod`   | `contents: read`                       | `pages-prod-config` | after `prod-verify`, builds and validates the configuration documents (two, or three with `PAGES_SIGNER_ORIGIN`) from that environment's secrets (the same names as staging's) at the tag's commit, in production mode (`--production`, which refuses `PAGES_ACCEPT_PENDING_NOTICES`); that environment holds no deploy credential |
| `deploy-prod`   | `contents: read`                       | `pages-prod`        | runs no repository code: downloads the tar again by tag, refuses any download whose SHA-256 is not its producing job's digest, lays out the sites (the signing page's only with its document), writes their `_headers` with staging's own script, and runs `wrangler pages deploy`                                                 |

**The configuration tool's own rules** (specs/client-kit.md, The Pages sites'
configuration), on staging and production alike: every origin the deploy's
headers step reads (each RPC endpoint URL's origin, each game and operator
origin, the Wrapper's origin) must be `https` with a lowercase host of letters,
digits, `-`, and `.` and an optional port, exactly what that step accepts: no
uppercase letter, no `_`, no IPv6 literal, no `http`. **Production mode**
(`--production`) also requires `PAGES_CHAIN_PINS`' `environment` to be
`production` (so `minRpcQuorum` is at least 2, and each RPC source has at least
two endpoints, and every `solana` source is on cluster 101, mainnet-beta, the
validators' `production-cluster`); staging's `config-stage` runs as `preview`,
without it.

**The same checks run before the release publishes**: the release workflow's
`prod-check` job (`.github/workflows/pages-prod-check.yml`; Release, step 3)
runs `config-prod`'s steps in `pages-prod-config` at the release commit, then
the deploy's own headers step on the documents (so a `_headers` line over the
Pages limit of 2,000 characters, which grows with the number of origins, fails
here, naming the site and the header), and `deploy-prod`'s own "Require the
Pages settings" step in `pages-prod`, with no checkout and no repository code,
after the configuration check, whose output says whether production names a
signing page; `publish` needs it. So a missing or refused value in either
environment stops the release before npm publishes; `config-prod` and
`deploy-prod` check the values again at deploy time. The token is only required
to be set, not verified with Cloudflare (ADR-009, amendment note), so an expired
token still fails `deploy-prod`: rotate it (Rotate the Pages token, below), then
dispatch "Pages production" from `main` with the release's tag. After changing a
production secret, the next release checks it before it publishes; a redeploy by
tag checks it in `config-prod` and `deploy-prod` before it deploys. A project
name must be a Pages project name (lowercase letters, digits, and inner dashes,
at most 63 characters), and the names must differ. `PAGES_SIGNER_PROJECT` is
required only when production's configuration names a signing page
(`PAGES_SIGNER_ORIGIN` set in `pages-prod-config`); when it is set, it is held
to the same two rules.

Only `deploy-prod` is in the concurrency group `pages-prod`
(`cancel-in-progress: false`), so production deploys never overlap and a staging
run never touches them. `pages-prod` has **no required reviewer**: the `release`
approval of `publish` is the human gate, and the deploy refuses any tar whose
attestation does not verify. `pages-prod` holds the secrets
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PAGES_WRAPPER_PROJECT`, and
`PAGES_VERIFIER_PROJECT` (the production project names), and
`PAGES_SIGNER_PROJECT` (the signing page's production project name; required
only once `PAGES_SIGNER_ORIGIN` is set); `pages-prod-config` holds
`PAGES_WRAPPER_ORIGIN`, `PAGES_VERIFIER_ORIGIN`, `PAGES_CHAIN_PINS`,
`PAGES_RPC_ENDPOINTS`, `PAGES_RPC_ORIGINS`, `PAGES_GAME_ORIGINS`, and
`PAGES_OPERATOR_ORIGINS`, and, once production turns the wallet delegation on,
`PAGES_SIGNER_ORIGIN` (never `PAGES_ACCEPT_PENDING_NOTICES`). Both are created,
protected and restricted to `main`, before publishing is turned on (Bootstrap
step 8). Nothing reaches production until the publish path is on (#154).

**Redeploy, roll back, or roll forward by tag.** Run the "Pages production"
workflow by hand from `main` with the tag
`@intraverse/se-client-wrapper@<version>` of a released Wrapper: it goes through
the same checks. Choose `main` in "Use workflow from"
(`gh workflow run pages-prod.yml --ref main -f tag=<tag>`): from any other
branch `release-check` is skipped, every job after it skips, and the run ends
green with nothing deployed. **The release always wins**: the dispatch refuses
while a run of the release workflow is requested, queued, pending, waiting for
its reviewers, or in progress (even a short "nothing to release" run), so it
never replaces a release's pending deploy; run it again once that run has
finished. A window remains (the check and the deploy are not atomic): if a
release run that started after the check has its pending `deploy-prod` replaced
by the dispatch's, redeploy that release's tag the same way. A **Pages
rollback** of each production project
([Roll back or deprecate](#roll-back-or-deprecate)) is never blocked by a
release run.

**A failed production deploy is redeployed by tag, never by re-running the
release run.** "Re-run failed jobs" re-runs only the failed jobs and those after
them, and GitHub keeps the outputs of the jobs it does not re-run, so when
`deploy-prod` failed it downloads `_worker.js` and the two configuration
documents from the earlier attempt, which `prod-worker` and `config-prod` keep
one day: after a day it fails at the download. "Re-run all jobs" runs
`changesets-mode` again, which finds every version tagged and ends with "nothing
to release", so `publish` and every job after it (`production` included) are
skipped and the run ends green with nothing deployed. Fix the cause (a missing
`pages-prod` secret, a configuration value, the Pages project), then dispatch
"Pages production" from `main` with the release's tag, as above.
<!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). The production projects and hostnames, the secrets of the `pages-prod` and configuration environments, the operator and game origins, the RPC providers, and `tipLagMargin`; shared out of band, never written in this repository. -->

**After the first deploy** (the real test: zone-wide settings can still answer
with a 403 or a challenge page), checks 1 to 4 on the Wrapper's and the
verifier's sites and check 5 on the game's site (the signing page's site has its
own checks, step 5 of
[Turning on the wallet delegation](#turning-on-the-wallet-delegation)):

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
   shows from its mount, inert until a round is ready, W-57, W-58). On staging,
   a started round passes the tip check and the game takes input, under the
   degraded indicator (W-26a).

Check them again after any change to `headers.json`, the proxy, the
configuration, the reference game, or the projects' settings.

**Redeploy** `main` without a commit: run the Pages workflow by hand on `main`
(Actions, Pages, Run workflow). Needed after a change to a Pages project setting
or to a `pages-stage` secret.

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

### Solana entropy sources

The operations of
[RFC-007](../rfcs/active/RFC-007-solana-entropy-in-the-browser.md) (Solana
entropy in the browser;
[ADR-013](../decisions/ADR-013-solana-entropy-sources.md), accepted): a Solana
source's endpoints in the Pages secrets, the checklist every browser endpoint
passes first, a browser key's rotation, staging's move to Solana mainnet-beta
(RFC-007, section 9, step 8, with its canary), and production's first document
(step 9). For the infrastructure owner, a human maintainer with the
environment's secrets, and the client kit's engineer, who runs the canary.
Provider names, endpoint URLs, browser keys, and origins are shared out of band
and never written in this repository, an issue, a pull request, or a log. Until
RFC-007's slices 2 and 4 are deployed, a `solana` source fails closed without
calling any endpoint: the tip check as `unsupported-chain-kind`, the verify
page's check 6 as "could not be verified".

**A Solana source's endpoints.** The source lives in three secrets, of the same
names in `pages-stage` and in `pages-prod-config` (the setup's step 4, above):

- `PAGES_RPC_ENDPOINTS` holds the Solana endpoints under the source key
  `solana`, beside any other source's list. A source of kind `solana` is keyed
  `solana`, so a document has at most one (RFC-007, Q7):
  `{"solana":[{"provider":"<name>","url":"<URL>"},{"provider":"<name>","url":"<URL>"}]}`.
  - `provider` is a short name (a letter or a digit, then up to 63 letters,
    digits, `.`, `_`, `:`, or `-`), a different one for each endpoint of the
    source (compared without case: the validator's `shared-provider`). The
    round's evidence and the verify page show it, never the URL.
  - `url` is `https`, with no credentials, no query string, and no fragment
    (`invalid-endpoints` otherwise). The browser key goes in the URL's **path**
    (P-3), or the URL is the bare `https://host` of a tokenless endpoint with an
    Origin allowlist. A provider whose only key form is a query parameter cannot
    be used. Two endpoints of one source never share a URL.
- `PAGES_RPC_ORIGINS` lists exactly the origins of every URL in
  `PAGES_RPC_ENDPOINTS`, of every source, each once: `https://`, the host, and
  the port if the URL names one, never a path (so never a key). While staging
  lists `anvil` and `solana`, it holds Somnia's origin and the Solana endpoints'
  origins. Any other list fails the config job
  (`PAGES_RPC_ORIGINS: not exactly the origins of PAGES_RPC_ENDPOINTS`).
- Every endpoint's origin passes the headers step's `origin` pattern (the
  `origin=` line of "Write the Pages headers files" in
  `.github/workflows/pages.yml`, which `apps/wrapper/pages-config-rules.ts`
  copies character for character): `https`, a lowercase host of dot-separated
  labels of letters, digits, and inner `-`, and an optional port of up to five
  digits. The config job refuses any other (`not-https-origin`, naming the
  source and the endpoint's index), on staging as in production. Both sites'
  `connect-src` take the origins only: the path, and the key in it, never reach
  a header.
- The key is public by design, since the served `environment-config.json` holds
  the URL: a quota credential, never a secret. It is a key for the browser only,
  separate from any key an engine uses, restricted by `Origin` to the
  environment's Wrapper and verifier origins, never by `Referer` (the kit sends
  none), with a rate or spend cap at the provider (P-3). Still, never paste it
  into an issue, a pull request, or a log.

**The provider checklist** (RFC-007, section 6, P-1 to P-7). The infrastructure
owner runs it for every endpoint before it enters an environment's
`PAGES_RPC_ENDPOINTS`, and again for a new key, with the browser key that
environment will use, from **both** of the environment's origins: the Wrapper's
(the tip check, and the Wrapper's copy of the verify page) and the verifier's.
Which items:

- **production:** P-1 to P-7. No production document lists a provider before it
  passes P-1 to P-6 (RFC-007, Q2);
- **staging:** P-1 to P-4 from staging's origins, and P-6 against staging's own
  engine (step 8.2, below). P-5 is production's requirement: a shallower
  provider only limits how far back staging's verify page reaches. The config
  job enforces P-7.

Record the result per provider (its name, the environment, the date, and the
items passed), never a URL or a key: with the infrastructure owner's provider
records, and for production in se-backend#375, which holds the providers' check.

The calls, by hand, with `curl`, which sends no `Referer` (the kit sends none)
and follows no redirect. Paste the URL into `read`, which keeps it out of the
shell's history, set `ORIGIN` to the Wrapper's origin, and run everything again
with the verifier's:

```sh
read -r RPC_URL
ORIGIN='https://<wrapper host>'
curl -s -i -X OPTIONS "$RPC_URL" -H "Origin: $ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
rpc() {
  curl -s -i -X POST "$RPC_URL" -H "Origin: $ORIGIN" \
    -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"
}
rpc getGenesisHash '[]'
rpc getSlot '[{"commitment":"finalized"}]'
rpc getBlocksWithLimit '[<slot>,50,{"commitment":"finalized"}]'
rpc getBlock '[<slot>,{"commitment":"finalized","encoding":"json","transactionDetails":"none","rewards":false,"maxSupportedTransactionVersion":0}]'
```

`<slot>` is a finalized slot a few hundred below the `getSlot` answer, and the
`getBlock` options are the kit's own, exactly (RFC-007, section 4).

1. **P-1. CORS.** The preflight answers a 2xx status with
   `Access-Control-Allow-Origin` that origin (or `*`: the kit sends no
   credentials), `Access-Control-Allow-Methods` with `POST`, and
   `Access-Control-Allow-Headers` with `content-type` (a `*` in either is a
   wildcard a browser accepts for a request without credentials). Every POST's
   answer carries `Access-Control-Allow-Origin` too. For a key Origin-locked to
   the environment's two origins, the same preflight from an origin not on its
   list (`ORIGIN='https://example.com'`) gets no `Access-Control-Allow-Origin`
   for it.
2. **P-2. HTTP.** Every answer is HTTP 200, a JSON-RPC error included, and never
   a redirect (`curl` follows none here, so one shows as its 3xx). To see an
   error: the `getBlocksWithLimit` answer lists the next 50 blocks from
   `<slot>`; a slot missing between two listed ones was skipped, and `getBlock`
   at it answers HTTP 200 with `error.code` -32007 or -32009 in the body, which
   the verify page reads. The kit sends one call per request, never a batch, and
   needs no WebSocket.
3. **P-3. Authorization.** The key is in the URL's path, or there is none and
   the endpoint has an Origin allowlist; never in a query string or a fragment.
   It is the browser's own key, not an engine's, restricted by `Origin` to the
   environment's two origins (P-1's refused preflight shows it), never by
   `Referer`, with a rate or spend cap in the provider's settings.
4. **P-4. Methods.** `getGenesisHash` answers exactly the genesis hash pinned
   for cluster 101, mainnet-beta (`packages/shell/src/solana-clusters.ts`);
   `getSlot` at `finalized`, a non-negative integer; `getBlock` at a finalized
   slot, an object with `blockhash`, `previousBlockhash`, an integer
   `blockTime`, and `parentSlot`; `getBlocksWithLimit`, a list of slots. Errors
   carry the Solana validator's JSON-RPC codes (-32001, -32004, -32007, -32009,
   -32014, -32019), as P-2's skipped slot shows.
5. **P-5. History** (production). The verify page checks a round back to at
   least the operator's dispute window, and never less than 90 days (RFC-007,
   Q15). `getBlock` at a slot that old answers a block, never -32001, -32004,
   -32019, or `null`: pick the slot well below the `getSlot` answer, and read
   the answer's `blockTime` (Unix seconds) to confirm the block is at least that
   old; go further back until it is. Then run `getBlocksWithLimit` from a slot
   at that depth, over a range that holds a skipped slot (P-2): it answers the
   list, never an error, for the same history as `getBlock`, because a provider
   can serve an old block and still fail the range call the verify page makes
   for an old skipped-slot round. At `minRpcQuorum` 2 with two endpoints, the
   verify page reaches only as far back as the shallower one. A provider that
   falls short is replaced or upgraded on the backend's side (another provider
   the engine does not use with a full archive, or an archive plan), never
   worked around in the kit.
6. **P-6. Independence.** At least two endpoints for the source (production;
   staging from step 8.4), run by different organizations on separate
   infrastructure, and none of them the provider that environment's own engine
   reads (the code owner, 2026-11-18). The kit cannot see the engine's provider:
   confirm it with the backend, for that environment. Staging's pair may differ
   from production's.
7. **P-7. The policies.** Each endpoint's origin is in `PAGES_RPC_ORIGINS` and
   passes the headers step's pattern (above; the config job refuses it
   otherwise). After the deploy, each site's `Content-Security-Policy` lists it
   in `connect-src` (**After the first deploy**, check 4).

**Rotating a browser key.** The Wrapper reads its configuration once, at boot,
and keeps it for the session's life, so a session opened before the redeploy
keeps calling the old URL until it ends; a verify page loaded before it keeps
the old URL until it is reloaded. The old key therefore stays valid until every
such session has ended:

1. Create the new key at the provider with the old one's restrictions (browser
   only, Origin-locked to the environment's Wrapper and verifier origins, a rate
   or spend cap). Leave the old key valid.
2. Run the checklist with the new key from both origins: P-1 to P-4, and in
   production P-5 too (a new key can sit on another plan).
3. Set `PAGES_RPC_ENDPOINTS` with the new URL in the old one's place and the
   provider's name unchanged, and `PAGES_RPC_ORIGINS` too if the origin changed
   (a key in the path leaves it as it is): `--env pages-stage` on staging,
   `--env pages-prod-config` in production
   (`gh secret set PAGES_RPC_ENDPOINTS --env <environment>`). Build the current
   value from the served `environment-config.json`'s `rpcEndpoints`, after the
   rollback and newer-secret checks of `earlierPins` (above).
4. Redeploy: on staging, the Pages workflow on `main` (**Redeploy**, above); in
   production, "Pages production" from `main` with the live release's tag
   (**Redeploy, roll back, or roll forward by tag**, above).
5. Check both sites' `<site>/environment-config.json`: `rpcEndpoints` holds the
   new URL (never copy it anywhere). Then a config round from a fresh launch
   passes the start.
6. Wait until every session opened before the redeploy has ended: at least the
   Play API's longest session (from the redeem to its hard end, the redeem
   answer's `sessionExpiresAt`) after the deploy finished. Then revoke the old
   key at the provider and record the date (the provider's name and the date
   only).
   <!-- TODO(backend): the longest session the Play API opens (from the redeem to `sessionExpiresAt`), so the wait before an old browser key is revoked is a number. -->

Revoke the old key at once only when it must go now: every session opened before
the redeploy then loses that endpoint, and at `minRpcQuorum` 2 with two
endpoints their Solana config rounds fail the tip check (`too-few-answered`,
with the required cancel once `T_0` is settled) until the player relaunches.

**Staging's move to Solana mainnet-beta** (RFC-007, section 9, step 8; decided,
Q11 and Q16). Staging's one engine moves from Somnia's public testnet to Solana
mainnet-beta (cluster 101), the same chain as production. Its `solana` source is
kind `solana`, `entropyChainId` 101, and `tipLagMargin` 64 slots (provisional,
Q1, until the backend's measurement, se-backend#471), with staging browser keys
on two independent providers that staging's own engine does not read,
Origin-locked to staging's Wrapper and verifier origins. The five steps run in
this order, each once the one before is done. Unlike **Switching staging's
entropy chain** (above), the new source goes in **before** the backend's switch,
beside the old one, so no round is refused for an unknown source in a session
opened after step 2.4. A session opened before it keeps the old configuration
(the Wrapper reads it once, at boot), so a `solana` round in that session has an
unknown source and fails verification: step 3's switch waits until every such
session has ended (the Play API's longest session after step 2.4's deploy, as in
**Rotating a browser key**, step 6), or those players relaunch.
<!-- TODO(hosting, RFC-007 Q11): staging's two Solana endpoints (staging browser keys on two independent providers staging's engine does not read, Origin-locked to staging's origins), shared out of band; then step 8.2's change. -->

1. **The kit's Solana reader is on staging.** RFC-007's slices 1 to 7 are merged
   to `main`, and the Pages run of the last of those merges ended green (its
   `deploy-stage` ran).
2. **Add the `solana` source beside `anvil`** (the infrastructure owner, or a
   human maintainer with `pages-stage`'s secrets):
   1. Run the checklist for both endpoints (staging's items, above).
   2. Agree who sets the secrets, and hold every merge to `main` until step 2.4
      is done. Each of the three secrets below is invalid without the other two,
      so a push between them runs `config-stage` on a half-changed set, which it
      refuses (the sites stay as they were, but the run fails).
   3. Build each current value from the verifier's served
      `environment-config.json`, after the rollback and newer-secret checks of
      `earlierPins` (above), and set (`gh secret set <name> --env pages-stage`):
      - `PAGES_CHAIN_PINS`: the current value with the `solana` entry added to
        `entropyChainKind`, `entropyChainId`, and `tipLagMargin`, and nothing
        else changed: `minRpcQuorum` stays 1, `environment` stays `preview`.
        Those fields then read:

        ```text
        "entropyChainKind": { "anvil": "evm", "solana": "solana" }
        "entropyChainId":   { "anvil": 50312, "solana": 101 }
        "tipLagMargin":     { "anvil": 100,   "solana": 64 }
        "minRpcQuorum":     1
        ```

      - `PAGES_RPC_ENDPOINTS`: the current value plus the `solana` list of two
        endpoints; `anvil`'s list unchanged;
      - `PAGES_RPC_ORIGINS`: the current list plus the two Solana origins.
   4. Redeploy `main` (**Redeploy**, above).
   5. Check both sites' `<site>/environment-config.json`: `entropyChainKind`,
      `entropyChainId`, and `tipLagMargin` as above, `rpcEndpoints` with
      `anvil`'s endpoint unchanged and two under `solana`, `minRpcQuorum` 1, and
      `environment` `preview`; every other value as it was. The
      `Content-Security-Policy` of `/` and `/verify/` on the Wrapper's site and
      of `/` on the verifier's lists the new origins in `connect-src`. Then a
      new Wrapper session from a fresh launch: a Coin Flip round passes the
      start, with the degraded indicator, as before. No round names `solana`
      yet, so nothing changes for players: the source only has to be in place
      before the first Solana round, and in every session that plays one (see
      above for sessions opened before this step).

   A failed `config-stage` names the input, the field, and the issue (for
   example `invalid-entropy-chain-kind at entropyChainKind.solana` when a map
   lacks the source, `not-https-origin`, or the `PAGES_RPC_ORIGINS` mismatch)
   and deploys nothing: fix the secret, then redeploy `main`.

3. **The backend's switch and drain** (se-backend#548, planned for 2026-11-30 to
   2026-12-03): the backend's fix, the drain of staging's rounds in flight, then
   the engine's switch to mainnet-beta. The kit does nothing here; wait for the
   backend's word that all three are done. From the switch on, staging's config
   rounds name `solana`, still at `minRpcQuorum` 1 under the degraded indicator.
4. **Drop `anvil` and raise `minRpcQuorum` to 2** (Q16): one configuration
   change, then a new deploy run.
   1. Hold every merge to `main`, as in step 2.2.
   2. Build each current value as in step 2.3, and set:
      - `PAGES_CHAIN_PINS`: the `anvil` entry removed from `entropyChainKind`,
        `entropyChainId`, and `tipLagMargin`, and `minRpcQuorum` 2;
        `environment` stays `preview`, and nothing else changes. Those fields
        then read:

        ```text
        "entropyChainKind": { "solana": "solana" }
        "entropyChainId":   { "solana": 101 }
        "tipLagMargin":     { "solana": 64 }
        "minRpcQuorum":     2
        ```

      - `PAGES_RPC_ENDPOINTS`: the `anvil` list removed;
      - `PAGES_RPC_ORIGINS`: rebuilt from the URLs left in
        `PAGES_RPC_ENDPOINTS`, each origin once, never by deleting Somnia's
        origin alone: a Solana endpoint may share it, and the config job refuses
        a list that is not exactly those origins.
   3. Redeploy `main` (**Redeploy**, above): a new run, never "Re-run" of a
      failed one, which keeps that run's commit.
   4. Check both sites' `<site>/environment-config.json`: only `solana` in the
      three maps and in `rpcEndpoints`, `minRpcQuorum` 2, and `environment`
      `preview`. Somnia's origin is gone from `connect-src` unless a Solana
      endpoint uses it. Then a new session from a fresh launch shows no "chain
      check not independent (development)" indicator, and a Coin Flip round
      passes the start.

   **Expected, not an alarm** (accepted for staging, Q16): a staging round
   played before the switch, on `anvil`, now shows as not matching on staging's
   verify page: check 2 fails for a source the configuration does not list
   (V-7), and check 6 cannot be verified. Rounds played on `solana` between
   steps 3 and 4 still verify. A session opened before this redeploy keeps
   `minRpcQuorum` 1, `anvil`, and the degraded indicator until it ends.

5. **The canary** (the gate before production; decided by the code owner,
   2026-11-19, and refined on 2026-11-20). The client kit's engineer runs it
   after step 4, on staging at `minRpcQuorum` 2:
   - **Open the canary's tracking issue first**: a new public issue in this
     repository, which holds the canary's whole record (below). It does not
     exist before this step; whoever runs the canary opens it.
   - Play at least **100 Coin Flip (`coin-flip-v1`) config rounds over at least
     24 hours**, each played to its end, each from a session launched after step
     4's redeploy (an older session still checks at quorum 1).
   - **Only Coin Flip rounds count.** Only a round of one step and two options
     can reach V-6 (A-3). A Cash or Crash round, which ends at V-8 on the verify
     page, is neither counted nor restarts the count; nor is a book round, which
     runs no tip check (W-52).
   - A Coin Flip round **counts** only when both hold: its tip check passed (the
     round reached play, and its round receipt read "Checked", never "Checked
     (dev)" or "Not verified", W-59), and, once the round has ended, the verify
     page (the receipt's **Verify this round**) shows it as matching (V-6),
     check 6 included. A verify page that says the round has not ended yet (V-8)
     is not an outcome: check again later.
   - **Any other outcome of a Coin Flip round restarts the count**: a failed tip
     check ("could not verify the chain", then "this round failed
     verification"), or a verify page that shows a mismatch (V-7) or "could not
     be verified" (check 6). The count restarts at zero once the cause is found
     and recorded (**A Solana config round fails its tip check** and **A Solana
     round's check 6 is not matching**, in Troubleshooting), and the 24 hours
     run from the first round counted after it.
   - **A change to staging's Solana endpoints during the canary.** A browser
     key's rotation on the same provider (**Rotating a browser key**, above)
     does not restart the count. A change of provider does: the count restarts
     at zero, and only rounds from sessions launched after that change's
     redeploy count.
   - **The record**, in the tracking issue: each round's id, when it was played,
     and its outcome (the tip check's and the verify page's); for any other
     outcome, the failure code (the tip check's, such as `too-few-answered` or
     `lagging`, or the verify page's failed check and its reason) and, once
     found, its cause; and each restart with its reason. Never a URL, a key, or
     a hostname.
   - It **passes** at 100 counted rounds in a row, the first and the hundredth
     at least 24 hours apart. Post the result in the tracking issue, link it
     from se-client-kit#235, and report it to the code owner: production's first
     document waits for it (step 9, below).

**Production's first document** (RFC-007, section 9, step 9; decided by the code
owner, 2026-11-18). Production's `pages-prod-config` gets no chain value, and
the publish path (se-client-kit#154, `RELEASE_PUBLISH_ENABLED`, Bootstrap
step 8) stays off, until **all** of these hold:

1. RFC-007's slice 1 is merged;
2. both production browser providers pass P-1 to P-6, with production's browser
   keys, from production's Wrapper and verifier origins (se-backend#375);
3. step 8's canary has passed.

There is no interim document before it: no `evm` source, and no `anvil`. The
first release deploys production in the same run, and its `prod-check` reads
`pages-prod-config`, so the variable is set only after the document's values
are. A production config round passes the tip check only on a release that
carries the Solana tip check (slices 2 and 3), and the verify page reads its
check 6 only from slice 4: both are on `main` before step 8 starts. The values,
set by the infrastructure owner (#133)
(`gh secret set <name> --env pages-prod-config`):

- `PAGES_CHAIN_PINS`: `environment` `production`, production's `runtimeSigner`
  and `registryDomain` (the backend's), no `earlierPins`, and one source:

  ```text
  "entropyChainKind": { "solana": "solana" }
  "entropyChainId":   { "solana": 101 }
  "tipLagMargin":     { "solana": 64 }
  "minRpcQuorum":     2
  ```

  `tipLagMargin` is 64 slots, provisional (Q1), or the backend's measurement on
  the contracted providers if it has landed (se-backend#471);

- `PAGES_RPC_ENDPOINTS`: `{"solana":[…]}`, two endpoints on two independent
  providers production's engine does not read (P-6), with production's browser
  keys, Origin-locked to production's Wrapper and verifier origins;
- `PAGES_RPC_ORIGINS`: exactly those two origins;
- `PAGES_WRAPPER_ORIGIN`, `PAGES_VERIFIER_ORIGIN`, `PAGES_GAME_ORIGINS`, and
  `PAGES_OPERATOR_ORIGINS`: #133's.

The release's `prod-check` refuses, before npm publishes, a document that is not
`production` (`not-production`), a quorum below 2 (`production-quorum`), a
`solana` source not on cluster 101 (`production-cluster`), a source with fewer
endpoints than the quorum (`quorum-unreachable`), or an origin the headers step
refuses (`not-https-origin`). After the first deploy, run **After the first
deploy**'s checks 1 to 4 and check both sites' `<site>/environment-config.json`
against the values above; then play one round from a test launch
([Verify before and after](#verify-before-and-after), step 5): it passes the
start with no degraded indicator. Once production runs on Solana, RFC-007 is
archived.
<!-- TODO(hosting, se-backend#375): production's two Solana browser providers (the second still to be chosen), their browser keys, and P-1 to P-6 from production's origins; shared out of band, never written in this repository. -->

#### Turning on the wallet delegation

The wallet delegation (se-client-kit#220;
[specs/wrapper/the-wallet-delegation.md](../specs/wrapper/the-wallet-delegation.md),
[specs/signing-page.md](../specs/signing-page.md)) is offered in an environment
only when its Wrapper's configuration names the signing page
(`signingPageOrigin`, from `PAGES_SIGNER_ORIGIN`) **and** the release holds a
notice the environment accepts. Production accepts only `approved` notices, and
the backend's list holds only `en-draft-1`, `pending` until its legal review: so
production plays exactly as before until a release vendors an `approved` notice,
whatever its secrets say.

**Staging, with the pull request that builds it (#220).** For a human maintainer
with the `pages-stage` secrets, or the infrastructure owner. Staging needs only
two secrets, both in `pages-stage`: `PAGES_SIGNER_ORIGIN` and
`PAGES_ACCEPT_PENDING_NOTICES`. Its project name is not a secret: `pages.yml`
names `se-signer-stage` itself (`SIGNER_PROJECT`), as it names staging's other
projects. The secrets are set **before the merge**: the Pages workflow before
#220 does not pass them to any job, so setting them early changes nothing, and
the push that merges #220 deploys the signing page at once.

1. Ask the backend team to confirm that staging's backend accepts
   `keyDelegation` on a start and accepts pending notices (its own setting); if
   it accepts no pending notice, leave `PAGES_ACCEPT_PENDING_NOTICES` unset:
   staging then offers nothing until an `approved` notice is vendored.
2. The infrastructure owner creates the Pages project `se-signer-stage` (Direct
   Upload, production branch `main`, no custom domain, no environment variable)
   in the same account, and notes its `pages.dev` origin.
3. When the pull request is approved by every gate and ready to merge, set
   `PAGES_SIGNER_ORIGIN` (that origin) and `PAGES_ACCEPT_PENDING_NOTICES`
   (`true`) in `pages-stage`
   (`gh secret set PAGES_SIGNER_ORIGIN --env pages-stage`, and the same for the
   other). Never paste a value into an issue, a pull request, or a log.
4. Merge. Its push to `main` runs the Pages workflow: `config-stage` builds the
   three documents from one input, and `deploy-stage` deploys the four sites.
5. Verify: the Wrapper's `<site>/environment-config.json` has
   `signingPageOrigin` (the signing page's origin) and `acceptPendingNotices`
   `true`; the verifier's has neither; the signing page's
   `<signer origin>/environment-config.json` is `environment` `preview`,
   `wrapperOrigins` the Wrapper's origin alone, and `acceptPendingNotices`
   `true`; `<signer origin>/` answers the signing page with SP-13's headers (its
   Content Security Policy with `connect-src 'self'` and
   `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and no
   `Cross-Origin-Opener-Policy`); and `<Wrapper origin>/signer/` does **not**
   answer the signing page (the Wrapper's site never serves it). Then, on a
   desktop browser with a test wallet, open a fresh launch, choose "Link a
   wallet" in the menu, sign in the window, and start a round: it starts, and
   its verify page shows check 9, the wallet link, matching.

**A failed configuration job in that window** (a merge or a redeploy between
steps 3 and 4 does not fail: the old workflow ignores the two secrets) means a
value is refused: the job names the input and a code, never the value
(`PAGES_SIGNER_ORIGIN: not-https-origin` or `overlapping-origins`, the same as
the Wrapper's or the verifier's origin;
`PAGES_ACCEPT_PENDING_NOTICES: neither unset nor true`), or the document and
field the Wrapper's validator refuses
(`wrapper document: signing-page-same-site at signingPageOrigin`, a signing page
on the Wrapper's registrable domain; `overlapping-origins`, a game's or an
operator's origin), or the one the signing page's own validator refuses
(`signer document: <code> at <field>`, from
`apps/signing-page/config-check-cli.ts`). Fix the secret and redeploy `main`. To
turn the delegation off again, remove `PAGES_SIGNER_ORIGIN` and redeploy `main`:
the Wrapper's document loses `signingPageOrigin`, so no new session offers it (a
session already open keeps the document it booted with), and the deploy uploads
no signing page; its last deployment stays live but is reached by no Wrapper.

**Production.** Two preconditions, both required, before anyone sets a
production signer secret:

1. **The texts are reviewed.** The consent dialog's, the player messages', and
   the signing page's English texts are staging drafts (W-65, W-69, W-71,
   SP-10); they are reviewed (and changed in a kit release if the review asks)
   before production's `PAGES_SIGNER_ORIGIN` is set. The notice itself is the
   backend's and goes through its own legal review.
2. **The backend is ready.** The backend team confirms that production's first
   backend release is live and accepts `keyDelegation` on a start.

After both, the infrastructure owner creates the production project as in step
2, then sets production's two secrets: `PAGES_SIGNER_PROJECT` (its name) in
`pages-prod` and `PAGES_SIGNER_ORIGIN` (its `pages.dev` origin) in
`pages-prod-config`. Production reads its project name from a secret, as it does
its other two. Never set `PAGES_ACCEPT_PENDING_NOTICES` there: the configuration
job refuses `true` in production mode, even without `PAGES_SIGNER_ORIGIN`, and
so do the validators. Set both secrets before the next release: with
`PAGES_SIGNER_ORIGIN` set and no `PAGES_SIGNER_PROJECT`, `deploy-check` stops
the release before it publishes. The next release's `prod-check` checks the
values before it publishes, and its deploy (or a redeploy by tag) lays out the
signing page with the Wrapper. Until a release vendors an `approved` notice,
production offers no delegation even with these set; the first such release
turns it on at its deploy. Verify as in step 5, with `environment` `production`
and no `acceptPendingNotices: true` anywhere.

**Rolling back.** Roll the Wrapper's and the signing page's projects back
together, to deployments of the same release, never one alone: the Wrapper's
`signingPageOrigin` must name a signing page of its own release. Do not roll the
Wrapper or the verifier back below the release that accepts the backend's
key-delegation additions (the `KEY_DELEGATION_*` codes,
`RoundVerification.keyDelegation`, and the `key_delegation` check) while the
backend emits them in that environment (RFC-006's kit-first rule): ask the
backend team first.

### Roll back or deprecate

- **A bad Wrapper deploy:** roll the Pages projects back to the previous
  deployment ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages),
  Rollback), or, for production, redeploy an earlier release by its tag (the
  "Pages production" workflow, dispatched from `main`, which a running release
  run blocks; a Pages rollback is never blocked). Check that the dispatch's
  `deploy-prod` ran: a dispatch from another branch ends green with nothing
  deployed. Then fix forward here: a changeset, a patch release, and a new
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

<!-- TODO(release, #208): deferred to #208 (owner: TPO, with an org owner for npm; reason: it needs the first published version, and nothing is published yet). Rehearse once: the npm deprecation and dist-tag steps on the first published version, and a Pages rollback. The npm steps cannot be exercised before the first publish; the dry run covers everything up to the publish. -->

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
- **The `prod-check` job failed.** A production value is missing, or production
  would refuse it. Nothing was published, and `publish` never asked for its
  approval. Which job failed says where:
  - `config-check`: a value in `pages-prod-config`. The errors name the input
    and the field with the validator's code or the tool's (`not-production` at
    `environment`: the pins are not production's; `production-cluster` at
    `entropyChainId.<source>`: a `solana` source not on cluster 101;
    `production-quorum` at `minRpcQuorum`: a quorum below 2; `not-https-origin`:
    an origin the deploy's headers step refuses, such as a host with an
    uppercase letter or an `_`), or the headers step's error ("The wrapper
    site's _headers line for Content-Security-Policy is over the Pages limit":
    too many or too long origins for one policy; shorten the lists).
  - `deploy-check`: a setting of `pages-prod` is missing, a project name is not
    a Pages project name, or both name the same project; the error names the
    setting, never its value.

  Fix the secret (`gh secret set <name> --env <environment>`; the value never
  goes into an issue or a log), then "Re-run failed jobs" on the bump merge's
  run within 30 days. A run that names a missing environment creates it,
  unprotected and empty, and fails the same way: protect it and restrict it to
  `main` (Bootstrap step 8) before setting its secrets.

- **The publish path is skipped.** `publish` and the jobs after it run only on a
  release candidate (the bump merge, no changeset pending, a version above 0.0.0
  without its tag) and with the variable `RELEASE_PUBLISH_ENABLED` set to `true`
  (Bootstrap step 8), and only once `prod-check` has passed. `changesets-mode`'s
  notice says which: "nothing to release" or "publishing was off". For the
  latter, re-run the bump merge's run by hand once the variable is `true`,
  within 30 days (Release).
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
- **The production deploy failed after the release** (a `production` job of the
  release run failed). The packages, tags, and the Wrapper's release with its
  tar are done; nothing was deployed, or the deploy failed part-way. Do not
  re-run the release run: when `deploy-prod` failed, "Re-run failed jobs" fails
  at the download once the one-day artifacts of `prod-worker` and `config-prod`
  are gone, and "Re-run all jobs" finds every version tagged ("nothing to
  release"), skips `publish` and every job after it, and ends green with nothing
  deployed. Fix the cause, then dispatch "Pages production" from `main` with the
  release's tag ([Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages),
  Production). A `config-prod` or "Require the Pages settings" failure after
  `prod-check` passed means a value changed in between: fix it as for
  `prod-check`, then dispatch the same way. A `prod-verify` failure (the
  `.sha256` or the attestation) is an incident (Escalation): never deploy around
  it.
- **A dispatch or re-run ended green but nothing deployed.** Open the run: if
  `deploy-prod` (or, on a release run, `publish` and `production`) shows as
  skipped, nothing reached Pages. A "Pages production" dispatch from a branch
  other than `main` skips `release-check` and every job after it: dispatch again
  from `main`. A full re-run of a release run runs `changesets-mode` again,
  which finds every version tagged and ends with "nothing to release", so
  `publish` and every job after it (`production` included) are skipped: dispatch
  "Pages production" from `main` with that release's tag instead.
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
- **A Solana config round fails its tip check** ("could not verify the chain",
  then "this round failed verification"; the round receipt reads "Not
  verified"). Before RFC-007's slice 2 is deployed, every `solana` round does
  (`unsupported-chain-kind`). After it, the shell asked each `solana` endpoint
  `getGenesisHash` and `getSlot` at `finalized`, and, in W-26b's order: an
  endpoint reported another cluster's genesis hash (`chain-id-mismatch`: a URL
  that reaches another cluster; run P-4 on it); fewer than `minRpcQuorum`
  endpoints gave a final slot (`too-few-answered`: an endpoint down, out of
  quota, or refusing the origin, or a call the browser blocked); an endpoint
  that gave a slot gave no genesis hash (`chain-id-unavailable`); or an
  endpoint's final slot was more than `tipLagMargin` slots below the highest
  (`lagging`). In the browser's developer tools, the Network panel shows each
  endpoint's calls and answers, and the Console a CORS or `connect-src` refusal;
  never share a capture that shows a URL. Run the provider checklist again on
  the endpoint at fault ([Solana entropy sources](#solana-entropy-sources)). A
  provider that keeps lagging goes to the backend, whose measurement sets the
  margin (se-backend#471). During the canary, record the cause in its tracking
  issue before the count restarts.
- **A Solana round's check 6 is not matching** on the verify page ("could not be
  verified", or V-7's "this round could not be verified against the chain").
  Before RFC-007's slice 4 is deployed, every `solana` round's check 6 is "could
  not be verified" (`unsupported-chain-kind`). After it, the page shows, per
  endpoint, its genesis hash ("this cluster", "another cluster", or "no answer")
  and its value or the reason it has none (RFC-007, section 4): another cluster
  (P-4); "this provider does not serve slot N", a provider whose history is
  shallower than the round (P-5), that does not serve a just-finalized slot yet,
  or whose long-term storage is unreachable for now (check again); "its ledger
  has a gap at slot N", the provider's own data; "An endpoint gave a block but
  no genesis hash." or "An endpoint gave the genesis hash but no valid block for
  slot N.", a provider answering out of shape; too few values (an endpoint down,
  or blocked as above); or two values that differ, including two endpoints that
  disagree on whether the slot was skipped. Check again once; if it persists,
  take it to the backend with the provider's name and the round id, never a URL.
  During the canary, record the cause in its tracking issue before the count
  restarts.
- **The drift check reports a difference.** Read the run's summary; the findings
  are in
  [The contracts drift job](../specs/client-kit/the-contracts-drift-job.md#what-it-compares).
  When the summary says its list is incomplete, the run log lists every finding.
  A changed document: run the contract sync, unless the kit synced first and the
  environment has not deployed that change yet (the lock's `sourceCommit` is
  newer than what the environment runs; ask the backend). A file not vendored:
  for a new vector or kernel set the kit needs, run the contract sync. A new
  version of a contract (a new name, such as a second Snapshot schema version)
  is not ordinary drift: moving to it is a decision of its own, taken first
  ([the spec](../specs/client-kit/the-contracts-drift-job.md#errors-and-edge-cases));
  then sync only the documents the kit needs. A file not served: the same as a
  changed document, or a file the backend removed, which needs a word with the
  backend maintainers before any sync. A changed vector fails the run: a vector
  is append-only, so ask the backend maintainers which side is wrong before
  syncing; after the first release the kit never edits a vector it released.
- **The drift job could not check an environment.** The summary names the
  environment and the status code or kind of error, never the origin. A timeout,
  a 5xx, or a network error that persists across runs: tell the backend
  maintainers. A 4xx or a manifest it cannot read: the location or the
  manifest's format changed (check the backend's handover, and update the job's
  reader for a new `manifestVersion`). A wrong origin: fix the secret in the
  `contracts-drift` environment.

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
  [ADR-008](../decisions/ADR-008-pages-deploy-with-wrangler.md),
  [ADR-013](../decisions/ADR-013-solana-entropy-sources.md) (accepted),
  [RFC-007](../rfcs/active/RFC-007-solana-entropy-in-the-browser.md) (Solana
  entropy in the browser: section 6's provider requirements, section 9's steps 8
  and 9).
