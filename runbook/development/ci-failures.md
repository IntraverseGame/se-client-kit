# A CI job cannot find a kit package's `dist/`

## When to use

A CI job (`typecheck`, `unit`, `build`, `e2e-fake`) fails because build output
is missing, although the build that makes it reported success:

- the guard before a script fails with "The `<script>` of `<workspace>` reads
  the build output of other workspaces, and these files are missing";
- or, in a script the guard does not cover, a tool cannot resolve a kit package
  (`Cannot find module '@intraverse/se-client-...'`, `TS2307`, or Vite's or
  Vitest's "Failed to resolve import");
- and a rerun of the failed jobs on the same commit passes.

This is issue #53, which stays open. The likely cause has been reproduced
locally but not yet seen in a CI log. In CI, wireit restores a script from the
GitHub Actions cache (`WIREIT_CACHE=github`). wireit 0.14.13 deletes the
script's output before it downloads the cached tarball; when the download fails,
it logs one `cache-info` line and then reports the script as restored from the
cache, with no output at all. The build's success is then wrong, and every
script after it that reads its `dist/` fails. A local reproduction (a fake cache
service whose download fails) shows exactly that; the one CI occurrence so far
matches the symptom, but it was logged with the default logger, which drops the
`cache-info` line. The maintainers' decision: keep the guard and the verbose
log, record each occurrence, and report the bug to wireit (a failed download
should be a cache miss, so the script runs).

## Prerequisites

- Read access to the repository's Actions runs (`gh run view` is read-only).
- A worktree with `pnpm install --frozen-lockfile` done, for the local steps.

## Steps

### 1. Find the failed download in the job's log

CI sets `WIREIT_LOGGER=simple` (`.github/workflows/ci.yml`), so every script
logs whether it ran, was restored from the cache, or was already fresh, and
every `cache-info` message is kept.

```sh
gh run view <run-id> --log-failed | grep -E 'Failed to download|Restored from cache|Executed successfully'
```

The signature of #53 is a pair of lines for the same build:

```text
ℹ️ [packages/snapshot:build] Failed to download GitHub Actions cache tarball: ...
✅ [packages/snapshot:build] Restored from cache
```

followed by the guard's message (or a resolution error) naming a file of that
build's `dist/`.

### 2. Rerun the failed jobs

The cache entry itself is sound (the rerun restores the same entry), so rerun
only the failed jobs:

```sh
gh run rerun <run-id> --failed
```

Rerunning starts a new run attempt; it needs write access to Actions, which a
reviewer or maintainer has.

### 3. Record the occurrence

Add a comment to issue #53 with the run ID, the job, the script, and the
`cache-info` line, so the decision on a lasting fix rests on logged occurrences.
Never paste a signed cache URL or a token from the log.

### 4. Locally

The local cache (`.wireit/`) cannot fail this way, and wireit notices output
that was deleted by hand and restores or rebuilds it. A failed restore, though
(a run with `WIREIT_CACHE=github`, such as a reproduction), leaves wireit's
record of the build as fresh with no output: `pnpm build` then reports the build
"Already fresh" and skips it, and every script after it fails until the record
is forgotten. Forget it and rebuild:

```sh
pnpm clean:cache && pnpm build
```

## Verification

- The rerun's log shows the build as restored from the cache (or executed) with
  no `Failed to download` line before it, and the job passes.
- Locally, `pnpm clean:cache && pnpm build` then
  `WIREIT_LOGGER=simple pnpm check` passes and shows the guard's "every kit
  build output it reads exists" line for each guarded script (the default local
  logger hides a passing script's output).

## Troubleshooting

- **The guard fails with no `Failed to download` line before it.** The build did
  not run before the script: a wireit dependency is missing. Every guarded
  script must depend on the build of every kit package its guard checks and of
  every workspace whose output it names by path;
  `tools/kit-dist-workspaces.test.ts` holds the manifests to that, so run
  `pnpm test:tools`.
- **"not linked in `<workspace>/node_modules`".** The install is incomplete:
  `pnpm install --frozen-lockfile`.
- **"its package.json has no exports".** A kit package must name its entry
  points in `exports`; the guard and the tools resolve through it.
- **The same failure on every rerun.** Not #53 (a download fails at random).
  Look at the build's own output and its `output` globs in `package.json`.

## Escalation

If the failure recurs often enough to slow merges, raise it on issue #53 with
the recorded occurrences. A change to how CI uses the cache, or a patch to
wireit, is a decision for the maintainers, and a patch or a dependency change
needs a recorded decision first
([ADR-001](../../decisions/ADR-001-toolchain-and-signing.md)).

## References

- The guard: `tools/kit-dist.ts`, `tools/kit-dist-fs.ts`, and
  `tools/check-kit-dist.ts`, run first by each workspace's wireit `typecheck`
  and `test`, the Wrapper's `build`, and the e2e suite's `test` (which also
  names the apps' `dist/index.html`).
- [The testing and CI spec](../../specs/client-kit/testing-and-ci.md#task-orchestration-and-caching).
- [The development workflow memory](../../.ai/memories/development-workflow.md).
