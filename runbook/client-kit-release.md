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
   cache credentials.

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
5. **The publishing environment**, for example `npm-publish`: required reviewers
   designated by the org owners, a deployment-branch restriction to `main`. The
   publishing credential, if one is needed, is a secret of this environment
   only, never a repository-level secret.
   <!-- TODO(infrastructure owner): the form of the npm credential (trusted publishing from the release workflow needs no stored token), the npm organization, and its scope. -->
6. **npm:** claim the `intraverse` organization (intended scope `@intraverse`,
   packages `@intraverse/se-client-<name>`, decided in ADR-001). It is not
   claimed yet; this step is part of the publishing work (#12). It is owned by
   the org owners, not a person; two-factor required.

### Sync a contract into the kit

Run by a person with access, whenever a contract the kit pins changed at its
source (the drift check says so):

A sync touches **one package**, `contracts` (`packages/contracts/`).

1. Fetch the source repositories (`git fetch`) so the refs you name are current.
   The working trees do not matter: the sync reads committed files.
2. Write a sources file **outside this repository** (it holds paths on your
   machine). One entry per group: `snapshot-schema`, `snapshot-vectors-valid`,
   `snapshot-vectors-invalid`, `signing-vectors`. Each has `name` (the
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
   request.
4. Run `pnpm exec tsx tools/generate-contracts.ts --write` to regenerate the
   types and the vector catalog, then `pnpm check`. Vectors stay on the
   test-only entry; the lint rule, `check:contracts`, and `check:build-output`
   catch an import from non-test code or a vector in an output.
5. Open a pull request. In the description, say what changed and why; the
   reviewers check every copied file against the never-public checklist.

### Release

The kit uses changesets.

1. A pull request that changes a published package or the Wrapper includes a
   changeset (`pnpm changeset`) naming the packages and the bump (major for a
   break, minor for an addition, patch for a fix) and a note for the release. A
   change to a contract's version (a new Play prefix, a new Snapshot schema) is
   a **major**.
2. On merge to `main`, the release workflow opens or updates a **version pull
   request** that applies the changesets (versions and changelogs). Review it:
   the versions, the changelogs, and that the lock file's contract entries match
   what the notes say. The changelogs come from `@changesets/changelog-github`
   (repository `IntraverseGame/se-client-kit`), which calls the GitHub API when
   `changeset version` runs, so that job needs a `GITHUB_TOKEN`: the token the
   Actions runtime provides to the release job, with the least permissions the
   job needs (to open the version pull request), passed to the step as an
   environment variable. It is never a stored secret or a personal token, and it
   is never committed. Nothing else needs it: install, build, and
   `changeset status` work offline. The release workflow does not exist yet
   (#12).
3. Merging the version pull request starts the **publish** job in the
   `npm-publish` environment. A required reviewer approves the deployment. The
   job builds from the lockfile with `--frozen-lockfile`, publishes each changed
   package **with provenance**, and builds the Wrapper release bundle with its
   integrity manifest and attestation, attaching them to the GitHub release.
4. Record in the release notes the contracts the release was built against: the
   Play API prefix, the Snapshot schema id, and the signing vector set.

### Verify before and after

Before publishing (in the version pull request's CI): all required jobs green;
the tarball content check (arriving with the first release build) shows each
published package contains its `README.md` and `LICENSE` and no test-only entry;
the contract hashes match the lock; the bundle's size budget holds; the bundle
is the unmodified bundle (no test or per-environment build) and contains no
vector.

After publishing:

1. **npm provenance:** for each package, the version's page shows the provenance
   statement linking the commit and the workflow run; or run
   `npm audit signatures` against the installed package.
2. **Bundle:** download the release bundle, recompute the SHA-256 of every file
   and compare with the manifest; verify the attestation with the GitHub CLI
   (`gh attestation verify`) against this repository.
3. **Reproduce:** build the same commit with the same lockfile and compare the
   manifest with the release's. A difference is an incident (see Escalation).
4. **Compatibility:** the release notes' contract versions match what the
   backend serves in the target environment. Do not promote a Wrapper whose Play
   prefix or Snapshot schema the backend does not serve.
5. **Promotion** to an environment is done on the SuperEngine side, by its
   deploy job, which pulls the released digest
   <!-- TODO(infrastructure owner): the repository, protected environment, and procedure of the deploy job; the hosting. -->
   After it, play one round in that environment from a test launch, and check
   there is no console error.

### Roll back or deprecate

- **A bad Wrapper release:** the SuperEngine side repoints the environment to
  the previous released digest. The bundle store is content-addressed, so the
  old digest is still there. Then fix forward here.
- **A bad npm version:** do not unpublish a version others may depend on. Run
  `npm deprecate` on the version with a message that names the fix, publish a
  patch, and record both in the changelog. Unpublish only a version that
  contains a secret or malicious code, and only an org owner, within npm's
  rules, as part of the incident below.
- **A contract mismatch** (the backend moved): sync the contract, release a
  patch or minor, promote; until then keep the previous Wrapper digest in place.

### Rotate the npm credential

If the release uses a stored npm token (rather than trusted publishing):

1. An org owner creates the replacement credential in npm with the narrowest
   scope (publish for the kit's packages only), and writes it into the
   `npm-publish` environment secret. It is never pasted in a chat, an issue, or
   a log.
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
  the `npm-publish` environment.
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
