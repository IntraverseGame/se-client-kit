# The contracts drift job

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract): rule 3 of
[How the kit gets its contracts](./how-the-kit-gets-its-contracts.md).

## Purpose

The kit vendors each contract file from a pinned commit (rule 1), and the
`contracts` job checks offline that the copies match `contracts.lock.json` (rule
2). That proves the copies are what the kit pinned, not that they are what the
backend serves. The `contracts-drift` job closes that gap: on a schedule, it
reads the manifest the backend publishes on each environment's public origin and
compares every entry of the lock with it, by name and SHA-256.

It reads public files only, holds no credential for any repository, and changes
nothing: it reports, and a person runs the sync
([runbook](../../runbook/client-kit-release.md#sync-a-contract-into-the-kit)).
It is not a test. It is never part of `pnpm check`, of `ci-ok`, or of the
release.

## Scope

In scope: the lock entries whose source is the backend, which publishes them:
the Play and verify OpenAPI documents, the Snapshot schema `se.snapshot/1` and
its vectors (`valid/`, `invalid/`, `signature/`, `typed-data/`,
`signed-action/`), and the fairness kernel's public sets (`kernel/public/v1/*`).

Out of scope:

- **The signing vectors** (`test/vectors/signing.json`). The contracts
  repository owns and releases them, and the backend does not publish them. The
  job lists their entry as not covered.
  <!-- TODO(contracts, #138): whether the contracts repository publishes test/vectors/signing.json at a public location with a content hash; until it does, that entry's drift is checked by the person who runs the sync. -->
- **The sync itself.** The job opens no pull request and copies nothing. The
  sync still reads committed files from a local checkout at a ref (rule 1), so
  the lock keeps naming the exact source commit.
- **The backend's own check** of this repository's public lock file, which stays
  as it is.

## Where the contracts are published

The backend serves each file it publishes, and a manifest that lists them, from
the public origin of each environment, without authentication. The deployment
serves the files it was built from, so what a location returns is the contract
that environment runs. Each file is served as the exact bytes committed at its
source, the bytes the kit's sync copies: no environment rewrites a file (for
example by adding an OpenAPI `servers` block or its own host), so one file has
one SHA-256 in every environment.

<!-- TODO(contracts, #138): the backend hands over the locations (planned by 2026-11-27). Fill in each location below as handed over, confirm each against what staging serves, and confirm that production's edge serves the same paths. Confirm with the handover that the served bytes are the committed source bytes, with no per-environment rewriting (such as an OpenAPI `servers` block), and that a manifest hash is of the decoded body (after any content encoding is removed). -->

| Published file                                       | Location (a path on the environment's public origin)                                                                                     | Name in the manifest (the lock's `sourceName`) |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| The manifest                                         | <!-- TODO(contracts, #138): the manifest's path. -->                                                                                     | not listed                                     |
| The `/play/v1` OpenAPI document                      | <!-- TODO(contracts, #138): the path. -->                                                                                                | `play/v1 OpenAPI document`                     |
| The `/verify/v1` OpenAPI document                    | <!-- TODO(contracts, #138): the path. -->                                                                                                | `verify/v1 OpenAPI document`                   |
| The `se.snapshot/1` schema                           | <!-- TODO(contracts, #138): the path. -->                                                                                                | `se.snapshot/1 schema`                         |
| An `se.snapshot/1` vector                            | <!-- TODO(contracts, #138): the path pattern (by class and file). -->                                                                    | `se.snapshot/1 vectors/<class>/<file>`         |
| A public set of the fairness kernel, kernelVersion 1 | <!-- TODO(contracts, #138): the path pattern (by set). -->                                                                               | `kernel/public/v1/<set>`                       |
| The `key-delegation/v1` notices                      | `key-delegation/v1/notices.json` under the backend's published contracts location <!-- TODO(contracts, #138): the location's prefix. --> | `key-delegation/v1 notices`                    |
| The `key-delegation/v1` vectors                      | `key-delegation/v1/vectors.json` under the same location                                                                                 | `key-delegation/v1 vectors`                    |

The job reads the manifest only: a file's location matters to a person who reads
it, not to the comparison, which goes by name.

**Versions.** Every published file belongs to one version of its contract, which
its name states: `play/v1`, `verify/v1`, `se.snapshot/1`, `kernel/public/v1`, or
`key-delegation/v1`. Within a version a file changes only additively (rule 4):
it keeps its name and location, and its SHA-256 changes. A breaking change is a
new version under a new name and location, and the old version's location keeps
serving through its deprecation window
([Errors and edge cases](../client-kit.md#errors-and-edge-cases)).

## The manifest

<!-- TODO(contracts, #138): confirm the manifest's shape below against the backend's handover, and that every name the backend publishes fits the name grammar below. -->

A JSON object:

- `manifestVersion`: the integer 1. A change a reader of version 1 could not
  read raises it.
- `files`: an array with one entry per published file, the manifest itself
  excepted. Each entry has `name` (the public name, as in the table above),
  `path` (the absolute path on the same origin), and `sha256` (the SHA-256 of
  the exact bytes that path returns, as the decoded body: after any content
  encoding such as gzip is removed; 64 lowercase hex digits). These are the
  committed source bytes, the same in every environment. No two entries share a
  `name` or a `path`.

**The name grammar.** A `name` is 1 to 200 characters, each an ASCII letter, a
digit, a space, `.`, `/`, `-`, or `_`, and its first character is a letter or a
digit (`^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,199}$`). Every name the lock pins fits it
(for example `play/v1 OpenAPI document`, `se.snapshot/1 vectors/valid/<file>`,
`kernel/public/v1/seed`). The grammar keeps what the job prints from the
manifest to characters that cannot open an annotation command, a Markdown or
HTML construct, or a new line.

The job ignores members it does not know (a new optional member is additive). It
refuses, as a manifest it cannot read: a body that is not JSON, a
`manifestVersion` other than 1, a `files` that is not an array, an entry without
a string `name`, `path`, or `sha256`, a `name` that breaks the name grammar, a
`path` that does not start with `/`, a `sha256` that is not 64 lowercase hex
digits, and two entries with one `name` or one `path`. A manifest with one bad
entry is refused whole: the job prints nothing from it, the bad entry included.

## What it compares

Its inputs are `packages/contracts/contracts.lock.json` at the commit of `main`
the run checked out, the groups of `tools/contracts-groups.ts` (which entries
are vectors), and the manifest of each environment. It matches each lock entry
whose `source` is the backend repository (`source: "se-backend"` in the lock)
with the manifest entry of the same name (`sourceName` equals `name`) and
compares their SHA-256. It does not download the files, and it does not compare
the lock's `sourceCommit`: the manifest names no commit.

| Finding          | When                                                                                                         | Severity |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| in sync          | a pinned name is served with the same SHA-256                                                                | none     |
| changed document | a pinned OpenAPI document, the Snapshot schema, or the key-delegation notices is served with another SHA-256 | warning  |
| changed vector   | a pinned vector file, kernel set, or the key-delegation vectors is served with another SHA-256               | failure  |
| not served       | a pinned name is not in the manifest                                                                         | warning  |
| not vendored     | a name in the manifest is not pinned                                                                         | warning  |
| not covered      | a lock entry whose source is not the backend (the signing vectors)                                           | notice   |

- **A changed document** is a change within its version, additive by rule 4: the
  kit syncs it. It is also what the job sees when the kit synced first and the
  environment has not deployed that change yet (the kit-first order), so it is a
  warning.
- **A changed vector** breaks the rule that vectors are append-only: the served
  file was edited, or the kit's copy is wrong. Before the first release the
  backend may still edit a vector (rule 1's `--allow-vector-change`), and the
  failure stays until the kit has synced it and the environment serves it.
- **Not served**: the kit synced a file the environment has not deployed yet
  (kit first), or the backend removed the file or retired its version, which a
  released version never does. The job cannot tell the two apart, so it is a
  warning and the person who reads it checks which.
- **Not vendored**: a new vector, a new kernel set, or a new version of a
  contract. The kit syncs what it needs; a new version is a decision of its own.

## When it runs

- Once a day, on a schedule (`schedule`, at a fixed minute that is not on the
  hour), and on demand (`workflow_dispatch`), from `main` only.
- Never on a pull request or a push: a sync pull request is often ahead of the
  deployments (kit first), and the answer depends on what is deployed, not on
  the change.
- A drift report never blocks a merge, a release, or a deploy.

## The environments it checks

Staging and production, each by the public origin of its API (`https:`, the
host, and an optional port, with no path, so no trailing `/`). The two origins
are secrets of the GitHub environment `contracts-drift`,
`CONTRACTS_ORIGIN_STAGING` and `CONTRACTS_ORIGIN_PRODUCTION`. They are not
credentials: they are secrets so that no hostname is written in this repository
or in a public run log (Actions masks a secret's value). The environment allows
`main` only and needs no reviewer, since the job deploys nothing.

<!-- TODO(contracts, #138): the public origin of each environment's API, given to the org owners out of band and never written here; and whether production serves the files before the go-live or only from it. -->

- An environment whose secret is unset is skipped, with a notice in the summary.
  A run with neither set fails: it checked nothing.
- An origin that is not an `https:` origin (another scheme, a path, a trailing
  `/`, a query, a fragment, or user information) fails that environment before
  any request is made. A trailing `/` is refused, not trimmed, as the Pages
  deploy refuses it in its origin secrets.
- One environment's failure never stops the other's check.

## Requests

- One `GET` of the manifest per environment per run, with
  `Accept: application/json` and a `User-Agent` that names the job
  (`se-client-kit-contracts-drift`). No cookie, no `Authorization`, no
  credential of any kind.
- A redirect is an error (`redirect: "error"`). A request times out after 30
  seconds. A network error, a timeout, or a 5xx is retried once, 30 seconds
  later; a 4xx is not retried. A body over 1 MiB is refused: the job counts the
  bytes as it reads the body and stops at the limit, whatever `Content-Length`
  says (the header may be absent or wrong).
- The body is data: parsed as JSON and checked as above, never evaluated,
  written to the repository, or echoed.

<!-- TODO(contracts, #138): whether the backend's edge challenges, blocks, or rate-limits requests from GitHub-hosted runners to these paths, and whether it expects a particular User-Agent. -->

## What it reports

- **The run log** is the complete record: one line per finding other than in
  sync, with the environment, the finding, the name, the two hashes, and the
  commit, as in the summary below. Each line starts with the environment label,
  so no line can start a workflow command.
- **The job summary.** Per environment: whether it was checked, skipped, or
  could not be checked; the count of each finding (always complete); and one row
  per finding other than in sync: the finding, the name, the kit's SHA-256 and
  the served one (each its first 12 hex digits), and the lock's `sourceCommit`
  (its first 7). The name and the served hash come from the manifest, so they
  are printed only after the manifest passed its checks (the name grammar, 64
  hex digits); the other values come from the lock, which is public already.
- **The summary is bounded.** GitHub refuses a step summary over 1 MiB, and the
  job still passes, so a summary that is too large would vanish without a sign.
  The job writes at most 500 rows per environment, failure findings first, then
  warnings, then notices, each kind by name. A row is at most 400 bytes (a name
  of at most 200 characters, fixed-length hashes and commit), so the whole
  summary stays under 512 KiB. When rows are cut, that environment's section
  says so in its heading: the list is incomplete, how many findings of each kind
  are not listed, and that the run log lists all of them. The annotation of each
  kind that lost rows says the same. A run that passes with warnings never looks
  complete when rows were cut.
- **Every cell is escaped for Markdown and HTML.** The name is written as a code
  span (one backtick on each side): the name grammar allows no backtick, `|`,
  `\`, `<`, or line break, so the span cannot close early, split the cell, or
  hold markup, and nothing in a code span is autolinked (a name such as
  `www.example.com` stays text) or read as a character reference. The writer
  checks the name grammar again before it writes a name, and refuses a name that
  breaks it. In every other cell, each character other than an ASCII letter, a
  digit, a space, `.`, `/`, or `-` is written as a numeric character reference
  (`&#NN;`). So no cell can add a column, a link, an image, or markup.
- **Annotations, grouped by kind.** GitHub keeps at most 10 warning and 10 error
  annotations per step, so the job writes one annotation per environment and
  finding kind, not one per finding: `::warning::` for a warning kind,
  `::error::` for a failure kind or an environment it could not check, and
  `::notice::` for a notice or a skipped environment. Each names the
  environment, the finding, and its count, and points to the summary (and, when
  the summary cut that kind's rows, to the run log); that is at most 6 warnings
  (three kinds), 4 errors, and 4 notices for the two environments. Every
  annotation's data is escaped as the workflow commands require (`%` as `%25`,
  `\r` as `%0D`, `\n` as `%0A`) before it is written.
- **The run fails** when any environment has a failure finding or could not be
  checked: a network error or timeout after its retry, a 4xx or 5xx, a body over
  the limit, or a manifest it cannot read (above). It also fails when neither
  origin is set. The summary tells "could not check" apart from drift. Otherwise
  the run passes, warnings included.

GitHub notifies a failed scheduled run as it does any other; the job writes no
issue, comment, or pull request.

## Errors and edge cases

- **The manifest is briefly behind.** Between a backend merge and its deployment
  the environment serves the previous files. That is the right answer to "what
  does this environment serve", and the next run sees the deployment.
- **The kit is ahead.** After a kit-first sync, the job reports a changed
  document or a not served name until the environment deploys it (warnings).
- **A new version appears** (a new name such as a second Snapshot schema
  version): not vendored, a warning. Moving to it is a kit change of its own.
- **The manifest version rises.** The run fails (a manifest it cannot read)
  until the job's reader is updated to the new version.
- **Both origins unset**, before the environments are configured: the run fails.
  The workflow lands with the secrets set (runbook).

## Security

- The job's `permissions` are `contents: read` only, and it checks out with
  `persist-credentials: false`. It holds no token but the default read-only
  `GITHUB_TOKEN`, and no credential for any repository or service. Every Action
  is pinned by full commit SHA, and it installs through the local setup action
  (frozen lockfile, lifecycle scripts off), like every other job
  ([Supply chain](./supply-chain.md)).
- It never prints an origin, a request or response header, or any part of a body
  other than a validated name and hash (a manifest entry's `name` that passed
  the name grammar, and its `sha256` that is 64 hex digits). An error names the
  environment (`staging` or `production`) and the status code or the kind of
  error.
- What it fetches is untrusted data. Nothing fetched is executed, imported,
  written to the working tree, or uploaded as an artifact.

## Observability

The job emits its run log, its job summary, and its annotations, all public.
They hold the environment labels, the public names, the hashes, and the lock's
commits, and never an origin, a header, or any part of a body other than a
validated name and hash. It emits no telemetry.

## Implementation

- The comparison is a pure function in `tools/` over the lock entries, the
  groups, and a parsed manifest, returning the findings. A second pure function
  parses and checks a manifest, and a third writes the log lines, the summary,
  and the annotations with their escaping and the row cap. Their unit tests
  (`pnpm test`, hermetic, no network, no real clock) cover every finding and its
  severity, every manifest refusal, the ignoring of an unknown member, the not
  covered signing vectors, the escaping (a name such as `www.example.com`
  included), the summary's row cap and how it marks a cut list, and that no
  origin appears in the report.
- A command-line script, `tools/check-contracts-drift.ts`, reads the origins
  from the environment, fetches the manifests, and writes the log lines, the
  summary, and the annotations. Its request layer takes `fetch`, the clock, and
  the timers (`setTimeout` and `clearTimeout`, or an injected `sleep` and an
  `AbortSignal` factory) as parameters, so the tests drive the 30-second timeout
  and the 30-second retry delay with fakes and never wait or reach the network.
  The root script `pnpm run contracts:drift` runs it
  (`tsx tools/check-contracts-drift.ts`); it is a plain script, not a wireit
  script, and not part of `pnpm check`.
- The workflow `.github/workflows/contracts-drift.yml` runs
  `pnpm run contracts:drift`, as above. It adds no dependency.

Acceptance criteria:

1. A lock and a manifest that agree give a passing run with every backend entry
   in sync and the signing vectors not covered.
2. Each finding of the table above is produced by its case, with its severity,
   and only a failure finding or a check that could not be made fails the run.
3. Each manifest refusal above fails that environment as could not check, and
   the other environment is still checked.
4. A redirect, a 4xx, a 5xx after its retry, a timeout after its retry, and a
   body over 1 MiB (counted while reading, with a wrong or absent
   `Content-Length`) each fail that environment as could not check; the tests
   use an injected `fetch`, clock, and timers, and take no real time.
5. An unset origin is skipped with a notice; with both unset the run fails.
6. No origin, header, or part of a body other than a validated name and hash
   appears in the log, the summary, or an annotation.
7. The workflow runs on `schedule` and `workflow_dispatch` only, with
   `contents: read`, in the `contracts-drift` environment, and is not part of
   `ci-ok`.
8. A manifest with a `name` that breaks the name grammar (a character outside
   it, such as `%`, `|`, `` ` ``, `<`, `:`, a carriage return, or a new line; an
   empty name; or a name over 200 characters) is refused whole, and nothing from
   it is printed.
9. Annotation data is escaped (`%`, `\r`, `\n`), and every summary cell is
   escaped for Markdown and HTML (the name as a code span, every other cell by
   character reference); a test feeds both writers the characters they escape
   and checks the output. A not vendored name `www.example.com` is written as
   `` `www.example.com` ``, and no table cell outside a code span holds `www.`,
   `:`, or `@`, so no cell can autolink.
10. Annotations are grouped by environment and finding kind, so a run with more
    than 10 findings of one severity still writes at most one annotation per
    environment and kind (no more than 6 of any severity), and the summary lists
    every finding while it is within its row cap.
11. A manifest with more findings than the row cap (for example 600 not vendored
    names of 200 characters, in both environments) gives a summary under 512 KiB
    with 500 rows per environment, failure findings first. Each environment's
    section says its list is incomplete and how many findings of each kind are
    not listed, the annotation of each kind that lost rows says so, and the run
    log lists all 600 of each environment. The run still passes (warnings only),
    and no part of the report calls it complete.

## References

- [How the kit gets its contracts](./how-the-kit-gets-its-contracts.md) (rules 1
  to 4), [The `contracts` package](./the-contracts-package.md),
  [Testing and CI](./testing-and-ci.md), [Supply chain](./supply-chain.md).
- [ADR-001](../../decisions/ADR-001-toolchain-and-signing.md) decision 5 and its
  amendment note of 2026-11-17 (publication does not replace vendoring), and
  [wrapper.md OQ-6](../wrapper.md#decided-questions) (vendor now, publish
  later).
- Issue #138.
