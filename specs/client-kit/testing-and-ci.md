# Testing and CI

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

The kit's tests are the executable half of
[wrapper.md's test plan](../wrapper.md#test-plan).

| Level     | Tool                                 | What                                                                                                                                           |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                               | per package; the signing, Snapshot, and transcript vectors; the token schedule; redaction                                                      |
| Component | Vitest and jsdom                     | the Wrapper renders every `valid/` Snapshot; the reference game's message handling and rendering per status                                    |
| e2e       | Playwright                           | win, loss, cash-out, offline, typed errors, two tabs, the sandbox, accessibility, the no-secret scan                                           |
| Static    | oxlint, stylelint, oxfmt, TypeScript | lint (oxlint for TypeScript, stylelint for CSS), format check (oxfmt, for every file type it supports), `tsc --noEmit`, import-direction rules |
| Tooling   | Vitest, tsx                          | `tools/`: the lint fixtures that prove a violation fails (TypeScript and CSS), the allow-list check, the test-only-entry check                 |

**CI jobs** (GitHub Actions, one required aggregate job `ci-ok`): `lint` and
`format`; `typecheck`; `unit` (`pnpm test`); `allow-list` (the dependency
allow-list); `contracts` (the hash check, the regenerated-types diff, and the
import check that the test-only entry is imported only by tests);
`contracts-drift` ([rule 3](./how-the-kit-gets-its-contracts.md), when a source
is published); `build` (the bundle, its manifest, a size budget, a check that
the same bundle is what e2e runs and what is released (no test or
per-environment build), and a check that no vector reaches any bundle or release
output); `e2e-fake` (Playwright against the in-repo fake Play API, which answers
from the contract's vectors); `audit` (`pnpm audit --prod`, failing on high and
critical advisories only); `dependency-review` (pull requests only);
`release-dry-run` (the release dry run: changesets applied on a scratch copy,
the five tarballs packed and checked and imported as a consumer would, the
Wrapper artifact built twice with one digest; no token, no network). The release
itself is a separate workflow, `release` (changesets, provenance, run by hand
from the default branch only, its publish job in the protected `release`
environment; [release runbook](../../runbook/client-kit-release.md#release)).

Today `contracts` runs the test-only-entry import check, the hash check against
`contracts.lock.json`, and the generated-files diff (the Snapshot types, the
Play API document's types, and the vector catalog). `contracts-drift` is not
defined yet. `build` builds every workspace (the Wrapper's build writes and
checks its manifest; the size budget is not defined yet), and the job also runs
`pnpm check:build-output` (the no-vector content check, now over the vendored
vectors) and `pnpm check:package-files`. `e2e-fake` installs Playwright's
Chromium and runs the e2e harness's own tests, a smoke run on the Wrapper's
release bundle, the browser rows of the Wrapper's test plan that run on the fake
Play API, and a smoke run on the reference game's build; the others are pending
([The e2e harness](#the-e2e-harness)). The workflows hold no secret, run with
`permissions: {}` at the top and `contents: read` per job (the release
workflow's `publish` job adds `id-token: write`, for provenance and trusted
publishing), and pin every Action by full commit SHA.

## Task orchestration and caching

The scripts are [wireit](https://github.com/google/wireit) scripts, declared in
the `package.json` that owns them with their `command`, input `files`, `output`,
`dependencies`, and `packageLocks: ["pnpm-lock.yaml"]`, so the lockfile and the
shared configuration (`tsconfig.base.json`, `.oxlintrc.json`) are inputs of the
scripts that read them. A task whose inputs are unchanged is skipped and its
outputs restored from the cache.

- **Local:** `.wireit/` in each worktree (git-ignored; like `node_modules`, it
  is per worktree). `pnpm clean:cache` empties it.
- **CI:** `WIREIT_CACHE=github`, using the GitHub Actions cache through
  `google/wireit`'s `setup-github-actions-caching` action (pinned by commit SHA,
  in `.github/actions/setup`). It hands the job's own Actions cache credentials
  to wireit on the runner; no repository secret is involved. There is no remote
  cache service (ADR-001 rejected one because it needs a credential).
- **A cache hit never replaces a gate that could fail.** A script is cached only
  if it declares `files`; the gating checks (`lint`, `format:check`,
  `test:tools`, `check:deps`, `check:contracts`, and the contracts hash check
  when it lands) list every file they read, the test suites list the files they
  read outside their package or depend on the task that produces them, and
  `test:e2e` and `format` declare no `files`, so they always run. `pnpm audit`
  is a plain CI step, never cached, because its result depends on the advisory
  database and not on repository files.
- **Every input is listed.** A script lists every file its command reads: the
  sources of a workspace as `src/**` (all file types: JSON schemas and vectors,
  CSS, SVG, assets), `public/**` for a Vite app, its top-level `*.ts`
  (`vite.config.ts` and the files it imports), `index.html`, `package.json`, its
  tsconfigs, the shared `tsconfig.base.json` and `tsdown.base.ts`, the env and
  PostCSS files Vite loads, and the lockfile (`packageLocks`). A `build`
  excludes only test files (`src/**/*.test.ts`) and the Wrapper's scratch
  fixture `src/fixtures/guard-scratch.ts`; `test` and `typecheck` keep the
  fixtures. `tools/wireit-inputs.test.ts` checks this mechanically: it walks
  every workspace and holds each script's `files` to the files on disk and to
  probes for files that do not exist yet (a `contracts` schema or vector, a
  Wrapper `public/` file, an env file), and it fails on a script that has a
  command and no `files` unless it is declared to run every time (`format`,
  `check:readmes`, `e2e#test`). The audit runs inside `test:tools`, and it reads
  every file of every workspace, so `test:tools` lists the workspace trees
  (`packages/*/**`, `apps/*/**`, `e2e/**`, without `dist/`, `node_modules/`,
  `.wireit/`, `coverage/`, `test-results/`, `playwright-report/`, and
  `*.tsbuildinfo`): a new or edited workspace file re-runs the audit instead of
  restoring a cached pass, and the audit holds `test:tools` to those trees too.
  Its matcher approximates wireit's globs (`path.matchesGlob` with dotfiles on):
  extglobs and bracket expressions are not interpreted as wireit does, and it
  applies every `!` pattern to every include where wireit applies one only to
  the includes before it (which can only cause a false alarm). A test file that
  shipped code imports would be outside a `build`'s inputs; a lint rule keeps
  tests out of the graph.

**Test tooling notes.** The DOM for component tests is **jsdom**: it is the most
complete DOM for the axe accessibility checks, and the pieces it lacks (Web
Locks, `crypto`, `fetch`) are injected fakes in the shell's tests anyway. The
**formatter** is oxfmt alone, for TypeScript, JSON, Markdown, YAML, and HTML
(oxfmt covers Markdown and YAML as of 0.72, so prettier was dropped);
`pnpm format` writes and `pnpm format:check` verifies. Files that must stay as
written are listed in `ignorePatterns` of `.oxfmtrc.json` (the lockfile,
changelogs and changesets, and the agent and skill files, whose single-line
frontmatter some agent tools require). The Snapshot types come from
`json-schema-to-typescript`, the typed client's from `openapi-typescript`; both
are development dependencies that write committed, generated files
([ADR-001](../../decisions/ADR-001-toolchain-and-signing.md)).

## The e2e harness

The Playwright suite (`e2e/`, the private `@intraverse/se-client-e2e` workspace)
stands on fixtures in `e2e/tests/harness/`. None of it is shipped; it is
development-only, so it may import the test-only entry of `contracts`.

- **Hermetic origins.** Every origin is a Playwright route on the test's browser
  context, under the reserved `.test` top-level domain: the Wrapper's release
  bundle (`apps/wrapper/dist`, unmodified) at `https://wrapper.e2e.test`, and
  the suite's own test pages (`e2e/tests/pages/`) at `https://pages.e2e.test`.
  The reference game's build (`apps/reference-game/dist`, unmodified) is served
  at the game origin D, `https://game.e2e-games.test`, on another registrable
  domain (W-37), for every test (`e2e/tests/harness/serve-origins.ts`): it is
  the fake Play API's redeem `gameOrigin` and the configuration's only
  `gameOrigins` entry, so every Wrapper session mounts it. A test that serves
  another game at D registers its route after these. The bundle holds no
  environment values, so the harness also serves the Wrapper's environment
  configuration document at the path the Wrapper reads
  (`/environment-config.json`, provisional like the Wrapper's own path): a valid
  `preview` document (`e2e/tests/harness/environment-config.ts`) whose
  `playApiBaseUrl` is the fake Play API's and whose other hosts are all under
  `.test`, with two RPC endpoints of distinct providers so no degraded indicator
  is shown. A catch-all route, registered first, refuses every other HTTP
  request, and a catch-all WebSocket route closes every WebSocket a page or
  frame opens (code 1008) before it connects; both are recorded, and a test that
  made either fails. The routes do not see a WebSocket opened by a dedicated
  worker or a service worker, nor WebRTC or other traffic outside a route; such
  traffic is not recorded. Behind the routes, the Chromium project runs with
  `--host-resolver-rules=MAP * ~NOTFOUND` (`e2e/tests/harness/browser-flags.ts`,
  development and CI alike, the installed-Chrome channel included), so no host
  name resolves and nothing outside a route can reach a host by name (WebRTC's
  STUN and TURN servers named by host included); routed requests resolve no
  name, so the fake origins still answer. An address written as an IP literal is
  not a host name, and this flag is not relied on to stop it.
  `e2e/tests/hermetic-workers.spec.ts` proves the block: a socket from a
  dedicated worker and one from a service worker's install handler, aimed by
  name at a loopback listener the test owns, never reach it, and a control
  launch without the flag reaches it with the same socket (both launches turn
  off Chrome's local network access checks, which would otherwise stop a public
  origin's socket to loopback and make the test pass for the wrong reason). That
  listener is the suite's only open socket and takes nothing but connections.
  Firefox and WebKit need their own equivalent of the block when their projects
  are added (T-9a). No server or port is opened otherwise. The static origins
  answer a missing file, or a path with a malformed `%` escape, with a 404.
- **The fake Play API** is a route at the configuration's `playApiBaseUrl`
  (default `https://wrapper.e2e.test/play/v1`; a test may move it). It answers
  from the vendored contract only. Its routes, each operation's listed statuses,
  and each request body's fields are tables held to the Play API document's
  generated types at compile time, so a document change breaks the fake instead
  of loosening it. Request bodies are decoded strictly (an unknown or missing
  field is `INVALID_ARGUMENT`), and every route but the redeem needs a valid
  play token (`UNAUTHENTICATED` otherwise). A test scripts each operation's
  answers in order: a Snapshot is a `valid/` Snapshot vector, sent as vendored;
  a problem is a `valid/` `PlayProblem` vector, sent with its own status, which
  must be one the operation lists; a `network-failure` aborts the connection; a
  `hang` never answers. A script that names an unknown vector, a vector of the
  wrong definition, or an unlisted status is refused when it is queued. The
  redeem and refresh answers are the fake's own, typed by the document: one
  single-use launch code (`redeemAgain()` allows one more redeem of it, for the
  same session id with a new token: the cloned tab of T-17), play tokens that a
  refresh rotates (the older ones revoked), `Cache-Control: no-store`, deadlines
  from a fixed server time, and the redeem's `gameOrigin`, the one origin on the
  suite's `gameOrigins`. The launch code, session id, and tokens are derived
  from a seed with SHA-256, so a run is reproducible. A call the script has no
  answer for, or a request to an unknown route, is answered `INTERNAL` or
  `NOT_FOUND` and fails the test. The fake answers an operation only with a
  status the document lists for it: a problem it writes itself
  (`UNAUTHENTICATED`, `INVALID_ARGUMENT`) whose status the operation does not
  list (for example a body sent to `refreshPlayToken`, which lists no 400) fails
  the test as an unscripted call, answered `INTERNAL` (500, which a type-level
  check in `play-api-document.ts` requires every operation to list); no status
  is invented. Field values are not checked against the document's patterns, and
  responses are not re-validated against the schema at run time (decided,
  2026-10-17): the compile-time types and the per-vector definition and status
  check are enough, because a vector's validity is the `snapshot` package's T-5
  replay and the document's `Snapshot` and `PlayProblem` components are
  generated from the same schema; and the e2e suite does not import `snapshot`
  (the dependency direction keeps e2e on `contracts` only).
- **The launch URL** is `fake.launchUrl(wrapperUrl)`: `<wrapper-url>#<code>`,
  the whole fragment being the launch code (`#lc_…`, no parameter name), the
  form the launch contract uses. The T-rows build their launch URLs with it,
  through `e2e/tests/harness/wrapper-page.ts` (`launch`, `launchAndStart`, the
  status heading, alert, and live region, and the English texts they read). A
  launch is a new navigation: a fragment-only change of an open page does not
  reload it, so the Wrapper does not read it.
- **The seeded random source** (T-13): `crypto.getRandomValues` is replaced in
  every page and frame with `addInitScript` by a seeded generator (mulberry32),
  after the platform's own checks, which still throw (`QuotaExceededError` above
  65,536 bytes, `TypeMismatchError` for a float array) and report nothing; every
  draw is reported to the test, so the suite knows the key's bytes, and a scan
  first waits until every live frame's draws have arrived. Each document
  restarts the stream from the seed, so a reload draws the same bytes. Workers
  and `crypto.randomUUID` are not stubbed.
- **The secret scan** (T-13) records, for the whole context: console messages
  (text and arguments, serialized in the page) and uncaught page errors; every
  request, response, and WebSocket URL; every URL a frame navigated to, the
  history API included; and, at scan time, each frame's document URL,
  `history.state`, `localStorage`, `sessionStorage`, IndexedDB (every database,
  store, key, and value), Cache Storage (request URLs and response bodies),
  cookies (the context's, `HttpOnly` included, and `document.cookie`), service
  worker registrations, and the origin private file system
  (`navigator.storage.getDirectory()`, recursively: every name and every file's
  contents). It looks for the fake's launch code and every play token it issued,
  every 32-byte draw of the random source, and any secret a test adds: a string
  raw, URL-encoded, and in base64 and base64url; bytes in hex (any case),
  base64, base64url, comma-separated decimals, and one decimal number (the bytes
  read big-endian, as a `bigint` prints; binary values in the page are
  serialized to those forms). Anything shaped like a launch code or a play token
  (`lc_` or `pt_` and 43 base64url characters) is a finding too. The one
  navigation the test makes to the launch URL is allowed, once; the document URL
  after it is not. The generic scan does not see history entries (no web API
  lists them); T-13 itself checks that going back does not return to the launch
  URL. A finding names the channel and the secret's label, never its value. **A
  read error fails the scan** (decided 2026-10-17): a channel, a frame, or a
  console argument that cannot be read is an `unreadable` finding naming the
  channel and the error's name, never a value; the one excuse is a
  `SecurityError` in a frame whose origin is `"null"` (a sandboxed frame, which
  has no such storage), where the origin is the one an init script recorded
  before any page code ran, not `self.origin`, which a page can overwrite. A
  `SecurityError` in a frame with a real origin, or in a page that wrote
  `"null"` over `self.origin`, is reported. Not covered: request and response
  bodies, a base64 form not aligned with the start of a larger base64 string,
  and workers. The scan runs in the page's own world and trusts the page's
  built-in APIs: a page that replaces a built-in (a storage getter, `console`,
  `history`) can hide what it holds from the scan; the Wrapper is tested as
  built, not as an adversary of the suite. Its negative tests run a deliberately
  leaking test page that opens a session against the fake and leaks one secret
  through one channel; the scan must fail for each channel (WebSocket,
  `history.state`, the origin private file system, and the key as a decimal
  number included), pass the same page leaking nothing, fail on an unreadable
  channel and an unserializable console argument, excuse an opaque frame, and
  see a draw made just before it. The forms and the redaction are tested in Node
  alone (`e2e/tests/secret-needles.spec.ts`).
- **The accessibility audit** (T-14) is an axe scan (`@axe-core/playwright`)
  with the WCAG 2.2 A and AA tags (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa`), optionally limited to a selector; axe's best-practice rules are
  not applied. A test page with known violations proves it fails.
- **The network control** (T-15): `goOffline` and `goOnline` toggle the
  browser's offline emulation and cut the fake Play API with it; `cutPlayApi`
  fails only the Play API while the page stays online. A single failing or
  never-answering call is scripted on the fake.
- **What runs today**: the harness's own tests; a smoke run on the Wrapper's
  bundle opened with no launch code (it loads and accepts the served
  configuration with no outside request, error, or warning, passes the audit,
  leaves nothing for the scan, and goes offline and back; a control serves a
  broken document and sees the configuration-error state); a smoke run on the
  reference game's build in a stand-in host page
  (`e2e/tests/pages/game-host.html`, which frames it sandboxed at the game
  origin and records what it receives): the `hello` reaches the host from the
  game origin, a Snapshot renders, a click asks for a pick, a reject shows in
  the alert, a message the game posts to itself and a message outside the schema
  are ignored, the page passes the audit, and an unframed game talks to nobody
  ([The reference game](./the-reference-game.md)); the session's open
  (`session-open.spec.ts`); and the Wrapper's browser rows that the fake's
  vectors can drive: T-13, T-14a, T-17, T-18, the game's mount at the redeem
  answer's D (`game-mount.spec.ts`), and parts of T-15 and T-16 (their own spec
  files; [wrapper.md, Test plan](../wrapper.md#test-plan) lists which). The rows
  that need a round W-26 passes (the vectors are not issued for the session's
  own key), a multi-step game, or W-49's handshake are declared with
  `test.fixme` in `e2e/tests/pending.spec.ts`, reported as skipped, never as
  passed. The Firefox and WebKit projects join with the W-49 paths (T-9a).
- **Locally**, `pnpm exec playwright install chromium` (in `e2e/`) installs the
  browser once. Where Playwright's download is unavailable,
  `SE_E2E_BROWSER_CHANNEL=chrome` runs the Chromium project on an installed
  Chrome. It is a development-only option: CI does not use it and always runs
  Playwright's own Chromium.
- **Telemetry**: the harness writes nothing but Playwright's own report. A
  finding's detail, a refused URL or WebSocket, and the fake's record of
  unexpected calls have every form of every known secret (the fake's launch code
  and tokens, and the 32-byte draws) and anything secret-shaped replaced by
  `[redacted]`; the fake keeps whether a request was authorized, never the
  token.

**Where the preview-stack e2e runs.** The SuperEngine preview stack is private,
so a public CI job cannot reach it without a credential. This repository owns
the e2e **suite**; a job owned by the backend repository checks this repository
out at a **pinned commit**, installs with `--frozen-lockfile`, builds the
Wrapper, and runs the suite against its own throwaway stack. That job holds no
secret. The same suite runs against the fake Play API in this repository's own
CI, so a change here is checked without the backend. Only the fake-API suites
are deterministic and hermetic; the preview-stack run (wrapper.md T-10 to T-12,
and so AC1) talks to a real stack, is **not hermetic**, and is never part of
`pnpm check` or of this repository's required CI jobs.
<!-- TODO(preview stack): the pin and the job live in the backend repository. -->
