# RFC-002 — A preview mode for the Playwright e2e suite

- Status: draft
- Author: the documenter agent, for human review
- Created: 2026-10-26
- Unblocks: the SuperEngine preview-stack job (the backend's tracking issue):
  the Wrapper rows T-10, T-11, and T-12 of
  [`specs/wrapper.md`](../../specs/wrapper.md#test-plan) and so AC1, and a check
  of W-29 against se-backend 5769365 or later
- Relates to: [OQ-3 and OQ-4](../../specs/wrapper.md#decided-questions) (both
  decided), the two `TODO(preview stack)` markers that were in
  [`specs/client-kit/testing-and-ci.md`](../../specs/client-kit/testing-and-ci.md#where-the-preview-stack-e2e-runs)
  and [`specs/client-kit.md`](../../specs/client-kit.md) (resolved by the first
  real run), and
  [ADR-005](../../decisions/ADR-005-release-attestation-and-artifact-upload.md)
  (proposed)

The RFC stays `draft` until a human approves it as a whole. Nothing in it is
accepted yet: the specs keep saying what they say today, and the spec edits it
lists under [Impact](#impact) happen when it is accepted. Q1 to Q10 and the
changes that followed the review were decided by a human on 2026-10-26 (see
[Decisions](#decisions-2026-10-26)); the names marked **proposed** below are
still subject to the whole RFC's approval, and the backend repository will
depend on them.

## Problem

The suite in `e2e/` is hard-wired to the in-repo fake Play API. Every test runs
the Wrapper's release bundle behind a context that refuses every request the
fake origins do not answer, in Playwright's routes and in the browser
(`--host-resolver-rules` in Chromium, a dead proxy in Firefox and WebKit). The
launch URL, the environment document, the funded player, the chain RPC, and the
verify API are all the suite's own. That is what makes `pnpm check` hermetic,
and it must stay so.

But [AC1](../../specs/wrapper.md) asks for a win, a loss, and a cash-out against
a real stack. The spec already says the preview-stack run is owned by a job in
the backend repository that checks this repository out at a pinned commit and
runs the suite
([testing-and-ci.md](../../specs/client-kit/testing-and-ci.md#where-the-preview-stack-e2e-runs)).
It has nothing to run: there is no mode of the suite that takes a real launch
URL, and T-12 is a `test.fixme` in `e2e/tests/pending.spec.ts` because the only
game, Coin Flip, has one step and cannot cash out
([OQ-3](../../specs/wrapper.md#decided-questions): decided A, the stack declares
Cash or Crash `[3,3,4]` and T-12 plays it).

The backend needs from the kit three things: **the project name, the variable
names, and the commit to pin.** This RFC proposes the first two and says when
the third exists. The backend also needs the hook ids (`coin-flip`,
`cash-or-crash`), which are the kit's own labels for the backend to map.

## Motivation

- The only end-to-end evidence that the Wrapper works against the real Play API,
  real Snapshots, and a real chain read is the backend job. Until it can run,
  AC1 is open.
- W-29 carried an interim limit: until the backend's per-session counter landed,
  a Snapshot's `version` was not monotonic. The preview run was the one place
  that could show the counter has landed; the first real run did, and the
  interim text is removed.
- The kit must not weaken what makes its own suite trustworthy. The preview mode
  is a second, explicit, narrow mode, not a relaxation of the first.

## Proposed solution

### Scope, non-goals, acceptance criteria

In scope: a `preview` Playwright project, its environment, its launch hook, the
assertions of T-10, T-11, and T-12 in that mode, a Cash or Crash game page, the
controlled lifting of the network blocks, the pin and bump recipe, and the
artifact form.

Out of scope:

- The backend's runner, its stack, its funding, its credentials, and its pin
  file. They stay in the backend repository; this repository does not describe
  them.
- Any change to the Wrapper, the shell, or the contracts. The preview mode
  drives the unmodified release bundle through its public surface.
- A production run. The mode refuses a production environment
  ([Safety](#safety-the-mode-refuses-what-it-should-not-run-against)).
- The verify page's own e2e (VT rows), which stay on the fake verify API.
- Firefox and WebKit in preview (see Q5).

Acceptance criteria (each is a test or a check, listed again in
[Tests expected](#tests-expected)):

1. `pnpm test:e2e` and `pnpm check` never select, build for, or run the
   `preview` project; the generic routes (`SE_E2E_PROJECT=preview`, a bare
   `--project=preview`) refuse it unless the entry marker is set (below), and a
   check proves it. It runs only through `pnpm test:e2e:preview`.
2. With the variables unset or malformed, the run fails fast with a message that
   names the variable, in the config or the global setup before any browser
   starts, and the message holds no value that could be a secret. A run of the
   fake projects never reads the variables.
3. Against a stack that satisfies the contract below, T-10, T-11, and T-12 pass
   with the assertions of the [table](#what-each-row-asserts-in-preview-mode).
4. The secret scan is on in every preview test and has no weaker needle set than
   in the fake runs.
5. A request to an origin that is not on the allow-list fails the test, with a
   record that holds the origin only; the browser-level blocks stay on for every
   other host.
6. The browser receives a minimal explicit environment, never the runner's.

Security and privacy impact: the project handles a real launch code and a real
play token (both secret), an action key, and no personal data. It touches the
credential path only as a client of the Wrapper, the way a player's browser
does. It emits nothing beyond Playwright's report (see
[the secret scan](#the-secret-scan-stays-on)).

### The project: name, place, and how it is reached

- **Project name (decided, Q1): `preview`.** It joins `chromium`, `firefox`, and
  `webkit` in `e2e/playwright.config.ts`. It is **never** the default.
- **Reachable only through the dedicated script (decided 2026-10-26).** The only
  way to run it is `pnpm test:e2e:preview` (**proposed** root name; the e2e
  package's script is `test:preview`). The generic routes refuse it:
  `SE_E2E_PROJECT=preview pnpm test:e2e` and a bare
  `playwright test --project=preview` both fail with a message that names the
  script to use. The mechanism: the script runs a small `tsx` launcher
  (`e2e/tests/preview-support/run-preview.ts`; no new dependency) that sets one
  marker variable, **proposed** `SE_E2E_PREVIEW_ENTRY=script`, and starts
  `playwright test --project=preview`. `playwright.config.ts` defines the
  `preview` project **only when the marker is set**. When `preview` is asked for
  (by `process.argv` or by `SE_E2E_PROJECT`) without the marker, the config
  throws the refusal message. The marker is a guard against an accidental run,
  not a security boundary: the runner is trusted, and a person who sets the
  marker by hand still gets the fail-fast validation below.
  `SE_E2E_PREVIEW_ENTRY` is **not a user-facing variable**: the launcher sets
  it, the backend's runner never does, and it does not appear in the runbook's
  set-up list (the runbook may name it once, in troubleshooting, as the reason
  the generic routes refuse).
- **Config loading and fail-fast.** The preview variables are parsed **only when
  the marker is set**, in `playwright.config.ts` (or in a `globalSetup` that the
  config adds only then), so a run of the fake projects never reads, requires,
  or fails on them. The fake projects' constants (`browser-flags.ts`, their
  `launchOptions`) are not touched and not computed from the variables. A
  missing or malformed variable throws in the config, and the environment
  document check
  ([Safety](#safety-the-mode-refuses-what-it-should-not-run-against)) runs in
  the `globalSetup`, so both fail **before any browser starts**, with a message
  that names the variable or the check and holds no value that could be a
  secret. The public environment document is read again by each test's fixture,
  since a worker cannot share memory with the global setup and no file is
  written. The implementer verifies, on the Playwright version the repository
  pins, which process loads the config (the runner and, if it does, each
  worker), and the marker check must hold in every one of them.
- **Where it lives.** Three directories under `e2e/tests/`:
  - `preview/` holds only the preview specs (for example `t10-win.spec.ts`,
    `t11-loss.spec.ts`, `t12-cash-out.spec.ts`). The preview project has
    `testMatch` for the specs under `preview/`; the three fake projects get the
    same pattern as `testIgnore`, so a preview spec is never listed in a fake
    run. The pattern is a regular expression anchored to the tests directory's
    absolute path, not a glob: Playwright matches a glob against the absolute
    path, so a checkout path with a `preview` directory in it (found in the
    first real run) would select every spec.
  - `preview-support/` holds the modules the preview specs and the hermetic
    tests share: the variable parser, `guardPreview`, the launch hook, the
    launch line validator, the environment document check, the browser
    environment, the launcher. It has no spec files, and **no module under
    `harness/` (the fake's harness) imports it** (a check below). The preview
    specs reuse the harness modules that do not depend on the fake:
    `wrapper-page.ts` (the texts), `secret-scan.ts`, `secret-needles.ts`,
    `random-stub.ts`, and `accessibility.ts`. They do not import
    `fake-play-api.ts`, `fake-verify-api.ts`, `fake-rpc.ts`, or the round
    vectors' request checks.
  - `preview-guard/` holds the **hermetic tests of the preview support code**.
    They cannot live in `preview/`: the fake projects ignore that directory (so
    nothing would run them in this repository's CI), and the preview project
    would run them without the variables. `preview-guard/` is an ordinary
    directory of the fake projects, so `pnpm test:e2e` runs them on every
    change. Its tests that need a socket run in the Chromium project only and
    use a **local loopback test server** (an HTTP listener on `127.0.0.1` that
    the test owns, in the manner of `loopback-listener.ts`): that is not real
    network, reaches no host, and is the only way to prove that an allowed
    request is continued. Firefox and WebKit cannot reach loopback in the fake
    projects (the dead proxy hijacks it), so those tests skip there. The tests
    that touch no socket (parsers, validators, the derivation of flags) run in
    every project, as `fake-play-api.spec.ts` does. The `AGENTS.md` rule is "no
    real network", and the existing guard tests use fake origins only; this adds
    loopback servers to the suite's list of open sockets (the comment in
    `loopback-listener.ts` that counts them is updated with it).
- **Browser.** Chromium only in this RFC (Q5): one engine keeps the run short on
  a backend runner.
- **Script.** The wireit script `test:preview` in `e2e/package.json` runs
  `tsx ../tools/check-kit-dist.ts … && tsx ./tests/preview-support/run-preview.ts`,
  and `test:e2e:preview` at the root depends on it. It has **no `files` and no
  `output`**, so wireit never caches it, and no other script depends on it, so
  `pnpm check` never reaches it. It lists the variables below as `env` entries
  with `external: true`, like `SE_E2E_PROJECT`.
- **Timeouts.** A real stack and a real clock: the project sets a per-test
  timeout for the bounded loop (2 minutes, set from the first real run, which
  took 1.3 to 1.6 s per spec; see the runbook) and has no injected clock
  (`page.clock` is not installed). The config today bounds the whole run on CI
  at 10 minutes (`globalTimeout`), which a real-stack run of three bounded loops
  would exceed: when the marker is set the config sets its own `globalTimeout`
  (15 minutes, about 47 times the first real run of 19 s, and above the fake
  projects' 10 minutes) and the fake projects keep theirs. `retries` stay 0.

### Environment variables (decided, Q1; one change, see Decisions)

All are read once, in `e2e/tests/preview-support/preview-environment.ts` (a pure
module with tests), validated, and turned into one frozen object. That module is
a **pure function of an environment passed as a parameter**: it reads no
`process.env` and does nothing at import, because the `preview-guard` specs
import it in every fake project and ADR-001 keeps import-time side effects out.
Only the config and the launcher pass it `process.env`. Origins are serialized
origins as in W-37 (`https://host[:port]`, or `http:` on a loopback host only;
no path, no credentials).

| Variable                         | Required | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SE_E2E_PROJECT`                 | no       | Already exists. It never selects `preview`: the script does not read it, and the generic route refuses it (above).                                                                                                                                                                                                                                                                                                                                                                                             |
| `SE_E2E_PREVIEW_ORIGIN`          | yes      | The origin that serves the Wrapper page and the environment document. The stack may serve `/play/v1`, `/verify/v1`, and the operator launch on it too, but **the suite does not derive the API URLs from it**: it reads `playApiBaseUrl` and `verifyApiBaseUrl` from the validated environment document, as the Wrapper does, and checks their origins against the allow-list.                                                                                                                                 |
| `SE_E2E_PREVIEW_LAUNCH_COMMAND`  | yes      | The **absolute** path of an executable that returns one funded launch URL per call ([the hook](#the-launch-hook)).                                                                                                                                                                                                                                                                                                                                                                                             |
| `SE_E2E_PREVIEW_GAME_ORIGIN`     | yes      | The one game origin both games run at: the `gameOrigin` the stack gives for Coin Flip and for Cash or Crash. **The suite serves the kit's reference game build at it, by a route** ([the game page](#the-cash-or-crash-game-page)). `https:` only (the Wrapper refuses a loopback game origin outside `local`, T-9). It must differ from the preview origin and be on the environment document's `gameOrigins`; the Wrapper's own rules (W-37: different registrable domain) apply on top and are not relaxed. |
| `SE_E2E_PREVIEW_ALLOWED_ORIGINS` | no       | Comma-separated serialized origins the browser may reach besides the preview origin: for example the chain RPC endpoints the environment document names. No wildcard, no path, no scheme other than `https:` (`http:` on loopback only).                                                                                                                                                                                                                                                                       |

The prefix `SE_E2E_` matches the existing variables (`SE_E2E_PROJECT`,
`SE_E2E_BROWSER_CHANNEL`). There is deliberately **no variable for a launch
code, a token, a key, or a funding endpoint**: a secret never travels in a
variable the suite prints or caches, and the hook is the only place funding
happens. The marker `SE_E2E_PREVIEW_ENTRY` is set by the launcher, never by the
backend's runner.

Alternatives considered for the names and shape:

- One JSON variable (`SE_E2E_PREVIEW_CONFIG`) or a config file path: one
  variable to pin, but a malformed value fails in a parser instead of naming the
  field, and a file invites committing it. Rejected (Q1 decided on the list
  above).
- `SE_E2E_PREVIEW_URL` for the origin: it would suggest a path. Origin is the
  contract (W-37 vocabulary).
- `SE_E2E_PREVIEW_LAUNCH_URL` as a ready-made URL instead of a command: a launch
  code is single use and lives 60 seconds
  ([W-1](../../specs/wrapper/session-open-and-the-play-token.md)), so one URL
  serves one test; T-10, T-11, and T-12 are three sessions at least. It could be
  kept as a manual, one-test fallback; not proposed.
- A module path exporting a function instead of an executable: runs backend code
  inside the suite's process, with its memory and its environment. A child
  process with a one-line contract is a narrower boundary.

### Who receives which environment

The runner's environment can hold credentials the hook needs (the kit neither
names nor reads them), so what each process receives is stated:

| Process                                         | Receives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Node process that runs the config and tests | The runner's environment, as any Node process does. It reads only the `SE_E2E_*` variables above; it never prints, serializes, or forwards the rest.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The launch hook (a child of the Node process)   | The runner's environment, because whatever it needs to fund a player comes from there, plus `SE_E2E_PREVIEW_ORIGIN`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The browser                                     | **A minimal, explicit environment, not the runner's** (decided 2026-10-26). Playwright gives a browser `process.env` unless `launchOptions.env` is set, so the preview project sets `launchOptions.env` to a fixed allow-list of operating-system names the browser needs to start (`PATH`, `HOME`, `TMPDIR`, `LANG`; a headless Chromium started with these four in the first real run, which was not in the backend's CI job. Note, 2026-10-27: not yet measured on the backend job's runner, which has not run the mode; see the runbook). No `SE_E2E_*`, no proxy variable, no credential. |

The backend's runner therefore **must not rely on any environment variable
reaching the browser**. The function that builds the browser's environment is a
pure function of a source environment, and a test proves that, given a source
that holds a sentinel credential name, an `SE_E2E_*` name, and a proxy name,
none is in the result and every name in the result is on the allow-list.

### The launch hook

`SE_E2E_PREVIEW_LAUNCH_COMMAND` names an executable that the backend's runner
provides. The kit defines only its interface:

- **Called** once per session a test opens, immediately before the navigation,
  with one argument: the game id, `coin-flip` or `cash-or-crash`. **These two
  ids are the kit's own labels**; the backend's hook maps them to its games. It
  is run without a shell, with standard input closed, a timeout (15 s), and a
  bounded output (`maxBuffer`, 4 KiB; a design choice, a launch line is far
  shorter). The command must be an **absolute path**: the parser refuses a
  relative one, a name to be found on `PATH`, and one with a NUL; the unit tests
  use an absolute path to a fixture script too, never a relative name.
- **The timeout kills the child's whole process group.** The child is started in
  a group of its own (`detached: true`), and on the timeout the suite signals
  the group (`process.kill(-pid, "SIGKILL")`), so a hook that started its own
  children leaves none behind. (This is for the Linux and macOS runners the
  suite supports; the platform note is in the runbook.)
- **Does** whatever the stack needs to give a new player enough funds for the
  run: at least the 40-round bound times the smallest bet the game offers, plus
  a margin. How it does that, and with what credentials, is the backend's and is
  not described here.
- **Prints** exactly one line on standard output: the launch URL. It exits 0.
- **The suite validates the line exactly.** It is exactly one line (one trailing
  line feed allowed, no carriage return, no other line break). It parses as an
  absolute URL whose origin equals `SE_E2E_PREVIEW_ORIGIN`, with no credentials
  (no user name, no password), **no query**, a path of `/` only (the Wrapper's
  page, no path beyond it; **confirmed by the backend for the preview stack** on
  2026-10-26: the Wrapper's page is served at the origin root, so a launch URL
  is the origin, `/`, then `#` and the launch code), and a fragment of **1 to
  128 characters** (the launch code is the whole fragment, W-1). Anything else
  fails. The launch code is registered as a known secret before the navigation.
- **Errors are typed and carry no output.** The Node errors from running a child
  process include the command and the child's standard error in their message,
  so the suite catches them and rethrows a `LaunchHookError` that holds **only
  an exit code (or none) and a reason** from a closed set (`start`, `exit`,
  `timeout`, `output`, `line`). It never holds, and its message never contains,
  the command, the standard output, or the standard error. The standard error is
  dropped, because it may hold a credential. The suite never prints, attaches,
  or persists the standard output, and no rethrown error keeps the original as
  its `cause`.

### What each row asserts in preview mode

The fake runs assert the vendored bytes (the round id, the exact payout, the
`typedData` and signatures the fake checks). A real stack draws its own rounds,
so the preview mode asserts **properties the contracts promise**, read from what
the browser actually received. The Snapshot a response carried is read from the
network in the test's memory (never logged) and is the reference for what the
Wrapper should show. Every amount the suite reads or compares (a payout, a bet,
a balance) is a string or a `bigint`, **never a JS `number`**, in the helpers as
in the assertions.

| Row  | In the fake (unchanged)                                                                                                                                                                                       | In preview mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-10 | the vendored round; byte-exact start, move, payout `formatted`, round id                                                                                                                                      | Play Coin Flip rounds, each a full start, pick, and settle, until a **win** is seen, at most **40 rounds**; fail if none. For every settled round (also the ones that are not the target): the Wrapper reached `active` (so the `CreateRoundAuth` and tip checks passed against the real environment document and chain); the final heading is `You won` or `You lost`; the shown round id equals the settled Snapshot's `roundId`; the verify link is present; the verify API's answer for that round id is 200 with a `status` agreeing with the heading and a `payout` equal to the Snapshot's (compared as strings or `bigint`). On the win: the payout line shows the Snapshot's `payout.formatted`. |
| T-11 | the vendored loss; a second start with a chosen bet; a typed refusal keeps the loss's round id and verify link                                                                                                | The same loop, until a **loss** is seen, at most 40 rounds. On the loss: no payout line when `payout.value` is 0 (W-34, compared as a `bigint`), the payout line when it is above 0; the round id and the verify link stay; the next round can start from the loss's result (the loop's next iteration is the proof). The typed-refusal case stays fake-only (it needs a scripted error).                                                                                                                                                                                                                                                                                                                 |
| T-12 | the vendored Cash or Crash rounds (`t12-cash-out.spec.ts`): a pick that survives, then a cash-out to `won` (#139); and three picks that survive, the last ending the round `won` with nothing signed after it | Launch Cash or Crash `[3,3,4]`. Pick the first tile of row 0; if the round ends lost, start another (at most 40 rounds); once a pick survives, **cash out** with the Wrapper's cash-out control (W-24). Assert: the round ends `won`, the payout line shows the settled Snapshot's `payout.formatted`, the verify API agrees (200, `status`, `payout`), and no pick or cash-out was offered after the close. The last-surviving-move half of the fake row is not played here (Q9). **T-12 depends on the stack certifying Cash or Crash `[3,3,4]`** ([OQ-3](../../specs/wrapper.md#decided-questions), decided A); until it does, the row cannot pass and fails at the launch, which is the signal.       |
| W-29 | `snapshot-version` cases of the fake; T-20                                                                                                                                                                    | Not a row of its own. A helper records the `version` of every Snapshot response of a session and, for responses that did not overlap another Snapshot response in time, asserts the `version` never decreases. What counts as confirmation of the backend's counter, and the spec edit it triggers, is Q10.                                                                                                                                                                                                                                                                                                                                                                                               |

Shared by the three: the accessibility audit on the result state (`axe`, as in
T-10 today) and the secret scan at the end. The Wrapper's own rules are **not
relaxed** in preview: `minRpcQuorum`, the RPC list, the tip check, and the
`environment: "preview"` boot rule are the Wrapper's (W-26a, W-26b) and the
suite adds none and removes none; it reads the environment document the stack
serves and does not edit it.

**The 40-round bound is a test-design choice**, asked for by the backend, not a
probability argument. Whether 40 rounds is enough to see a win and a loss (and,
for T-12, a first pick that survives) depends on the odds of the stack's games,
which this repository does not state and has no source for: the backend must
confirm that 40 suffices at its configured odds. A run that does not see the
outcome fails, which is the intended signal. The loop plays the default bet the
Wrapper offers and never chooses an amount.

### The Cash or Crash game page

T-12 needs a game the player can pick through in more than one step. OQ-4 was
decided A: the reference game is in this repository, served from another origin
so the sandbox and origin checks are real. This RFC extends that decision to a
second game.

- **Where (decided, Q4): `apps/reference-game`, generalized.** The game already
  speaks the whole `steps` presentation of `se.controller/1` (`game-snapshot.ts`
  parses any `kind: "steps"` configuration with a per-step `optionCount`); what
  is Coin Flip-specific is `coin-flip.ts` and the rendering that reads it. The
  proposal: render any `steps` configuration as rows of option buttons (a row
  per step, `optionCount` buttons, `selectedIndex` and `losingIndex` marked),
  keep Coin Flip's two-option row as the case it is today, and send
  `pick { step, option }` exactly as now. The cash-out is the Wrapper's control
  (W-24), not the game's, so the page needs no new message.
- **One build, one origin, both games (decided 2026-10-26).** A single
  generalized `apps/reference-game/dist` plays whatever `steps` configuration
  the Snapshot carries, so the suite serves **that one build, by a route, at the
  one shared game origin** `SE_E2E_PREVIEW_GAME_ORIGIN`, for Coin Flip and for
  Cash or Crash alike: the stack gives that one origin as the `gameOrigin` of
  both games, and the backend hosts no page. (W-37 takes the game origin from
  the redeem response and mounts the page at its root; the same page at that
  root serves both.)
- **Package and direction rules: unchanged.** No new package, no new app, no new
  dependency; `reference-game` still depends on nothing but the controller
  protocol's types (`@intraverse/se-client-shell/controller`, type-only), the
  import-direction lint and `package-import-guard` still apply, and no
  `contracts` vector reaches its bundle (the vectors are only for its tests,
  from the test-only entry, as today).
- **Needs an ADR? No (decided, Q4).** The hard-to-reverse triggers of the
  [development flow](../../CONTRIBUTING.md#development-flow) are a dependency, a
  protocol, a package structure, or supply chain; none changes. The change is a
  spec edit to
  [`the-reference-game.md`](../../specs/client-kit/the-reference-game.md) (it
  says "a minimal Coin Flip game"; it becomes a minimal `steps` game, Coin Flip
  and Cash or Crash as the two configurations it is tested on), to OQ-4's row,
  and to the app's `README.md` and `package.json` description, which both say "A
  minimal Coin Flip game".
- **Tests expected for the page:** its unit and component tests gain Cash or
  Crash `[3,3,4]` cases built on the vendored `valid/cashorcrash-*` vectors (the
  row 0 to row 2 states: active, lost, won by cash-out, expired), the build test
  and the accessibility test cover the new rows, and the page still refuses
  every message shape it refused.
- **Who serves it in preview (decided, Q3): the suite, by a route.** The page is
  part of the pinned build, so serving it from `apps/reference-game/dist` needs
  no hosting on the backend's side and no DNS for the origin (a route fulfils
  the request; no network is used), exactly as the fake runs serve game origin
  D. The Play API document defines `gameOrigin` as a serialized origin with no
  path, and the Wrapper frames it only if it is on its own allow-list
  (`gameOrigins`). The stack gives the suite's shared game origin as the
  `gameOrigin` of both games, and the environment document must list it in
  `gameOrigins`; the suite checks both before it plays (a mismatch is a clear
  failure, not a blocked frame). The backend confirmed this arrangement
  (2026-10-26), and the backend's own runbook records it.

### Lifting the hermetic blocks, only for allowed hosts

Three layers keep the fake runs off the network: the context's catch-all routes
(`hermetic.ts`), the browser flags (`browser-flags.ts`), and the secret scan.
The preview project keeps the first two as **deny by default** and adds a
narrow, explicit allow-list; it never switches them off.

- **The allow-list** is: the preview origin and every origin in
  `SE_E2E_PREVIEW_ALLOWED_ORIGINS`. The shared game origin is **not** on it: it
  is fulfilled by a route and never reaches the network. The list is fixed at
  config load from the variables, exact-matched on serialized origin, and has no
  pattern.
- **Routes.** `guardPreview(context, allowed)` replaces `guardNetwork` in the
  preview fixtures only. The catch-all route `continue`s a request whose origin
  is allowed and aborts and records any other; the WebSocket catch-all connects
  an allowed URL to the server and closes any other with the same policy
  violation code. The served game origin is fulfilled by its own routes, as
  today. The fixture fails the test on any recorded refusal, as the fake one
  does. **A record holds the origin only**, never the full URL: the path or
  query of an RPC URL can hold a provider key, so neither the record, nor the
  failure message, nor the report ever carries one. (The fake guard records full
  URLs, redacted, because they are the suite's own; the preview guard cannot.)
- **Browser flags.** The Chromium project's `--host-resolver-rules` becomes
  `MAP * ~NOTFOUND, EXCLUDE <host>` for exactly the hosts of the allow-list;
  every other name still resolves to nothing, which is what stops traffic that
  no route sees (workers, WebRTC). An IP-literal host in the allow-list gets an
  `EXCLUDE` rule too (IPv6 without brackets), because Chromium applies the rules
  to IP literals as well as to names (found while implementing). The flags are
  computed in `playwright.config.ts` from the same validated object, **in the
  `preview` project only**, when the marker is set; the three fake projects keep
  the constants they have.
- **Requests the test makes itself** (the verify API read, the environment
  document) go through the same allow-list check on the URL's origin; an origin
  off the list is refused before the request is sent, and the refusal names the
  origin only.
- **Never in `pnpm check`:** see [below](#never-part-of-pnpm-check).

### The secret scan stays on

The scan is a property of the whole suite (T-13); preview mode is not excused
from it, and the real launch code and token make it more useful, not less.

- It runs in every preview test, at the end of each test and after any reload,
  over every channel it reads today.
- **Needles.** The launch code, read from the hook's validated line, is
  registered before navigation. The play token is registered when the test reads
  the `sessions:redeem` response in memory (as a needle only; the response body
  is not logged). The shaped patterns (`lc_…`, `pt_…`) stay on, so a secret the
  test did not register is still a finding.
- **The action key** is a draw the Wrapper makes with `crypto.getRandomValues`.
  The preview fixtures keep the seeded random stub and script that one draw
  (`ScriptedDraw`) with **one key per test, generated by the fixture in Node**
  (`crypto.randomBytes(32)`), the same key for every document of that test (as
  the fake runs do), so the scan knows it. The fake runs use the public test key
  of the signed-action vector because the vendored round was signed for it; the
  preview mode must **not** use that publicly known key against a real stack,
  since anyone could then sign for the session (Q7). The scripted bytes are an
  init-script argument, so tracing stays off and the preview fixture, like the
  round fixture, fails a test that runs with tracing on; the bytes are **never
  logged, attached, or written**, and the key is registered with the scan and
  the guard's redaction like any draw.
- **Output.** Every failure message goes through `redactSecrets` with the
  needles above. The hook's output, the launch URL, the token, and the key are
  never in a test title, an annotation, an attachment, or the report.
- **Runner hygiene** (for the backend's runbook, since it is on their side): the
  job must not echo the hook's output or run with shell tracing on.

### Safety: the mode refuses what it should not run against

In the `globalSetup`, before any browser starts, the suite fetches the
environment document from the preview origin (at the path constant the Wrapper
reads, which is still
PROVISIONAL, <!-- TODO(hosting): the document's final path -->) and:

- **fetches it the way the Wrapper does**: with no credentials, no cache, no
  redirect, and a 15 s timeout (W-43,
  [`specs/wrapper.md`](../../specs/wrapper.md#configuration)), in the
  `globalSetup` and again in each test's fixture;
- **refuses `environment` other than `preview`.** A `production` or `local`
  document stops the run. This is the control against pointing the money-moving
  mode at the wrong stack. It repeats a check the Wrapper makes at boot; the
  suite does not replace the Wrapper's rule and does not relax it;
- reads `playApiBaseUrl` and `verifyApiBaseUrl` from the validated document and
  checks that every origin the document names that the browser would reach (the
  two API bases, each RPC endpoint) is on the allow-list or the preview origin,
  that `gameOrigins` lists the shared game origin, and fails **naming the origin
  only**, never a path, a query, or the document: a provider key can sit in an
  RPC path;
- compares the stack's build with the pin: see Q6. The runner hands the stack
  and this project the same pin, and that is the primary check. A comparison of
  the served page's hashed asset names with local `apps/wrapper/dist` is a
  **best-effort, optional** extra; a mismatch is **reported in the run report
  and does not fail the run** (decided 2026-10-26).

### Never part of `pnpm check`

- `preview` is not in the default of `SE_E2E_PROJECT`, is not defined without
  the marker, and is refused through the generic routes (above); the `e2e-fake`
  matrix in CI lists the three fake projects and not `preview`.
- The script has no cache entry and nothing depends on it, so wireit's
  `pnpm check` graph does not contain it. Tests in `tools/` (the same family as
  `config-parity.test.ts`, run by `pnpm test`) assert:
  - the root `check` script's dependency closure does not include `test:preview`
    or `test:e2e:preview`;
  - the Playwright config, loaded without the marker, has no `preview` project,
    and throws the refusal when `preview` is requested without it;
  - the fake projects' `testIgnore` and the preview project's `testMatch` are
    the same pattern, anchored to the tests directory, and select the same specs
    wherever the repository is checked out;
  - **no module under `e2e/tests/harness/` imports from `preview-support/`
    (directly or through another module), and no fake-project spec imports it
    except those under `preview-guard/`** (the import scan runs over the source,
    like `import-direction.test.ts`), so the fake projects cannot import or
    reach `guardPreview`;
  - the fake projects' `launchOptions` equal the constants of today (no `env`,
    no `EXCLUDE`).

### Pin and bump recipe for the backend's runbook

The kit supplies the facts; the backend's runbook owns the procedure.

**The pin.** A full 40-character commit SHA of this repository's `main`, plus,
once it exists, the release version that commit corresponds to. A branch name or
a tag alone is not a pin. The first pin was the merge commit of the pull request
that implemented this RFC. The backend's first real run at it passed T-10, T-11,
and T-12 with one fix to the spec selection (an anchored pattern), so the pin is
now a commit at or after that fix (the runbook records it).

**What the job does at the pin** (nothing new, the spec already says it):

1. Check out the repository at the SHA.
2. Install the pinned toolchain from `.node-version` and `packageManager`, then
   `pnpm install --frozen-lockfile`.
3. Install Playwright's Chromium
   (`pnpm --filter @intraverse/se-client-e2e exec playwright install chromium`;
   the runner needs the download egress or a prepared cache).
4. Build what the stack serves and what the suite serves: the Wrapper and the
   reference game (the `test:preview` script's dependencies build them).
5. Start or reach the stack with the Wrapper served at the preview origin. The
   runner hands the stack and the preview project the same pin (see Q6).
6. Export the variables above (not `SE_E2E_PREVIEW_ENTRY`, which the script
   sets) and run `pnpm test:e2e:preview`.

**Bump.** (1) Pick the commit of `main` to move to; require that its CI is green
(`ci-ok`, including `e2e-fake`). (2) Read what changed between the old and new
pin in `e2e/`, `specs/wrapper.md`'s test plan, and the runbook's **Changes**
table below (the kit commits to record every rename of a variable, every change
of the hook's contract, and every change of the assertions that needs something
new from the stack, with the commit that did it). (3) Update the pin in the
backend repository, run the job, and read the report. (4) If a variable or the
hook changed, change the runner in the same backend pull request. (5) A pin
never moves because of a dependency update in the kit alone.

The kit side of this lives in a new runbook, `runbook/preview-e2e.md` (from the
[runbook template](../../.ai/templates/runbook.md)): how to run the mode by hand
against a stack, the variables, the hook, the changes table, and troubleshooting
(a variable named in an error, an origin refused, a launch URL rejected). It
holds no hostname and no credential.

### Artifact form: a commit pin now

The proposal is **a commit pin now**, because the suite is not a released
artifact and no release exists yet to pull a tar from:

- What the kit releases
  ([ADR-001](../../decisions/ADR-001-toolchain-and-signing.md) decision 9) is
  the Wrapper bundle, as a tar identified by digest, attested, and attached to a
  GitHub release
  ([ADR-005](../../decisions/ADR-005-release-attestation-and-artifact-upload.md),
  accepted 2026-10-28). That tar holds the Wrapper's `dist` only. The suite
  (`e2e/`), the reference game, and the vendored vectors are not in it, and the
  private `e2e` package is never published.
- ADR-005 was proposed when this RFC was written; it is **accepted**
  (2026-10-28).
- The commit pin needs nothing new in the kit; it is what the spec already
  describes.

Now that ADR-005 is accepted, once a release exists two improvements become
possible and are **not** decided here: the stack could serve the Wrapper from
the released tar pulled by digest (so the stack runs the released bytes, and the
suite's build-identity check compares against the tar), while the suite stays
commit-pinned to the tag's commit; and a released, versioned form of the suite
itself would need its own ADR (a new published artifact is a supply-chain
decision). Both are listed under Q11.

### Tests expected

For the implementer, once this is accepted:

- **Hermetic specs in `e2e/tests/preview-guard/`** (run by the fake projects, so
  by `pnpm test:e2e`; none needs the variables):
  - the variable parser: every missing, malformed, wildcard, path-bearing,
    credential-bearing, non-loopback `http:` origin; a relative or non-absolute
    command; an `http:` or loopback game origin; no value in any message;
  - the launch-line validator: every rule of the hook section (origin, no
    credentials, no query, path `/` only, fragment of 1 and of 128 characters
    accepted and 0 and 129 refused, exactly one line, no carriage return);
  - the launch hook with an absolute-path fixture script: success; a non-zero
    exit; a timeout, where the script has started a child of its own and **the
    child is gone afterwards** (the process group is killed); output over the
    bound; a script that writes a sentinel to standard output and standard
    error, with a test that the thrown `LaunchHookError` holds only an exit code
    and a reason and that the sentinel is in no message, no `cause`, and no
    attachment;
  - the browser environment function: given a source with a sentinel credential
    name, an `SE_E2E_*` name, and a proxy name, none is in the result and every
    name is on the allow-list;
  - the allow-list to `--host-resolver-rules` derivation;
  - `guardPreview` against a **local loopback test server** (Chromium project
    only; loopback is not real network, and the existing guard tests use fake
    origins only, so this is a recorded addition): an allowed origin is
    continued to the server, a disallowed one is refused and recorded **as an
    origin with no path or query** (a request URL with a sentinel in its path
    proves the sentinel is not in the record, the failure message, or any
    attachment), a disallowed WebSocket is closed;
  - the shared game origin is fulfilled by a route and reaches no socket;
  - the environment document check against a local loopback server: refuses
    `environment` other than `preview`, refuses an origin off the list naming
    the origin only, reads the API bases from the document and does not derive
    them from the preview origin.
- **`tools/` checks (Vitest, run by `pnpm test`)**: the five assertions of
  [Never part of `pnpm check`](#never-part-of-pnpm-check), including that no
  module of `harness/` imports `preview-support/`, and the launcher test that
  the generic routes refuse `preview`.
- **Loop bound logic** (a fake outcome sequence: stops at the first target,
  fails at 40) with an injected outcome source, not a browser.
- **Reference game**: the Cash or Crash cases above, plus its README and
  description.
- The three preview specs themselves are not run in this repository's CI; they
  are exercised by the backend job. The implementer proves them against the fake
  where a fake round can stand in (Q8), and otherwise by a documented manual
  run.
- `pnpm check` stays green; no new dependency (Node's `child_process` and
  Playwright's own APIs only).

## Alternatives

- **Reuse the fake specs with a mode switch** (`if (preview)` inside
  `t10-win.spec.ts`). Rejected: the fake specs assert vector bytes; a switch
  would put two contracts in one file, and a mistake could weaken a fake
  assertion to let the preview pass (the repository forbids weakening a test to
  go green). Separate files cannot do that.
- **Let the backend job write its own Playwright config** against the suite's
  harness. Rejected: the harness is internal and would have to be a stable API;
  the project name and variables are a smaller, reviewed surface.
- **A fourth project that is also run in this repository's CI against the
  fake.** Rejected: the preview project's value is the real stack; running it in
  CI against the fake would test the fake's imitation of itself. The hermetic
  tests of the guard and the parser give the coverage that can be had without a
  stack.
- **Cash or Crash as a new app** (`apps/cash-or-crash`). More isolation and a
  second thing to build, test, lint, and release-check, for a sample page. Not
  chosen (Q4).
- **A second entry or build output in `apps/reference-game`** (one HTML per
  game). Keeps Coin Flip's file untouched, duplicates the harness around it.
- **Running the preview mode in all three engines.** The fake projects exist to
  prove the Wrapper's behavior per engine against a fixed script; the preview
  run's job is the stack. Q5.

## Tradeoffs

- The hook moves funding out of the kit completely, at the price that the kit
  cannot test a funding failure beyond "the hook failed". Intended.
- Serving the game page from the suite proves the Wrapper against the kit's
  game, not against whatever the stack would host; that is also what OQ-4
  decided (the production game stays the developer's).
- Properties instead of bytes (the table) are weaker than the fake's assertions,
  by design: the real stack's rounds are not reproducible. The bytes remain
  proven by the fake and the shell's vectors.
- Real time and the real network make the run slower and capable of flaking on
  the stack; the bound (40) and the per-test timeout keep it finite, and there
  is no retry (`retries` stay 0: a retry would draw a different round and hide a
  defect).
- One chromium keeps the run small and leaves Firefox and WebKit unproven
  against the real stack (the fake runs prove them against a script).

## Impact

On acceptance (and not before):

- **Specs.** [`testing-and-ci.md`](../../specs/client-kit/testing-and-ci.md):
  replace "Where the preview-stack e2e runs" with the accepted mode (project,
  variables, hook, allow-list, safety, scan) and resolve its
  `TODO(preview stack)` to "the pin lives in the backend repository" (the one
  true remainder). [`client-kit.md`](../../specs/client-kit.md): the
  `TODO(preview stack)` row names the kit's side (this runbook and spec) and
  keeps the backend's side. [`wrapper.md`](../../specs/wrapper.md): T-10 and
  T-11 rows say what the preview run asserts; T-12 loses its `fixme` wording;
  W-29's **interim limit** is removed only when Q10's evidence exists, in the
  same change.
  [`the-reference-game.md`](../../specs/client-kit/the-reference-game.md) and
  OQ-4's row for the generalized game.
- **ADR.** None (decided, Q4). A later ADR if the suite becomes a released
  artifact (Q11).
- **Memories.** `.ai/memories/testing.md` (the preview project and the rule that
  it is not part of `pnpm check`), `.ai/memories/architecture.md` if the
  reference game's description changes.
- **Runbook.** `runbook/preview-e2e.md` (new) and an index line in
  `runbook/README.md`.
- **Code (implementer).** `e2e/playwright.config.ts`, `e2e/package.json`, root
  `package.json` scripts, `e2e/tests/preview/**`,
  `e2e/tests/preview-support/**`, `e2e/tests/preview-guard/**`, the comment of
  `e2e/tests/harness/loopback-listener.ts` that counts the suite's open sockets,
  `apps/reference-game` (its sources and tests, its `README.md`, and the
  `description` in its `package.json`, which both say "A minimal Coin Flip
  game"), and the `tools/` checks. A changeset is not needed (the `e2e` package
  and the reference game are private); the implementer confirms against the
  changeset config.
- **Telemetry.** None added. The project emits Playwright's report only; the
  redaction rule above is its logging rule.
- **Public repository.** Nothing in the RFC, the spec edits, or the runbook may
  name the backend's internal endpoints, ports, host names, test files, or
  funding mechanism. The kit says only: an origin, a command that prints a
  launch URL, and the player-facing contracts (Play API, verify API, Snapshot,
  the launch contract).

## Migration considerations

Additive. The existing three projects, their default, their blocks, and their
specs do not change, except that each gains a `testIgnore` for the preview
specs, and the config reads the preview variables only under the marker. T-12's
fake row left `pending.spec.ts` in two steps, each when the backend's vendored
Cash or Crash vectors it waited for landed (Q8): the cash-out (#139), then the
last surviving move (the round won on its last row). The file now lists no row;
its comment says so. The backend job has nothing to migrate: it has no preview
run today. After the pin exists, the variable names are an interface; a rename
is a recorded change in the runbook's table and a bump of the pin in the same
backend pull request.

## Decisions (2026-10-26)

Decided by a human on 2026-10-26. They are decisions about this draft, not an
approval of it as a whole.

| ID    | Decision                                                                                                                                                                                                                                                                                                                                                | Status                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Q1    | **A:** project `preview`; `SE_E2E_PREVIEW_ORIGIN`, `_LAUNCH_COMMAND`, `_ALLOWED_ORIGINS`; script `test:e2e:preview`.                                                                                                                                                                                                                                    | Decided.                               |
| Q2    | **A:** an executable that prints one launch URL per session.                                                                                                                                                                                                                                                                                            | Decided.                               |
| Q3    | **A:** the suite serves the page from the pinned `dist` by a route at the `gameOrigin` the stack gives.                                                                                                                                                                                                                                                 | Decided. **Confirmed by the backend.** |
| Q4    | **A:** generalize `apps/reference-game` to any `steps` configuration; no ADR.                                                                                                                                                                                                                                                                           | Decided.                               |
| Q-new | The suite serves **both** games' pages (Coin Flip and Cash or Crash) by route at **one shared game origin**, from a single generalized reference-game build; the stack gives that origin as the `gameOrigin` of both games.                                                                                                                             | Decided.                               |
| Name  | `SE_E2E_PREVIEW_ENTRY` is the entry marker, and `_SERVED_GAME_ORIGINS` is renamed `SE_E2E_PREVIEW_GAME_ORIGIN` (singular, required, `https:` only).                                                                                                                                                                                                     | Decided.                               |
| Entry | Preview is reachable **only** through the dedicated script (`test:e2e:preview`); the generic routes refuse it unless the marker is set.                                                                                                                                                                                                                 | Decided.                               |
| Env   | The browser gets a **minimal explicit `launchOptions.env`**; the backend runner must not rely on any variable reaching the browser.                                                                                                                                                                                                                     | Decided.                               |
| Q5    | Chromium only.                                                                                                                                                                                                                                                                                                                                          | Decided.                               |
| Q6    | The runner hands the stack and the project the same pin (primary check). The hashed-asset comparison is best-effort and optional; a mismatch is reported in the run report and **does not fail** the run.                                                                                                                                               | Decided.                               |
| Q7    | One per-test random action key from Node, scripted into the key draw; never the public vector key.                                                                                                                                                                                                                                                      | Decided.                               |
| Q8    | The hermetic (fake) T-12 was deferred until the backend's vendored Cash or Crash signed chains landed (see below). Both halves of the fake row now run: the cash-out since #139, and the last surviving move since the round won on its last row was vendored. `pending.spec.ts` lists no row. The preview T-12 passed on the backend's first real run. | Decided.                               |
| Q9    | Preview T-12 is the cash-out only; the last-surviving-move half is not played against the stack.                                                                                                                                                                                                                                                        | Decided.                               |
| Q10   | W-29 is confirmed when the `version` helper passes on the backend's run; the documenter then removes the interim limit, citing the evidence. Done: the backend's first real run passed the helper, and the limit is removed.                                                                                                                            | Decided.                               |

Q8, the blocker before #139 (resolved; see below): the vendored Cash or Crash
`[3,3,4]` Snapshots in `valid/` started at step 1, so there was no active
Snapshot at step 0. The active Snapshot after the first row
(`cashorcrash-active-row2`) existed, but its `fairnessProof` carried `seedHash`
and no `readyHash` (so the shell refused the round at W-26 check 5), and it was
not on a signed chain. The resolving and won (cash-out) Snapshots existed in
`valid/` (`cashorcrash-resolving-row2`, `cashorcrash-won-cashout*`), but they
were not on one consistent signed chain with a `readyHash`. No signed chain
(typed-data or signed action) existed for the round, and the existing typed-data
cash-out and pick-multi-path vectors belong to the `signing.json` round, not to
the Cash or Crash round, so they did not cover it. The set the backend was to
add, tracked by the backend, had to contain the step-0 active Snapshot with
`readyHash`, the after-first-row active Snapshot re-issued with `readyHash`, the
resolving and won (cash-out) Snapshots re-issued on that one signed chain,
typed-data for the pick and the cash-out of the Cash or Crash round, and a
signed-action cash-out vector with its test key. The fake's rule stays: every
answer is an unmodified vendored `valid/` vector. Until that set was vendored,
cash-out was covered only by the preview T-12, which is the backend job's.

Q8, landed (kit #139): the set was published at se-backend `6afc690` and
vendored (`valid/cashorcrash-cash-out-*`, `typed-data/cashorcrash-pick` and
`cashorcrash-cash-out`, `signed-action/cashorcrash-cash-out`). The fake T-12
cash-out runs (`e2e/tests/t12-cash-out.spec.ts`) on all three fake projects.
`pending.spec.ts` kept one T-12 entry, the last-surviving-move half of the fake
row (wrapper.md T-12), since no vendored round ended on its last row.

Q8, fully resolved: the backend published a Cash or Crash `[3,3,4]` round won on
its last row at se-backend `71edfbe`, and the kit vendored it
(`valid/cashorcrash-last-row-*`, `typed-data/cashorcrash-last-row-pick-row0` to
`-row2`; no signed-action vector, since nothing is signed after the last pick).
The fake T-12's last surviving move runs (`e2e/tests/t12-cash-out.spec.ts`) on
all three fake projects: three picks, each checked against its typed-data vector
byte for byte, the last answered `won` with the Snapshot's payout, and no
cash-out sent. The T-12 entry left `pending.spec.ts`.

Confirmed by the backend on 2026-10-26 (answers, not decisions of the human):

- The Wrapper's page is served at the origin root on the preview stack, so the
  launch-URL rule "path `/` only" stands.
- Q3, as in the table.

## Still open

None of these is a decision for the human in this RFC; each is a backend answer,
a number to measure, or a fact known later.

| ID  | Item                                                                                                 | State                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q11 | Release artifacts after ADR-005.                                                                     | Out of this RFC. With ADR-005 accepted, once a release exists: the stack could serve the Wrapper tar by digest with the suite commit-pinned (the recommended direction), or the suite could also be released (its own ADR), or neither. |
| Q12 | The numbers: per-test timeout, run timeout, hook timeout, funding margin, browser environment names. | Set from the first real run (test 2 minutes, run 15 minutes, hook 15 s, step 30 s; the browser names held); the funding margin is the backend's to set in the hook.                                                                     |
| Q13 | The commit to pin.                                                                                   | Known only after the implementation merges (see Pin). The kit hands the backend the merge commit and the runbook's **Changes** table.                                                                                                   |
| Q14 | Stack declares Cash or Crash `[3,3,4]` ([OQ-3](../../specs/wrapper.md#decided-questions)).           | **Confirmed by the backend, 2026-10-26**: the stack declares Cash or Crash `[3,3,4]`.                                                                                                                                                   |
| Q15 | Whether 40 rounds suffice at the stack's odds.                                                       | **Confirmed by the backend, 2026-10-26**: 40 rounds suffice. A run that does not see the outcome still fails, which is the intended signal.                                                                                             |

Hand-off to the implementer waits for the human's approval of the RFC as a
whole.
