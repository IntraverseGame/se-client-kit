# Releasing and publishing the client kit

## When to use

Procedures for this repository, `se-client-kit`
([specs/client-kit.md](../specs/client-kit.md),
[ADR-001](../decisions/ADR-001-toolchain-and-signing.md)): scaffolding the
toolchain, syncing a contract, releasing the packages and the Wrapper bundle,
checking a release, and rolling back or deprecating one. They hold **procedures
only**: this repository is public, so no credential, token, hostname, or account
identifier appears here, and none may be added. Where a value is needed, this
runbook says which secret or setting holds it, by name.

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
   workflow and the real CODEOWNERS. Nothing in it needs a repository secret:
   the CI cache is wireit's GitHub Actions cache mode, which uses the job's own
   cache credentials. The release workflow (`.github/workflows/release.yml`) and
   the release dry run landed with the publishing work (#12); its publish job
   stays off until steps 5 to 8 are done.

   `.github/CODEOWNERS` stays comment-only until the org owners give their
   handles; branch protection (below) is the interim control.

2. **Branch protection or a ruleset** on `main`: require a pull request and
   approvals; require review from code owners; block direct and force pushes; no
   self-approval; do not allow administrators to bypass; require the `ci-ok`
   check.
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
   <!-- TODO(infrastructure owner, #3): the form of the npm credential. Preferred: npm trusted publishing (OIDC) for each of the five packages, trusting this repository, the workflow `release.yml`, and the environment `release`, so no npm token is stored anywhere. Confirm that the pinned pnpm exchanges the OIDC token itself; if it does not, the publish step moves to the npm CLI, which needs a recorded decision. -->
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
   <!-- TODO(#12, ADR-005): split the publish job into a build job without `id-token` and a publish-only job that runs no repository tooling. Must be merged before RELEASE_PUBLISH_ENABLED is ever set. -->
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
   machine). One entry per group: `play-api-document`, `snapshot-schema`,
   `snapshot-vectors-valid`, `snapshot-vectors-invalid`,
   `snapshot-vectors-signature`, `snapshot-vectors-typed-data`,
   `snapshot-vectors-signed-action`, `signing-vectors`. Each has `name` (the
   repository, recorded in the lock), `repo` (your local checkout), `ref` (for
   example the default branch on `origin`) and `path` (the file or directory in
   that repository). The lock records only public names, so the paths are not in
   this repository: the source's own documentation names them, or ask its
   owners. Keep your sources file for the next sync. Copy only the Play and
   verify OpenAPI documents, the Snapshot schema and vectors, and the signing
   vectors; never another surface's document.
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
publishes nothing; its `publish` job runs only when it was started from `main`
with **publish** ticked, the variable `RELEASE_PUBLISH_ENABLED` is `true`
(Bootstrap step 8), and a required reviewer of the `release` environment
approves. Every Action is pinned by full commit SHA; the workflow starts with
`permissions: {}`; `dry-run` gets `contents: read`, and `publish`
`contents: read` and `id-token: write` (provenance and trusted publishing). Both
release jobs use the setup action with `cache: "false"`: no wireit cache helper
(which holds the job's cache credentials) and no pnpm store cache, so nothing is
restored from a cache into a release build. Lifecycle scripts stay off
throughout (`allowBuilds`, `--ignore-scripts`, and the tarball check refuses any
lifecycle script in a published manifest).

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
   <!-- TODO(#12): the version pull request job (decided: option A). A job of the release workflow with `contents: write` runs `changeset version` with the real changelog generator and the job's `GITHUB_TOKEN`, and pushes the result to a `changeset-release/main` branch; a person opens the pull request from that branch, so Actions never create a pull request (Bootstrap step 4) and no new Action is needed. Not built yet. -->
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
   <!-- TODO(#12): tag the release and attach the Wrapper artifact, its `.sha256`, and its build-provenance attestation to a GitHub release, and upload the dry run's artifact from CI. This needs `contents: write` and `attestations: write`; an ADR to come proposes `actions/attest-build-provenance` and `actions/upload-artifact` for it (decided; not added before that ADR is accepted). -->
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
5. It writes to `--out` the artifact and its `.sha256`, the five tarballs, and
   `release-dry-run.json` (source commit, versions, tarball hashes, digests,
   problems), and prints the same summary (in CI, also to the job summary).

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
bundle (no test or per-environment build) and contains no vector.
<!-- TODO(#12): the bundle's size budget. -->

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
5. **Promotion** to an environment is done on the SuperEngine side, by its
   deploy job, which pulls the released digest
   <!-- TODO(infrastructure owner): the repository, protected environment, and procedure of the deploy job; the hosting. -->
   After it, play one round in that environment from a test launch (the launch
   page URL, then `#`, then the bare launch code), and check there is no console
   error, the address bar no longer shows the code once the page has loaded, and
   a reload shows "Your session has ended" (the code is single use). Until the
   Play API's redeem answer carries `gameOrigin` and the kit vendors it, the
   Wrapper mounts no game, so a round cannot be played to its end there.

### Roll back or deprecate

- **A bad Wrapper release:** the SuperEngine side repoints the environment to
  the previous released digest (the digest in that release's notes and
  `.sha256`). The bundle store is content-addressed, so the old digest is still
  there. Then fix forward here: a changeset, a patch release, and a new digest.
  Nothing in this repository is rolled back; a released artifact is never
  rebuilt in place.
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

<!-- TODO(#3, #12): verify the npm deprecation and dist-tag steps once, on the first published version, and the Wrapper repoint once the SuperEngine deploy job exists. Neither can be exercised before the npm organization, the `release` environment, and the deploy job exist; the dry run covers everything up to the publish. -->

### Rotate the npm credential

If the release uses a stored npm token (rather than trusted publishing):

1. An org owner creates the replacement credential in npm with the narrowest
   scope (publish for the kit's packages only), and writes it into the `release`
   environment secret. It is never pasted in a chat, an issue, or a log.
2. Run a release of a trivial change to prove the new credential works.
3. Revoke the old credential in npm.
4. Record the date (the secret **name** and date only) with the org owners'
   access notes.

<!-- TODO(infrastructure owner): the rotation schedule, and whether a stored token is used at all. -->

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
and rotate the credential; have the SuperEngine side repoint environments to a
known-good digest; and consider anything that was committed as published (it
cannot be taken back once cloned). An outside finding is reported through
`SECURITY.md`.

## References

- [specs/client-kit.md](../specs/client-kit.md),
  [specs/wrapper.md](../specs/wrapper.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md).
