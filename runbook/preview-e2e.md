# Run the e2e suite's preview mode against a stack

The kit's side of the preview-stack run (AC1: a win, a loss, and a cash-out
against a real stack). The backend's repository owns the job, the stack, the
funding, and the pin; this runbook says what the suite needs from them, how to
run the mode by hand, and what changed. The contract is in
[`specs/client-kit/testing-and-ci.md`](../specs/client-kit/testing-and-ci.md),
and the decisions are in
[RFC-002](../rfcs/active/RFC-002-preview-mode-of-the-e2e-suite.md). It names no
host and holds no credential.

## When to use

- To run the Wrapper's T-10 (a win), T-11 (a loss), and T-12 (a cash-out)
  against a preview stack, by hand or from the backend's job.
- To bump the pin the backend's job holds (below).
- When a preview run fails before a browser starts, or on an origin, a launch
  URL, or the environment document (Troubleshooting).

The mode is **not hermetic** and is never part of `pnpm check` or of this
repository's required CI jobs. The fake projects (`pnpm test:e2e`) are the
hermetic ones.

## Prerequisites

- A checkout of this repository at the pinned commit, on Linux or macOS (the
  launch hook's timeout signals the child's process group), with the toolchain
  of `.node-version` and `packageManager`: `pnpm install --frozen-lockfile`.
- Playwright's Chromium:
  `pnpm --filter @intraverse/se-client-e2e exec playwright install chromium`
  (needs the download egress or a prepared cache). Where it cannot be
  downloaded, `SE_E2E_BROWSER_CHANNEL=chrome` runs the project on an installed
  Chrome (development only).
- A stack that serves the Wrapper at its origin root (`/`) and the environment
  document, with `environment: "preview"`, and a stack that declares Coin Flip
  and Cash or Crash `[3,3,4]` (T-12 fails at the launch otherwise, which is the
  signal).
- The stack and this project run the **same pin**. The suite also compares, best
  effort, the served page's hashed asset names with its own `apps/wrapper/dist`
  and prints one line on a mismatch; that never fails the run.
- A **launch hook**: an executable the backend's runner provides (below).

## Steps

1. Export the variables. All are read by the launcher's child, validated before
   any browser starts, and none holds a secret.

   | Variable                         | Required | Meaning                                                                                                                                                                                                                                                   |
   | -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `SE_E2E_PREVIEW_ORIGIN`          | yes      | The origin that serves the Wrapper page and the environment document: `https://host[:port]`, or `http:` on a loopback host only. No path, query, fragment, credentials, or wildcard.                                                                      |
   | `SE_E2E_PREVIEW_LAUNCH_COMMAND`  | yes      | The **absolute** path of the launch hook's executable. A relative path, a name to find on `PATH`, and a path with a NUL are refused.                                                                                                                      |
   | `SE_E2E_PREVIEW_GAME_ORIGIN`     | yes      | The one `https:` game origin both games run at. The stack gives it as the `gameOrigin` of both games and lists it in `gameOrigins`; the suite serves the reference game's build at it by a route, so the origin needs no hosting. Not the preview origin. |
   | `SE_E2E_PREVIEW_ALLOWED_ORIGINS` | no       | Comma-separated origins the browser may reach besides the preview origin, such as the chain RPC endpoints the environment document names. No wildcard, no path.                                                                                           |

   There is no variable for a launch code, a token, a key, or a funding
   endpoint. The suite does not derive the API URLs from the preview origin: it
   reads `playApiBaseUrl` and `verifyApiBaseUrl` from the environment document
   the stack serves, and every origin the browser would reach must be on the
   allow-list (the preview origin plus the listed ones).

2. Run the mode through its one script, from the repository root:

   ```sh
   pnpm test:e2e:preview
   ```

   It builds what it serves (the Wrapper and the reference game), then runs
   `playwright test --project=preview` with the entry marker set. Do not set the
   marker yourself, and do not run the project any other way: the generic routes
   refuse it.

3. Read the report. Three specs run, in Chromium only: T-10, T-11, and T-12.
   Each plays at most 40 rounds. A run that does not see its outcome (a win, a
   loss, a first pick that survives) fails, which is the intended signal. There
   are no retries: a retry would draw a different round.

## The launch hook

The kit defines only its interface; what it does to fund a player, and with
which credentials, is the backend's.

- **Called** once per session a test opens, immediately before the navigation,
  with one argument: the game id, `coin-flip` or `cash-or-crash`. These two ids
  are the kit's own labels; the hook maps them to its games. It is run without a
  shell, with standard input closed and standard error dropped, a timeout of 15
  s (on the timeout the child's whole process group is killed), and a bounded
  output (4 KiB). It receives the runner's environment plus
  `SE_E2E_PREVIEW_ORIGIN`.
- **Does** whatever the stack needs to give a new player enough funds for the
  run: at least 40 rounds times the smallest bet the game offers, plus a margin.
- **Prints** exactly one line on standard output and exits 0: the launch URL,
  which is the preview origin, `/`, then `#` and the launch code. No other line
  break, no carriage return, no credentials, no query, no path beyond `/`, and a
  fragment of 1 to 128 characters. A launch code is single use and lives 60
  seconds, so one URL serves one session.
- **Errors** are typed and carry no output: the suite catches whatever the child
  does and throws a `LaunchHookError` with an exit code (or none) and a reason
  (`start`, `exit`, `timeout`, `output`, `line`). It never holds the command,
  the standard output, or the standard error.

The runner must **not** echo the hook's output or run with shell tracing on, and
must **not** rely on any environment variable reaching the browser: the browser
gets a minimal explicit environment (`PATH`, `HOME`, `TMPDIR`, `LANG`), never
the runner's.

## Verification

- Before any browser starts, a missing or malformed variable fails with its name
  and a reason (`PreviewEnvironmentError`), and an environment document that is
  not `preview`, names an origin off the allow-list, or does not list the game
  origin fails in the global setup (`PreviewSafetyError`, or an error naming the
  origin only).
- `pnpm test:e2e:preview` exits 0 with three specs passed, and the secret scan
  at the end of each is clean. W-29's version helper ran with each: a Snapshot
  `version` never went down among responses that did not overlap. The first real
  run (below) showed it, and W-29's interim limit is removed; the run at the pin
  showed it again.
- **The first real run** was the backend's, at kit commit `9c305bbd`, against
  its preview stack. T-10, T-11, and T-12 passed on the real stack (about 1.6 s,
  1.3 s, and 1.3 s), and so did the preview-guard specs (the environment
  document check and the Snapshot version helper). The run took 19.1 s in all.
  The run was not clean on the first try, for one reason that was not the stack:
  the checkout path had a `preview` directory in it, and the project's selection
  of specs was a glob that Playwright matches against the file's absolute path,
  so every spec of the suite counted as a preview spec and ran under the preview
  project (a hermetic check then saw the preview browser's `EXCLUDE` argument
  and failed). The fake projects' ignore of the preview specs had the same flaw,
  and in such a checkout would have ignored every spec. Both are now one pattern
  anchored to the tests directory's absolute path, so where the repository is
  checked out changes nothing. Nothing about T-10 to T-12 changed.
- **The run at the pin** was the backend's, on 2026-10-26, at kit commit
  `0693bc79`, against a freshly started preview stack, outside the backend's CI
  job. The suite selected exactly T-10, T-11, and T-12, and all three passed in
  about 1.5 s. This is the first run with the anchored spec selection, and it
  confirms it. The backend's job has not run the mode in CI yet.
- **Timeouts.** The numbers are measured, not guessed: the test timeout is 2
  minutes and the run's is 15 minutes (about 75 times the slowest spec and 47
  times the whole first run, and above the fake projects' bound of 10 minutes),
  the launch hook's is 15 s, and the wait for one step of a round is 30 s (a
  quarter of a test's), so each fits inside the next and a cold stack has
  generous headroom. Each is one constant: the test and run timeouts in
  `preview-config.ts`, the hook's in `launch-hook.ts`, the step's in
  `preview-rounds.ts`. The run at the pin (about 1.5 s) is far inside them, so
  they stay; they are revisited only if a run in the backend's job comes close.
- **The browser's environment names** (`PATH`, `HOME`, `TMPDIR`, `LANG`) are not
  yet measured on the backend's job runner. Neither run so far was in the
  backend's CI job, and a headless Chromium started with these four names alone
  on the machines they ran on. Whether the job's runner needs another name is
  known only after the job's first run (Troubleshooting, "A browser fails to
  start on the runner").
- The hermetic proof of the mode itself needs no stack: `pnpm test:e2e` runs
  `e2e/tests/preview-guard/`, and `pnpm test` runs `tools/e2e-preview-*.test.ts`
  (the script closure, the config, the import boundary, the launcher, and that
  every preview spec awaits `secretScan.expectClean()`).

## Pin and bump

**The pin** is a full 40-character commit SHA of this repository's `main`, plus,
once it exists, the release version that commit corresponds to. A branch name or
a tag alone is not a pin.

The pin is a kit commit at or after the pull request that made the preview
project select its specs by an anchored pattern (the fix in the **Changes**
table below). An earlier commit run from a checkout path that has a `preview`
directory in it runs every spec under the preview project. The runner may place
the checkout anywhere, a path with a `preview` directory included.

The current pin is the merge commit `0693bc7961318b500a2fed91f09021128a24b35c`,
which contains the spec-selection fix. The backend runner hands the stack and
the project this one pin.

What the job does at the pin: check out the SHA; install the pinned toolchain
and `pnpm install --frozen-lockfile`; install Playwright's Chromium; start or
reach the stack with the Wrapper served at the preview origin, from the same
pin; export the variables above (not the marker); run `pnpm test:e2e:preview`.

**Bump.** (1) Pick the commit of `main` to move to and require that its CI is
green (`ci-ok`, including `e2e-fake`). (2) Read what changed between the old and
new pin in `e2e/`, `specs/wrapper.md`'s test plan, and the **Changes** table
below. (3) Update the pin in the backend repository, run the job, and read the
report. (4) If a variable or the hook changed, change the runner in the same
backend pull request. (5) A pin never moves because of a dependency update in
the kit alone.

### Changes

Every rename of a variable, every change of the hook's contract, and every
change of the assertions that needs something new from the stack is recorded
here with the commit that did it.

| Commit                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `9c305bbd` (the merge commit of RFC-002)     | The mode is added: the `preview` project and `pnpm test:e2e:preview`; `SE_E2E_PREVIEW_ORIGIN`, `SE_E2E_PREVIEW_LAUNCH_COMMAND`, `SE_E2E_PREVIEW_GAME_ORIGIN`, `SE_E2E_PREVIEW_ALLOWED_ORIGINS`; the launch hook; T-10, T-11, and T-12.                                                                                                                                                                                                                                                                  |
| `0693bc79` (the merge commit of kit PR #131) | The first real run passed T-10 to T-12. The preview project's `testMatch` and the fake projects' `testIgnore` are one regular expression anchored to the tests directory's absolute path, no longer a glob (a checkout path with a `preview` directory matched every spec); the timeouts are tightened to measured values (test 2 minutes, run 15 minutes, hook 15 s, step 30 s). No variable or hook contract changed, apart from the hook's timeout of 15 s. The pin must be at or after this commit. |

## Troubleshooting

- **`The "preview" project ... is reachable only through pnpm test:e2e:preview`.**
  The project was asked for through `pnpm test:e2e`, `SE_E2E_PROJECT=preview`,
  or a bare `playwright test --project=preview`. Use the script. (The script
  sets an entry marker that the config requires; it is not a variable to set by
  hand.)
- **`SE_E2E_PREVIEW_... is not usable (<reason>)`.** The variable named is
  missing or malformed; the reason is `missing`, `not-an-origin` (a path, a
  trailing slash, credentials, or another spelling than the serialized origin),
  `scheme` (`http:` off loopback, or an `http:` game origin), `wildcard`,
  `not-an-absolute-path`, `same-origin-as-preview`, or `empty-entry`. The
  message never repeats the value.
- **`the environment document check failed (fetch | document | environment | game-origin)`.**
  `fetch`: the document could not be fetched (an error status, a redirect, no
  answer in 15 s), at `/environment-config.json` of the preview origin.
  `document`: it is not the shape the suite reads. `environment`: it is not
  `preview`; the mode refuses a `production` or `local` stack. `game-origin`:
  `gameOrigins` does not list `SE_E2E_PREVIEW_GAME_ORIGIN`.
- **`refused an origin that is not on the allow-list: <origin>`.** The document
  names an origin (an API base or an RPC endpoint), or the browser reached one,
  that is not the preview origin or listed in `SE_E2E_PREVIEW_ALLOWED_ORIGINS`.
  Only the origin is named, never a path or a query, since a provider key can
  sit in an RPC path. Add the origin to the list if it is meant.
- **`the launch hook failed (<reason>)`.** `start`: the executable could not be
  started (not found, not executable). `exit`: it exited non-zero (the code is
  given) or was signalled. `timeout`: no answer in 15 s. `output`: more than 4
  KiB. `line`: the line is not the one launch URL described above (the origin,
  `/`, no query, no credentials, a fragment of 1 to 128 characters). None of
  them shows what the hook printed.
- **Every spec fails, each round showing `This round failed verification`.**
  Seen when the stack's services were recreated without a full re-seed of the
  stack's state. The Wrapper refusing those rounds is the intended behavior, not
  a defect in the suite. Re-seed the stack completely (or start a fresh one)
  from the same pin, then run again; nothing changes on the kit's side.
- **A browser fails to start on the runner.** The browser's environment is only
  `PATH`, `HOME`, `TMPDIR`, and `LANG`. If a headless Chromium needs another
  name on the runner, that is a change to `browser-environment.ts` and a row in
  the **Changes** table, not a variable to forward.
- **A WebSocket or request to an allowed IP-literal host fails to connect.**
  Chromium applies `--host-resolver-rules` to an IP literal as well as to a
  name, so the suite excludes every host of the allow-list, IP literals included
  (an IPv6 one without its brackets). An origin that is not on the list is
  refused by the routes whatever its spelling.

## Escalation

The backend's job, stack, funding, and pin belong to the backend repository's
maintainers. A defect in the suite or in this mode is an issue in this
repository; a suspected exposure of a key or token in a report is a security
report ([SECURITY.md](../SECURITY.md)), not an issue.

## References

- [RFC-002](../rfcs/active/RFC-002-preview-mode-of-the-e2e-suite.md), the
  decisions and acceptance criteria.
- [`specs/client-kit/testing-and-ci.md`](../specs/client-kit/testing-and-ci.md),
  the contract of the mode; [`specs/wrapper.md`](../specs/wrapper.md), the test
  plan (T-10 to T-12, W-29).
- Facts verified when the mode was built (Playwright 1.64.0): the config is
  loaded by the runner process and again by every worker process, so the
  entry-marker check holds in each (the marker is an inherited environment
  variable); the global setup runs in the runner only; Chromium's host-resolver
  rules apply to IP literals.
- [`e2e/tests/preview-support/`](../e2e/tests/preview-support/) (the code),
  [`e2e/tests/preview-guard/`](../e2e/tests/preview-guard/) (its hermetic
  tests).
