# ADR-009 — Releases through `changesets/action` in a version job and a publish job on every push to `main`, and production deploys the attested release tar

- Status: accepted; supersedes part of
  [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md) (listed in
  [What this supersedes in ADR-005](#what-this-supersedes-in-adr-005))
- Date: 2026-10-28 (proposed and decided by the human the same day; implemented
  with #133 in `.github/workflows/release.yml` and
  `.github/workflows/pages-prod.yml`, whose implementation choices the human
  accepted on 2026-10-28)
- Deciders: the human maintainer (the release flow, the deploy source, the
  production environment), the infrastructure owner (the production projects,
  the `pages-prod` environments, the token), the org owners (the GitHub and npm
  settings of #154)
- Supersedes: part of
  [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md) (the job
  splits and the manual dispatch; its attestation decisions stand)
- Relates to: [ADR-008](./ADR-008-pages-deploy-with-wrangler.md) (the Pages push
  deploy; its 2026-10-27 amendment note on the production trigger, which this
  ADR specifies; Risks accepted), [ADR-001](./ADR-001-toolchain-and-signing.md)
  (decision 7, the supply-chain minimum), issue #133 (Production), issue #154
  (turning the publish path on)

## Context

ADR-008 deploys staging on every push to `main` and records the human's policy
for production (2026-10-27): **a production deploy runs when the changesets
version pull request is merged**, after the versions are bumped and the
changelogs written. It left #133 to say how the production job recognizes that
merge. ADR-005 (accepted 2026-10-28) made the GitHub release asset the released
tar's home and left #133 to confirm whether production deploys from it.

Before this ADR, `release.yml` ran by hand only. A **version** dispatch runs
`version` (`changeset version`, read-only token) and `version-push` (git only,
`contents: write`), which force-pushes `changeset-release/main`; a person opens
the pull request. A **publish** dispatch runs `build` (repository tooling, no
credential), `publish` (environment `release`, OIDC, `npm publish` of checked
tarballs, no repository tooling), `attest` (environment `attest`), and
`github-release` (`contents: write`, no repository code), which tags the Wrapper
and creates its GitHub release with the tar and its `.sha256`. The merge of the
version pull request runs nothing but the staging deploy, and no release exists
when it merges. Publishing is switched off (#154: `RELEASE_PUBLISH_ENABLED`
unset, trusted publishers and the `attest` environment not configured).

Two facts of GitHub Actions shape the decision: an event caused by the job token
(`GITHUB_TOKEN`) starts no workflow run (except `workflow_dispatch` and
`repository_dispatch`), so a pull request, a tag, or a release made with it
triggers nothing; and a job's outputs are the way a later job of the same run
learns what an earlier one did.

## Decision

Decided by the human, 2026-10-28. Implemented (#133): `release.yml` holds the
release jobs, and `pages-prod.yml` the production jobs (decision 3). The choices
the implementation made, which the human accepted on 2026-10-28, are recorded
below where they belong.

### 1. The release flow: the changesets "version pull request" flow with `changesets/action`

Modeled on the human's public repository `mimshins/containerized-state`
(`.github/workflows/npm-publish.yml`), but split into **three jobs**:
`changesets-mode` and two that each run `changesets/action` in one mode (decided
by the human, 2026-10-28). The release workflow runs **on every push to
`main`**, with **no concurrency group** (decided by the human, 2026-10-28):
GitHub keeps only one pending run per group, so a group would let a later push
cancel the bump merge's waiting run. Each push's run is independent and checks
out its own commit, so the release always publishes exactly the bump merge
commit (called M below).

- **`changesets-mode`** (`contents: read` and `pull-requests: read`, no
  environment, no secret, no repository tooling: the runner's shell, `git`,
  `gh`, and `jq` only): checks out the pushed commit and
  - lists the pending changesets, the `.changeset/*.md` files other than
    `.changeset/README.md`, and outputs `pending` (`true` or `false`);
  - checks, read-only, whether the pushed commit is **the merge of the bump pull
    request**: the pull request associated with the commit in the API has head
    ref `changeset-release/main` and a head repository equal to this repository
    (so a fork's branch of the same name cannot match), and was merged into
    `main` as this very commit (its merge commit is the pushed commit). The
    workflow lists the commit's pull requests with
    `GET /repos/{owner}/{repo}/commits/{sha}/pulls` and checks the head ref, the
    head repository, the base `main`, `merged_at`, and `merge_commit_sha`. A
    second parent cannot serve: the repository squash-merges, so the commit on
    `main` has no second parent;
  - when it is, and no changeset is pending, reads `name` and `version` from
    each publishable package's `package.json` (the five libraries and the
    Wrapper) and looks up each tag `<name>@<version>` with
    `git ls-remote --tags` on the repository's public URL (no registry, no
    token). A version `0.0.0` never counts (it is never released). It outputs
    `release-candidate`: `true` only when the commit is the bump merge, no
    changeset is pending, **and** at least one of those versions has no tag yet.
    Any API or `git` error fails the job, so an error is never read as "nothing
    to release".

  At most one of the next two jobs runs, on the same commit. When neither output
  is `true` (the usual push to `main`: not the bump merge, or every publishable
  version tagged or `0.0.0`), the run does nothing more and ends with a "nothing
  to release" notice. A release candidate while `RELEASE_PUBLISH_ENABLED` is not
  `true` ends the run with a "publishing was off" notice. Later pushes are not
  the bump merge, so they never publish it: the recovery is a **manual re-run of
  M's run** once publishing is enabled. A re-run keeps M's commit but reads the
  repository variables as they are at the re-run, which is why a re-run once
  publishing is enabled publishes. GitHub re-runs a run only within 30 days, so
  the runbook rule is (decided by the human, 2026-10-28): **do not merge a bump
  pull request while publishing is off, and re-run a failed release run within
  30 days.** After that, a library version already on npm stays published but
  never gets its tag or GitHub release, and a version not yet published is
  skipped; the next bump moves past both.

- **`version`** (only when `pending` is `true`; **no environment**;
  `contents: write` and `pull-requests: write`; **no `id-token`**): runs the
  action in version mode (no `publish-script` input). Its `version-script`,
  `tools/release-version.sh`, runs `changeset version` and then the version-file
  guard (`tools/release-version-guard.sh`; see Kept, below); the action commits
  the result on `changeset-release/main` and opens or updates the bump pull
  request, titled `chore: bump versions`, with the accumulated version bumps and
  changelogs.
- **`publish`** (only when `release-candidate` is `true` and
  `RELEASE_PUBLISH_ENABLED` is `true`; environment **`release`**, whose required
  reviewers approve it; `contents: write` and `id-token: write`, and **no
  `pull-requests`** permission): the commit is the bump merge and a version has
  no tag yet, so the run is a release candidate. It checks out the run's commit
  with its tags, and first checks again, with `git ls-remote --tags`, that the
  candidate versions are still untagged (the tags were read when
  `changesets-mode` ran, and the job may have waited for the reviewers; a re-run
  of M's run after a release, or any duplicate, finds them tagged); if every one
  is tagged by now, it ends with an "already released" notice and publishes
  nothing (only its releases step, below, still runs). Otherwise it runs
  `pnpm check` and the release dry run, then the action in publish mode, which
  publishes the packages that have a version not yet on the registry and pushes
  **a git tag for each published package** (tags
  `@intraverse/<package>@<version>`, the Wrapper's
  `@intraverse/se-client-wrapper@<version>` as before), with
  `create-github-releases: false`. Its last step creates **a GitHub release for
  each published package** itself (below).

  The action's `publish-script` is `tools/release-publish.ts --publish` (decided
  by the human, 2026-10-28, with the implementation). After the readiness,
  registry, and tarball checks, it publishes each checked tarball not yet on the
  registry with the **npm CLI of the pinned Node itself**
  (`npm publish --provenance --access public --ignore-scripts`; the job first
  requires npm 11.5.1 or later), and then runs `changeset git-tag`, which tags
  every package whose version has no tag yet and reports the tags to the action.
  It does not use `changeset publish`, which (confirmed from the
  `@changesets/cli` 3.0.3 source) publishes with `pnpm publish` in a pnpm
  workspace and does not create a missing tag for a version it skips as already
  on npm; with `changeset git-tag`, a re-run finishes a release that published
  but did not tag.

  In publish mode the action uses **no pull-request API**: it creates the tags
  at the run's commit (`context.sha`), so `contents: write` is enough. **The
  workflow creates the GitHub releases itself, after checking the tags**
  (decided by the human, 2026-10-28, after review). In v2.1.2 a failed tag push
  (`createRef` at `context.sha`) only logs a warning, and the action then still
  calls `createRelease` with the tag name alone; for a tag that does not exist,
  GitHub creates it at the default branch's head, not at M, so a release and a
  permanent tag could name the wrong commit. So the action runs with
  `create-github-releases: false`, and the `publish` job's last step:
  - requires every tag the action reported (`published-packages`) to exist and
    to point at the run's commit, peeled when annotated; a missing or misplaced
    tag fails the job before any release is created;
  - then creates the release of each publishable version whose tag is on M and
    that has no release yet, with
    `gh release create <tag> --verify-tag --target <M>` (so `gh` can never
    create a tag), titled with the tag, its notes the package's `CHANGELOG.md`
    section for the version (what the action would have written), a prerelease
    for a prerelease version;
  - skips the releases that exist, and also runs when the re-check found every
    version tagged, so **"re-run failed jobs"** on M's run, within GitHub's 30
    days, finishes a partial release. A full re-run ("re-run all jobs") does
    not: it runs `changesets-mode` again, which finds every publishable version
    tagged and ends with "nothing to release", so `publish` never runs; "re-run
    failed jobs" keeps `changesets-mode`'s earlier `release-candidate=true`. (A
    tag whose push failed leaves its version untagged, so either kind of re-run
    pushes it at M, through `changeset git-tag` and the action.)
  - outputs the Wrapper's tag while the Wrapper's release has no tar attached,
    which is what starts the Wrapper's jobs (decision 2), so "re-run failed
    jobs" after a failure there still attests and attaches the Wrapper, and a
    duplicate of a complete release does not. It needs no permission beyond
    `contents: write`.

Because `publish` runs only on a release candidate, **the `release` reviewers
are asked only for a real release**: never for a push that only updates the bump
pull request, never for a push that is not the bump merge, and never for a push
whose publishable versions are all tagged (or `0.0.0`).

A tag reliably marks "released" because of the tag ruleset (#154): release tags
cannot be updated or deleted, only created, so a tag that exists stays. Before
the ruleset covers `@intraverse/*@*`, a deleted tag would make a released
version look unreleased (the publish would then find it on the registry and skip
it).

**Published but not tagged.** If the publish command or the action fails after
`npm publish` and before the tags exist on the repository, the versions are on
npm with no tag. The recovery is a **manual re-run of M's run**: it is still the
bump merge with untagged versions, so `publish` asks the reviewers again; the
publish command skips the versions the registry already holds with the same
bytes, and `changeset git-tag` tags them, so the action pushes their tags and
the releases step creates their releases. A later push does not retry it (it is
not the bump merge). The re-run must come within GitHub's 30 days, as above.

**The Wrapper is private** (`"private": true`, with the changesets setting
`privatePackages.tag: true`): it is never sent to npm, but `changeset git-tag`
tags it, the action lists it in `published-packages`, and the releases step
creates its GitHub release. For the Wrapper, released means tagged: its only
test is the git tag, so `publish` checks out with the tags fetched, or
changesets would take every Wrapper version for unreleased. A re-run of M's run
after a failure before the tags tags the Wrapper and any library already on npm
alike, since `changeset git-tag` tags every version that has no tag.

**Packages that are never released** are in the changesets `ignore` list: the
e2e suite, the reference game, the verify page, and the Pages proxy
(`@intraverse/se-client-pages-proxy`; decided by the human, 2026-10-28, with the
implementation). Without the proxy there, `changeset git-tag` would create a
permanent `@intraverse/se-client-pages-proxy@0.0.0` tag and release, which the
tag ruleset would then keep.

The order is: **version bump (the bump pull request merged), then release and
tags, then the Wrapper's attestation and release assets, then the production
deploy**, in the same run.

The bump pull request gets **no CI**: it is created and updated with the job
token, so no workflow runs on it (accepted by the human). It carries only
versions, changelogs, and the removal of consumed changesets; CI runs on `main`
after the merge, and the release run runs `pnpm check` again before it
publishes. There is no GitHub App and no personal token.

The workflow keeps `permissions: {}` at the top and per-job permissions.
`version` writes the branch and the pull request and can mint no OIDC token;
`publish` writes tags and releases (`contents: write`) and mints the OIDC token
for npm trusted publishing and provenance (`id-token: write`), in the `release`
environment, so trusted publishing keeps requiring `environment: release`
(ADR-005, decision 2). Publishing stays gated by the repository variable
`RELEASE_PUBLISH_ENABLED`.

`changesets/action` is a **new Action**. It joins the Actions allow-list in the
[supply-chain spec](../specs/client-kit/supply-chain.md), pinned by full commit
SHA (ADR-001 decision 7; `tools/actions-allow-list.test.ts`), under the same
rules as ADR-005 decision 1 (publisher, bundled `dist/`, Dependabot's 7-day
cooldown). It is pinned at **v2.1.2**
(`ae32849d5ba541f9ae29e40e22a623bc13562f51`; decided by the human, 2026-10-28,
with the implementation), the line for `@changesets/cli` 3.x. Its inputs and
outputs are kebab-case (`version-script`, `publish-script`, `commit-message`,
`pr-title`, `published-packages`; `create-github-releases` is set to `false`).

The production deploy is a reusable workflow of this repository
(`pages-prod.yml`, decision 3), so the allow-list's exemption for local Actions
(`./.github/actions/...`) is widened to the repository's own reusable workflows
(`./.github/workflows/<name>.yml`), called from a job in `release.yml` only
(decided by the human, 2026-10-28, with the implementation).

### 2. The Wrapper's attestation and release assets, in jobs of their own

Keyed on the `publish` job's `wrapper-tag` output, which its releases step sets
when the Wrapper's tag is on M and its release has no tar attached yet:

- **`wrapper-build`** (`contents: read`, no environment, no secret): at the
  run's commit (the commit the tags point at), the release dry run builds the
  Wrapper artifact twice and requires one digest; it uploads the tar and its
  `.sha256` (ADR-005, decision 5) and outputs the file name and the digest;
- **`attest`** (environment `attest`; `contents: read`, `id-token: write`,
  `attestations: write`; no checkout): attests that name and digest (ADR-005,
  decisions 2 and 3, unchanged);
- **`wrapper-assets`** (`contents: write`, no repository code): downloads the
  tar and its `.sha256`, checks both against the attested digest, and attaches
  them to the Wrapper's GitHub release that the `publish` job created. It
  refuses unless exactly one release has the Wrapper's tag (drafts included),
  and refuses a release that already has those assets. After the upload it
  appends the `gh attestation verify` command to the release's notes (decided by
  the human, 2026-10-28, with the implementation).

The attestation is verified with `gh attestation verify` as ADR-005 decision 4
says. The certificate now records a `push` event instead of a
`workflow_dispatch`; the signer workflow, `--source-ref refs/heads/main`, and
the commit check are unchanged. The workflow file keeps its name, `release.yml`,
so ADR-005's `--signer-workflow` and the trusted publishers stay valid; a rename
would change both (runbook, Bootstrap step 6).

### 3. The production deploy: the attested release tar

After `wrapper-assets`, in the same run (a tag or release made with the job
token would start no other workflow). The production jobs are a **reusable
workflow**, `.github/workflows/pages-prod.yml` (decided by the human,
2026-10-28, with the implementation): `release.yml`'s `production` job calls it
with the Wrapper's new tag after `wrapper-assets`, and a person can dispatch it
from `main` with a tag to redeploy (below). It holds its five jobs once, for
both entry points. Only `deploy-prod` is in the concurrency group `pages-prod`
(`cancel-in-progress: false`), so production deploys never overlap and a staging
push never touches them; `release-check`, `prod-verify`, `prod-worker`, and
`config-prod` are in no group, since jobs of one run in one group would cancel
each other's pending jobs:

- **`release-check`** (`actions: read`; no checkout, no secret): checks the
  tag's shape, refuses a dispatch while a release run is not completed (below),
  and resolves the tag's commit with `git ls-remote`; when the release calls it,
  the tag must be on the run's own commit;
- **`prod-verify`** (`contents: read` and `attestations: read`, the read
  permission `gh attestation verify` is expected to need, to be confirmed on the
  first real run; no environment, no secret, no checkout, no repository code):
  downloads the tar and its `.sha256` from the Wrapper's GitHub release by tag
  (`gh release download`), checks that the `.sha256` names the tar and matches
  it, runs `gh attestation verify` with ADR-005's flags plus `--source-digest`
  the tag's commit, and outputs the digest;
- **`prod-worker`** (`contents: read`, no secret; after `prod-verify`, so the
  attestation proves the tag's commit before any of its code runs; decided by
  the human, 2026-10-28, after review): builds the proxy worker with `tsc` at
  the tag's commit and outputs its digest, as staging does (ADR-008, decision
  4); the worker is not attested;
- **`config-prod`** (`contents: read`; environment `pages-prod-config`, whose
  secrets hold the configuration values; after `prod-verify`, like
  `prod-worker`): builds and validates the two sites' configuration documents at
  the tag's commit in that configuration environment, **which holds no deploy
  credential** (ADR-008, Risks accepted; decided by the human, 2026-10-28, with
  the implementation), and outputs their digests;
- **`deploy-prod`** (`contents: read`, for the lockfile, as on staging;
  environment `pages-prod`, which holds the token, the account id, and the
  production Pages project names, read as that environment's secrets, and has
  **no required reviewer**): runs no repository code, refuses any download whose
  SHA-256 is not the digest its producing job output (the Wrapper tar must be
  `prod-verify`'s), lays out the Wrapper's and the verifier's sites as on
  staging, and runs `wrangler pages deploy` per production project. Production
  serves no reference game; it frames the real game origins.

A manual entry point redeploys a given release by its tag through the same
verification (a redeploy, or a roll back or forward to a released version): a
`workflow_dispatch` of `pages-prod.yml` from `main` with the input `tag` (the
Wrapper's release tag). **The release always wins** (decided by the human,
2026-10-28): `release-check` first checks, read-only (`actions: read`), that no
run of the release workflow is requested, queued, pending, waiting, or in
progress (`GET /repos/{owner}/{repo}/actions/workflows/release.yml/runs` with
each `status`), and refuses if one is, so a redeploy never replaces a release's
pending deploy in `pages-prod`; an API error fails the job. `deploy-prod` does
not repeat the check. **A window remains**: the check and the dispatch's
`deploy-prod` are not atomic, so a release run that starts after the check could
have its pending `deploy-prod` replaced by the dispatch's (GitHub keeps one
pending job per group). If that happens, use "re-run failed jobs" on M's run
within 30 days; after that, redeploy by M's tag. Staging is unchanged: every
push to `main` still deploys `main`'s own build.

The caller's `production` job grants the most the called jobs may ask for
(`contents: read`, `attestations: read`, `actions: read`); each job of
`pages-prod.yml` asks for its own, smaller set.

<!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). The production Pages projects and hostnames, the `pages-prod` and configuration environments, the real operator and game origins, the production verifier origin, the RPC providers, and `tipLagMargin`; hostnames and endpoints are shared out of band, never written in this repository. -->

### 4. Tags and GitHub releases for every published package

Each published package gets a tag and a GitHub release. Only the Wrapper's
release carries assets (the tar and its `.sha256`). The tag ruleset widens from
`@intraverse/se-client-wrapper@*` to **`@intraverse/*@*`**: updating and
deleting those tags is blocked for everyone but the org owners, and creating
them is allowed (#154).

## What this supersedes in ADR-005

Superseded (ADR-005 is not rewritten; it carries a pointer to this ADR):

- **The manual dispatch.** The release runs on every push to `main`, not only by
  hand.
- **The `version` / `version-push` split** (ADR-005 Follow-ups, built with
  #134): `changeset version` and the push of `changeset-release/main` run in one
  job, `version`, which holds `contents: write` and `pull-requests: write`.
- **The `build` / `publish` split** (#158): the publish command runs repository
  tooling in the job that holds the OIDC token and `contents: write`.
- **"No job that holds a write token or an OIDC token runs repository
  tooling"**, for `version` (install and the version command, with
  `contents: write` and `pull-requests: write`) and for `publish` (install and
  the publish command, with `contents: write` and `id-token: write`).
- **The publish-only job running the npm CLI of the pinned Node** (decided
  2026-10-28) as a job boundary: publishing goes through the action's publish
  command. The client is kept: the publish command runs the npm CLI of the
  pinned Node (11.5.1 or later) itself (decision 1), so trusted publishing works
  as specified.
- **ADR-005 decision 2, in part**: the publishing job's permissions
  (`contents: read` and `id-token: write`) become `contents: write` and
  `id-token: write`; and the `attest` job's condition, shared with `publish`
  ("dispatched from `main`, publish enabled"), becomes the `publish` job's
  `wrapper-tag` output.
- **`github-release` creating the Wrapper's tag and release**:
  `changeset git-tag` tags every released package, the action pushes the tags,
  and the `publish` job's releases step creates every release after checking the
  tags; `wrapper-assets` only attaches the Wrapper's files and appends the
  verify command to its notes.

Kept:

- **part of the privilege split**: no job holds both the pull-request write and
  the OIDC token. `version` has no environment and no `id-token`, so the code it
  runs can never publish to npm; `publish` has no `pull-requests` permission;
  and the `release` environment covers `publish` alone;

- the **attestation** of the Wrapper tar: ADR-005 decision 1 (the pinned
  Actions), decision 2 except the parts above (the `attest` job in its own
  environment `attest`, its three permissions, no checkout, and the
  `environment: release` precondition), decision 3 (the subject, the tar's name
  and digest), and decision 4 (the verify command);
- the **digest checks**: the Wrapper built twice with one digest, the `.sha256`
  checked against the attested digest before upload, and every hand-off between
  jobs checked against the producing job's digest;
- the **upload** of the tar and its `.sha256` (ADR-005 decision 5), now in
  `wrapper-build`;
- **`RELEASE_PUBLISH_ENABLED`** gating publishing;
- the **`release` environment and its required reviewers** on the job that
  publishes;
- **npm trusted publishing by OIDC**, with no npm token stored anywhere, and the
  precondition that every OIDC consumer requires `environment: release`;
- the **GitHub release asset** as the released tar's home (ADR-005 open question
  3), now confirmed as production's source;
- the **version-file guard** (only `package.json`, `CHANGELOG.md`, and consumed
  changesets may change), kept as a check after `changeset version` in the
  version command (`tools/release-version.sh` runs
  `tools/release-version-guard.sh`); it runs in the same job, so it is a sanity
  check, no longer an isolation boundary;
- the **refusals of `tools/release-publish.ts`** (a pending changeset, a private
  or `0.0.0` library, a `0.0.0` Wrapper, a Wrapper build other than the dry
  run's, a size budget exceeded, a registry version with other bytes), now in
  the publish command.

## Residual risks and mitigations

- **Repository tooling with write and OIDC tokens.** A compromised development
  dependency, or a malicious change merged to `main`, running in `version` could
  push branches and open or edit pull requests (no tag ruleset applies to
  branches, and the `main` ruleset still requires a code owner's approval to
  merge); because `contents: write` also covers tags and releases, it could also
  pre-create tags `@intraverse/<package>@<next version>` (a denial of that
  release: the tag ruleset lets only the org owners delete them) or create a
  fake Wrapper release with a tar of its own. Running in `publish` it could
  create tags and releases and mint an OIDC token that names `release`, so it
  could publish to npm. Kept to a minimum by:
  - **two jobs**: the code that runs with the pull-request write never holds the
    OIDC token, and the code that holds the OIDC token cannot write pull
    requests;
  - **a fake release cannot pass verification**: production (`prod-verify`) and
    any pull deploy verify the tar with `gh attestation verify`, and `version`
    has no `id-token`, so it cannot attest anything; a pre-created tag is seen
    by `changesets-mode` and `publish`, which then do not release that version,
    and an org owner deletes it;
  - the **`release` environment** on `publish` alone: its required reviewers
    approve the job before it gets the OIDC token, and only a job in `release`
    can satisfy a trusted publisher;
  - **least permissions**: `version` exactly `contents: write` and
    `pull-requests: write`; `publish` exactly `contents: write` and
    `id-token: write`; `changesets-mode` `contents: read` and
    `pull-requests: read`, and no repository tooling; every other job keeps its
    own, smaller set;
  - **lifecycle scripts off**: `pnpm install --frozen-lockfile --ignore-scripts`
    and publishing with `--ignore-scripts`; the tarball check refuses a
    lifecycle script in a published manifest;
  - **separate jobs keyed on `published`**: building the Wrapper, attesting,
    attaching the assets, and the production deploy each run in their own job,
    so the deploy credential and the attestation token never share a job with
    the tooling of `version` or `publish`;
  - `pnpm check` and the dry run before the publish command; the lockfile pins,
    the 7-day minimum release age, and reviewed dependency bumps.

  The `main` ruleset (code-owner approval) remains what keeps a malicious change
  off `main`; organization and repository admins may bypass it.

- **The job token can approve pull requests.** The setting "Allow GitHub Actions
  to create and approve pull requests" lets any job token with
  `pull-requests: write` approve one. A `github-actions[bot]` approval is not a
  code owner's approval, so the `main` ruleset still holds; an org owner
  confirms it (#154).
- **The bump pull request has no CI.** Its content is limited to what
  `changeset version` writes (the version-file guard), and CI runs on `main`
  after the merge, before any publish.
- **The production deploy has no required reviewer** (`pages-prod`): the
  `release` approval of `publish` is the human gate; the deploy refuses any tar
  whose attestation does not verify.
- **No concurrency group on the release workflow.** Two release runs can run at
  once, but only the bump merge M is ever a release candidate, and `publish`
  re-checks the tags, so a duplicate (a later re-run of M's run) stops with
  "already released". Two runs of M at the same moment cannot happen: one push
  gives one run, and GitHub does not re-run a run that is in progress. If it
  ever did, the second publish would skip a version the registry already holds
  with the same bytes or fail on npm's "cannot publish over" refusal (E403), its
  tag push would be a no-op, its duplicate GitHub release would fail in the API,
  its `published` would not be `true`, and no second attest or deploy would run:
  it fails visibly, with no wrong bytes, tags, or deploys.
- **A redeploy can race a release's deploy** in the window described in decision
  3; "re-run failed jobs" on M's run within 30 days, or redeploy by M's tag
  after that.
- **The 30-day re-run limit.** A release run that published nothing because
  publishing was off, or published without tags, is recovered only by re-running
  M's run within 30 days; the runbook rule (above) keeps that from being needed.
  After 30 days, a library version already on npm stays published but never gets
  its tag or GitHub release, and a version not yet published is skipped; the
  next bump moves past both.
- **The proxy worker is not attested.** It is built from the tag's commit and
  digest-checked between jobs, as on staging.
- **A partial release.** A failed publish deploys nothing. A version published
  to npm whose tag was never created is recovered by a manual re-run of M's run
  within 30 days (above), and the reviewers approve again; after that, a library
  version already on npm stays published but never gets its tag or GitHub
  release, and a version not yet published is skipped; the next bump moves past
  both. Packages published before a failure stay on npm untagged until the
  re-run; re-running M's run publishes what is missing (versions already on the
  registry are skipped) and tags what has no tag. A tag push that fails inside
  the action only logs a warning there, but the releases step finds the tag
  missing and fails the job before any release is created, so no release or tag
  can name another commit; a re-run of M's run pushes the tag at M and creates
  the releases. A failed `attest` or `wrapper-assets` leaves the Wrapper's
  release without assets and production unchanged; it is fixed by re-running
  those jobs, never by attesting from elsewhere. A failed deploy is re-run, or
  redeployed by tag.
- **Rollback** is a Pages rollback of each production project, or a redeploy of
  an earlier release by its tag, verified the same way. A pending release
  approval, or even a short "nothing to release" run, blocks redeploy-by-tag
  (its check refuses while a release run is not completed), but not the Pages
  rollback, which is the first path under Rollback.

## Alternatives considered

The options laid out when this ADR was proposed, and not chosen:

- a production job triggered by the push to `main` that bumps the Wrapper's
  version, deploying the shared `main` build (no release or attestation at
  deploy time);
- `workflow_run` on the hand-dispatched release workflow, keeping ADR-005's job
  splits;
- a final job of the hand-dispatched release workflow;
- the merge dispatching the hand-dispatched publish;
- the shared `main` build, or a rebuild at the tag compared with the attested
  digest, as production's source;
- `on: push: tags` or `on: release: published`: a tag or release made with the
  job token starts no run, so they would need a GitHub App or a personal token.

## Consequences / tradeoffs

- **The publish path moves from hand dispatch to every push to `main`.** The
  runbook's version and publish dispatches go away; the person's actions are
  merging the bump pull request and approving the `release` environment for the
  release candidate that follows.
- **Three release jobs decide and do the release**: `changesets-mode` and two
  that each run `changesets/action` in one mode.
- **A new Action** (`changesets/action`) on the allow-list, and two jobs (of the
  three) that run repository tooling with write tokens, one of them with the
  OIDC token (above). The allow-list also exempts the repository's own reusable
  workflows, called from `release.yml` only.
- **A second production environment**, `pages-prod-config`, for the
  configuration values, beside `pages-prod` for the deploy credential and the
  project names; both must exist, protected, before publishing is turned on.
- **Production cannot deploy before #154** is done and the first release exists.
  Staging is unaffected.
- **Settings for #154**: the repository setting "Allow GitHub Actions to create
  and approve pull requests" is turned on (the runbook's Bootstrap step 4; until
  it is, `version` fails when it opens the pull request); the tag ruleset on
  `@intraverse/*@*`; the trusted publishers trust the release workflow in
  `release`.
- **ADR-008**: its production-trigger amendment note is specified here, and its
  statement that the release workflow is unchanged no longer holds. ADR-008 is
  not rewritten.
- **Implemented** (#133): the release workflow, the production workflow
  `pages-prod.yml`, the allow-list row, the changesets `ignore` entry, and the
  tests of the workflows and their scripts (among them
  `tools/release-mode.test.ts`, `tools/release-version-guard.test.ts`,
  `tools/release-assets-guard.test.ts`, `tools/pages-prod-workflow.test.ts`, and
  `tools/actions-allow-list.test.ts`), with the spec, runbook, and memories
  updated. What stays open is the infrastructure owner's (the
  `TODO(hosting, #133)` marker in decision 3) and the settings of #154.

## References

- [ADR-001](./ADR-001-toolchain-and-signing.md),
  [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md),
  [ADR-008](./ADR-008-pages-deploy-with-wrangler.md).
- [specs/client-kit.md](../specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin),
  [specs/client-kit/supply-chain.md](../specs/client-kit/supply-chain.md).
- [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- `mimshins/containerized-state`, `.github/workflows/npm-publish.yml` (the
  model).
- Upstream: the `changesets/action` repository, v2.1.2 (its `published` and
  `published-packages` outputs, `create-github-releases`); the `@changesets/cli`
  3.0.3 source (`changeset publish`, `changeset git-tag`); GitHub Actions
  documentation on events triggered by `GITHUB_TOKEN` and on concurrency; the
  GitHub CLI manual for `gh attestation verify` and `gh release download`.
