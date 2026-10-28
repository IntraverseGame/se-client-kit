# A CI job cannot find a kit package's `dist/`

## When to use

A CI job (`typecheck`, `unit`, `build`, `e2e-fake`) fails because build output
is missing, although the build that makes it reported success:

- the guard before a script fails with "The `<script>` of `<workspace>` reads
  the build output of other workspaces, and these files are missing";
- or, in a script the guard does not cover, a tool cannot resolve a kit package
  (`Cannot find module '@intraverse/se-client-...'`, `TS2307`, or Vite's or
  Vitest's "Failed to resolve import").

This was issue #53. In CI, wireit restored scripts from the GitHub Actions cache
(`WIREIT_CACHE=github`). wireit 0.14.13 deletes a script's output before it
downloads the cached tarball; when the download fails, it logs one `cache-info`
line (`Failed to download GitHub Actions cache tarball: ...`) and then reports
the script as restored from the cache, with no output at all, and records it as
fresh. Every script after it that reads its `dist/` then fails. It was logged in
CI on #102 and reported upstream (google/wireit#1536, fixed in wireit 0.15.0 by
google/wireit#1542; the kit is on 0.15.0 since #143). The maintainers' fix: CI
runs with no task cache (`WIREIT_CACHE=none` in every workflow, and no wireit
cache helper in `.github/actions/setup`), so every job builds what it reads. It
stays off after the upgrade (#143): every CI run is a clean build, with no
third-party cache helper and no cache credentials. The guard before each script
that reads a kit `dist/` stays, and now points at a missing wireit dependency
first.

## Prerequisites

- Read access to the repository's Actions runs (`gh run view` is read-only).
- A worktree with `pnpm install --frozen-lockfile` done, for the local steps.

## Steps

### 1. Read what ran in the job's log

CI sets `WIREIT_LOGGER=simple` (`.github/workflows/ci.yml`), so every script
logs whether it ran or was already fresh. Read the failed job's whole log (every
step, not only the failed one), with the guard's lines kept, so you can see
whether the build ran before the guard (`gh run view <run-id>` lists the jobs
and their IDs):

```sh
gh run view <run-id> --job <job-id> --log |
  grep -E 'Failed to download|Restored from cache|Executed successfully|Already fresh|reads the build output|build output it reads exists|is missing'
```

- No line for the build that owns the missing file, before the guard: the build
  did not run before the script, so a wireit dependency is missing (see
  Troubleshooting).
- `Restored from cache` or `Failed to download`: the job ran with a task cache,
  which CI must not. Check `WIREIT_CACHE` in the workflow's `env` and that
  `.github/actions/setup` starts no wireit cache helper.
- `Executed successfully` for that build: the build ran and still left no file.
  Look at the build's own output and its `output` globs in `package.json`.

### 2. Reproduce it locally

Start from a clean state, as CI does. `pnpm clean:cache` forgets wireit's record
of every script but leaves each `dist/` on disk, and a `dist/` left by an
earlier build can hide a missing dependency (the guard finds the stale file).
Use a fresh worktree, or remove the build output first:

```sh
find packages apps -name dist -type d -not -path '*/node_modules/*' -prune -exec rm -rf {} +
pnpm clean:cache && WIREIT_CACHE=none WIREIT_LOGGER=simple pnpm run <script>
```

A failed restore from a GitHub Actions cache (a run with `WIREIT_CACHE=github`,
such as a reproduction of #53) leaves wireit's record of the build as fresh with
no output: `pnpm build` then reports the build "Already fresh" and skips it
until `pnpm clean:cache`.

## Verification

- The job's log shows each build the script reads as `Executed successfully`
  before the guard's "every kit build output it reads exists" line, and the job
  passes.
- Locally, after removing the build output as in step 2,
  `pnpm clean:cache && WIREIT_LOGGER=simple pnpm build` shows the guard's line
  for each guarded build (the Wrapper's and the verify page's), and then
  `WIREIT_LOGGER=simple pnpm check` shows it for each `typecheck` and `test`
  (the builds are fresh by then, so `pnpm check` does not print their guard
  again). `pnpm check` does not run the e2e suite: run
  `WIREIT_LOGGER=simple pnpm test:e2e` to see its guard's line. The default
  local logger hides a passing script's output.

## Troubleshooting

- **The guard fails and the build it names did not run before it.** A wireit
  dependency is missing. Every guarded script must depend on the build of every
  kit package its guard checks and of every workspace whose output it names by
  path; `tools/kit-dist-workspaces.test.ts` holds the manifests to that, so run
  `pnpm test:tools`.
- **"not linked in `<workspace>/node_modules`".** The install is incomplete:
  `pnpm install --frozen-lockfile`.
- **"its package.json has no exports".** A kit package must name its entry
  points in `exports`; the guard and the tools resolve through it.
- **`lint:ts` fails with `Failed to open file …/packages/<name>/dist/index.js`
  (`No such file or directory`).** Not #53, and not a lint finding: oxlint's
  import plugin follows an import of a kit package through its `exports` into
  its `dist/` and opens the files, and a package build ran at the same time
  (wireit deletes a script's output before it runs). `lint:ts` depends on the
  five package builds so that never overlaps; if it fails this way, check that
  its `dependencies` still name every `./packages/<name>:build`
  (`tools/wireit-edges.test.ts` holds it to that).
- **A Dependabot pull request that bumps an Action fails
  `tools/actions-allow-list.test.ts`.** The Actions allow-list (the table in
  [the supply-chain spec](../../specs/client-kit/supply-chain.md), Pinned
  toolchain) still names the old version and SHA. In the same pull request,
  update that Action's row: the version, and the full commit SHA, re-verified
  against the upstream repository (the release's tag resolves to that commit,
  and the release is at least seven days old). For
  `actions/attest-build-provenance`, also re-read the `action.yml` at the new
  SHA and record the inner `actions/attest` pin it carries under the table
  ([ADR-005](../../decisions/ADR-005-release-attestation-and-artifact-upload.md),
  Supply-chain risk). Never add a new Action this way: that needs a recorded
  decision.

## Escalation

Open an issue with the run ID, the job, the script, and the log lines from step
1 (never a signed cache URL or a token from a log). The kit is on a wireit with
the fix (0.15.0), and CI keeps its task cache off by decision (#143). Turning
wireit's GitHub Actions cache back on in CI is a new decision for the
maintainers: it reverses #143's and must update
[testing and CI](../../specs/client-kit/testing-and-ci.md) with its reason, and
bringing back a cache helper Action is a supply-chain decision too
([ADR-005](../../decisions/ADR-005-release-attestation-and-artifact-upload.md)).

## References

- The guard: `tools/kit-dist.ts`, `tools/kit-dist-fs.ts`, and
  `tools/check-kit-dist.ts`, run first by each workspace's wireit `typecheck`
  and `test`, the Wrapper's `build`, and the e2e suite's `test` (which also
  names the apps' `dist/index.html`).
- [The testing and CI spec](../../specs/client-kit/testing-and-ci.md#task-orchestration-and-caching).
- [The development workflow memory](../../.ai/memories/development-workflow.md).
