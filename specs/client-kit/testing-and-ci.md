# Testing and CI

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

The kit's tests are the executable half of
[wrapper.md's test plan](../wrapper.md#test-plan).

| Level     | Tool                                 | What                                                                                                                                           |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                               | per package; the signing, Snapshot, transcript, and fairness kernel vectors (the verify page's); the token schedule; redaction                 |
| Component | Vitest and jsdom                     | the Wrapper renders every `valid/` Snapshot (the payout ones too); the reference game's message handling and rendering per status              |
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
from the contract's vectors, one job per browser project: Chromium, Firefox, and
WebKit); `audit` (`pnpm audit --prod`, failing on high and critical advisories
only); `dependency-review` (pull requests only); `release-dry-run` (the release
dry run: changesets applied on a scratch copy, the five tarballs packed and
checked and imported as a consumer would, the Wrapper artifact built twice with
one digest, and held to the size budget; no token, no network). The release
itself is a separate workflow, `release` (changesets/action on every push to
`main`, provenance: `changesets-mode` decides, `version` opens the bump pull
request, `publish` (in the protected `release` environment) publishes and tags,
and `wrapper-build`, `attest`, `wrapper-assets`, and `production` attest the
Wrapper, attach it to its release, and deploy it;
[release runbook](../../runbook/client-kit-release.md#release)).

Today `contracts` runs the test-only-entry import check, the hash check against
`contracts.lock.json`, and the generated-files diff (the Snapshot types, the
Play API document's types, and the vector catalog). `contracts-drift` is not
defined yet. `build` builds every workspace (the Wrapper's build writes and
checks its manifest), and the job also runs `pnpm check:build-output` (the
no-vector content check, now over the vendored vectors),
`pnpm check:package-files`, and `pnpm check:size-budget` (below). `e2e-fake` is
a matrix of three jobs side by side, one per Playwright project (`chromium`,
`firefox`, `webkit`; their checks are named `e2e-fake (chromium)` and so on),
all aggregated by `ci-ok` (the `main` ruleset requires no status check, so
`ci-ok` is the one check to keep green before merging); each installs only its
own browser (`playwright install --with-deps <project>`, at the
`@playwright/test` version the lockfile pins; before it, apt is set to time out
a stalled download after 30 seconds and retry it three times, and to wait up to
a minute for the package lock, because the download has hung until the job's
timeout; each install attempt is bounded to 10 minutes and retried once, after
clearing what a killed attempt left behind, and a second failure or timeout
fails the job; the job's limit is 30 minutes) and runs only that project
(`SE_E2E_PROJECT`, read by the e2e package's `test` script). Each runs the e2e
harness's own tests, a smoke run on the Wrapper's release bundle, the browser
rows of the Wrapper's test plan that run on the fake Play API, and a smoke run
on the reference game's build; the others are pending
([The e2e harness](#the-e2e-harness)). The workflows hold no secret, run with
`permissions: {}` at the top and `contents: read` per job (in the release
workflow, `changesets-mode` adds `pull-requests: read`; `version` has
`contents: write` and `pull-requests: write`; `publish` has `contents: write`
and `id-token: write`, for provenance and trusted publishing; `attest` adds
`id-token: write` and `attestations: write`; `wrapper-assets` has
`contents: write`; no job holds both a pull-request write and an OIDC token),
and pin every Action by full commit SHA, on the Actions allow-list
([supply chain](./supply-chain.md), Pinned toolchain;
`tools/actions-allow-list.test.ts`).

**The size budget** of the Wrapper's release output (`tools/size-budget.ts`,
unit-tested) is checked by `pnpm check:size-budget` (part of `pnpm check`, and
run by the `build` job), by the release dry run, which prints it in its summary
and reports a problem once, and by the publish step; any measurement over its
limit fails them. Two measurements, each with a limit in bytes (equal to the
limit passes), decided by the human on 2026-10-18 at about 25% over the sizes
measured that day (161873 and 52650 bytes):

- wrapper output: 204800 bytes. Every file of `apps/wrapper/dist/`,
  uncompressed: what the release artifact holds.
- wrapper page, gzip: 65536 bytes. `index.html` and every `.js` and `.css` file,
  each compressed on its own with gzip at zlib's default level and summed: about
  what a player's browser downloads. Another Node's zlib can differ by a few
  bytes; the measurement CI makes, with the pinned Node, is the one that counts.

**The verify page's budget** (V-16, D-3 of [the verify page](../verify-page.md))
is held apart from the Wrapper's: the files under `verify/` do not count in the
two measurements above, and have two of their own, checked by the same three
places with the same rules. Their limits were set by the human on 2026-10-20
from the first build of the real page, about 25% over its measurement of 119788
and 39199 bytes:

- verify output: 150000 bytes. Every file under `verify/`, uncompressed.
- verify page, gzip: 49152 bytes. `verify/index.html` and every `.js` and `.css`
  file under `verify/`, each compressed on its own with gzip at zlib's default
  level and summed.

A budget with no measurement, a measurement with no budget, a missing Wrapper
`dist/`, and an output without `index.html` or `verify/index.html` (an empty
`dist/` included) are failures too, never a pass. Raising a limit is a reviewed
change to `tools/size-budget.ts` and this list together (a test keeps them
equal). The packages' tarballs have no budget (decided).

## Task orchestration and caching

The scripts are [wireit](https://github.com/google/wireit) scripts, declared in
the `package.json` that owns them with their `command`, input `files`, `output`,
`dependencies`, and `packageLocks: ["pnpm-lock.yaml"]`, so the lockfile and the
shared configuration (`tsconfig.base.json`, `.oxlintrc.json`) are inputs of the
scripts that read them. A task whose inputs are unchanged is skipped and its
outputs restored from the cache.

- **Local:** `.wireit/` in each worktree (git-ignored; like `node_modules`, it
  is per worktree). `pnpm clean:cache` empties it.
- **CI:** no task cache. Every workflow sets `WIREIT_CACHE=none`, so each job
  runs its scripts from a clean checkout, and no wireit cache helper runs
  (`.github/actions/setup` caches only the pnpm store, and not in a release
  job). There is no remote cache service (ADR-001 rejected one because it needs
  a credential). CI sets `WIREIT_LOGGER=simple`, so the log shows each script's
  run or skip. The GitHub Actions cache mode (`WIREIT_CACHE=github`) was turned
  off for #53: wireit 0.14.13 reports a script as restored from that cache even
  when the tarball download failed, after it has deleted the output, and records
  it as fresh (logged in CI on #102; google/wireit#1536). wireit 0.15.0 fixes it
  (google/wireit#1542), and the kit is on 0.15.0, but **the CI cache stays off**
  (decided 2026-10-28, #143): every CI run is a clean build, with no third-party
  cache helper step and no cache credentials, and the CI time a cache would save
  is not worth bringing those back. The release workflows stay at `none` too.
  The `release-dry-run` job, which already built with no cache, takes about 35s.
- **A restored build is not trusted to have left its output.** Whatever left a
  kit package's `dist/` missing (a failed cache restore as above, a missing
  wireit dependency), the tool that reads it must not fail with an error that
  names no cause. So every script that reads a kit package's `dist/` runs
  `tools/check-kit-dist.ts <script> [path...]` before its tool: each workspace's
  `typecheck` and `test`, the Wrapper's Vite `build`, and the e2e suite's
  `test`, which also names the apps' `dist/index.html` it serves by path. The
  guard follows the workspace's `workspace:` dependencies (its own
  `devDependencies` included, then each package's `dependencies` and
  `peerDependencies`) through its `node_modules` links and fails, naming each
  file, when a kit package is not linked, its manifest cannot be read, it has no
  `exports` or uses a form the guard does not model (a subpath pattern such as
  `"./*"`, a fallback array), or an `exports` target (`types` and JavaScript
  alike) or a named path does not exist. It prints one line when everything
  exists. Not guarded, because they read no kit `dist/`: the libraries' tsdown
  builds (kit packages stay external, declarations come from oxc) and the
  reference game's build and tests (type imports only, enforced by its
  package-import guard). `tools/kit-dist-workspaces.test.ts` holds every
  `typecheck`, `test`, and `build` of a workspace with a kit dependency to
  running the guard first with its own name, listing the guard's three files
  (`tools/check-kit-dist.ts`, `tools/kit-dist.ts`, `tools/kit-dist-fs.ts`), and
  depending on the `build` of everything the guard checks, unless it is declared
  there as reading no kit `dist/`. Procedure:
  [runbook/development/ci-failures.md](../../runbook/development/ci-failures.md).
- **A cache hit never replaces a gate that could fail.** A script is cached only
  if it declares `files`; the gating checks (`lint`, `format:check`,
  `test:tools`, `check:deps`, `check:contracts`, and the contracts hash check
  when it lands) list every file they read, the test suites list the files they
  read outside their package or depend on the task that produces them, and
  `test:e2e` and `format` declare no `files`, so they always run (the e2e
  package's `test` still declares, as `external` `env`, the variables it reads:
  `SE_E2E_PROJECT`, `SE_E2E_BROWSER_CHANNEL`, and `CI`, so a cache key would
  follow them if it ever got `files`; `test:preview`, which `pnpm check` never
  reaches, declares the preview variables the same way). `lint:ts` depends on
  the build of every kit package: oxlint's import plugin follows an import of a
  kit package through its `exports` into its `dist/` and opens those files, so
  it must not run while a build rewrites them. So `pnpm lint`, and CI's `lint`
  job, build the five packages first (or restore them from the cache). Before
  this edge, a lint with no `dist/` passed without following those imports:
  `import/no-cycle` silently skipped every edge into another package. The two
  Vite builds (the Wrapper's and the reference game's) declare `NODE_ENV` as
  `external` `env`, since `NODE_ENV=development vite build` makes a development
  build, and the Wrapper's build refuses any `NODE_ENV` but unset or
  `production`, any mode but `production`, a set `VITE_USER_NODE_ENV`, and env
  files (`apps/wrapper/src/build-refusals.test.ts` proves each in both
  directions, with a planted `.env` and a `VITE_USER_NODE_ENV` in the
  environment, each beside its control); the tsdown builds do not read it.
  `tools/wireit-edges.test.ts` holds these edges and declarations. `pnpm audit`
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
  origin's socket to loopback and make the test pass for the wrong reason). It
  runs in the Chromium project only (an in-file `test.skip` with its reason).
  The Firefox and WebKit projects have their own block (decided by the human,
  2026-10-18; `browser-flags.ts`): both launch with a proxy at a dead loopback
  port (`http://127.0.0.1:9`, privileged on the Linux runners and listened on by
  nothing) and no bypass, so anything outside a route fails. Firefox also runs
  with WebRTC off (`media.peerconnection.enabled: false`) and with localhost and
  loopback sent through the proxy too
  (`network.proxy.allow_hijacking_localhost: true`; Firefox sends them direct by
  default). WebKit has no WebRTC preference, so every context of a WebKit
  browser of the suite gets an init script
  (`e2e/tests/harness/context-blocks.ts`, applied to the worker's browser and to
  every browser a proof launches) that deletes every global named `RTC…` or
  `webkitRTC…` in every frame before any page script runs, and clears the same
  from a window an iframe's or frame's `contentWindow` or `contentDocument`, or
  `window.open`, hands out (decided by the human, 2026-10-18). Playwright's
  context reuse (UI mode, editor integrations) makes its context without going
  through that, so the worker fixture refuses it in WebKit, saying why. The
  routes still answer: every request the suite expects is fulfilled or aborted
  by a route, none is continued to the network, and a route intercepts before
  the proxy is used; no fake origin is on loopback. Two files prove it, in the
  Firefox and WebKit projects only. `e2e/tests/hermetic-proxy.spec.ts`: the
  worker's browser has exactly those launch options and started through the
  start lock; a request outside every route (to `localhost` by name and to
  `127.0.0.1`) and a dedicated worker's socket, aimed at the loopback listener,
  never reach it, and a control launch without the proxy reaches it with the
  same request or socket (each count is read after the browser is closed, so a
  late retry by a worker is counted); a service worker's socket does the same in
  WebKit, and in Firefox, where Playwright does not route a service worker's
  script fetch, the registration itself fails at the dead proxy with no
  connection (that is the block). A probe shows the cause: a route sees the
  page's own fetch of the script and never the registration's; and a control
  that points the proxy at a listener recording each request line shows a
  `CONNECT` to the test pages' host arriving there during the registration
  (counted just before it and just after, since the browser may send requests of
  its own to that host). `e2e/tests/hermetic-webrtc.spec.ts`: the worker's
  browser has no `RTCPeerConnection` or `webkitRTCPeerConnection`; a script gets
  none back in eight ways: a new iframe read at once through `contentWindow`,
  `frames[n]`, or `contentDocument`; a `srcdoc` iframe once loaded, through
  `frames[n]` and through `contentWindow`; an `<object>`'s window, its document
  chosen per browser by where a test shows Playwright routes an object's
  document request: in Firefox the request is not routed and fails, so a `blob:`
  URL the page makes (same origin, no request); in WebKit it is routed, and the
  hermetic guard would refuse a `blob:` URL, so the routed test page; an object
  that fires no event within 5 s counts as not loaded; `window.open`; and a new
  iframe's own `open` (a way not on this list is not proven closed); and a STUN
  probe aimed at `localhost`, `127.0.0.1`, and `[::1]` on one port, where UDP
  sockets on both loopback addresses count datagrams, finds no
  `RTCPeerConnection` and nothing arrives, while a control without the removal
  and without the proxy (Firefox with WebRTC back on and
  `media.peerconnection.ice.loopback: true`, without which Firefox sends no STUN
  request to a loopback server at all; WebKit without the init script) gathers
  and its datagrams arrive. Each probe's outcome (whether `RTCPeerConnection`
  exists, whether gathering completed, the candidates' types, and the count) is
  recorded as a test annotation and printed as one line on stdout (the outcome
  only, nothing secret), as is the object routing probe's, so the CI log shows
  them. Before any of it, each file fails, saying so, if anything accepts a TCP
  connection at `127.0.0.1:9`, which would make the dead proxy a live one. The
  suite's only open sockets are its own, all on loopback, of three kinds: the
  TCP listener, which takes nothing but connections; the UDP sockets, which take
  nothing but datagrams; and the stand-in proxy of the Firefox service-worker
  control (`listenAsProxy`), which reads one request line from each connection
  and answers nothing. No server or port is opened otherwise. The static origins
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
  channel and the error's name, never a value. There are two excuses. One is a
  `SecurityError` in a frame whose origin is `"null"` (a sandboxed frame, which
  has no such storage), where the origin is the one an init script recorded
  before any page code ran, not `self.origin`, which a page can overwrite. A
  `SecurityError` in a frame with a real origin, or in a page that wrote
  `"null"` over `self.origin`, is reported. The other is WebKit's origin private
  file system (decided by the human, 2026-10-18): in WebKit only, a read that
  fails with `UnknownError` is excused only if a write probe in the same frame
  fails too. Every call the probe makes goes through a frozen capture an init
  script made before any page code ran (`Reflect.apply`, `navigator.storage`,
  `StorageManager.prototype.getDirectory`, `getFileHandle`, `removeEntry`,
  `createWritable`, the writable stream's `write`, and
  `WritableStream.prototype.close`), read as an own non-writable property, so a
  page that replaces any of them cannot make the probe fail; only the language's
  own `await` and `typeof`, and the `name` of the lookup's error, come from the
  page's realm. The probe writes only under a name that a lookup without
  `create` found free (`NotFoundError`): a file there that it did not make is
  left in place, and the probe cannot tell. The probe fails when the root cannot
  be had (no root, no write). Any other error, any other browser, or a frame
  where the probe wrote (or could not tell) is reported
  (`e2e/tests/secret-scan-opfs.spec.ts`: the rule itself, a faked read failure
  where OPFS works, the same with a file of the probe's name the page made
  first, and WebKit's real one). Not covered: request and response bodies, a
  base64 form not aligned with the start of a larger base64 string, and workers.
  The scan runs in the page's own world and trusts the page's built-in APIs: a
  page that replaces a built-in (a storage getter, `console`, `history`) can
  hide what it holds from the scan; the Wrapper is tested as built, not as an
  adversary of the suite. Its negative tests run a deliberately leaking test
  page that opens a session against the fake and leaks one secret through one
  channel; the scan must fail for each channel (WebSocket, `history.state`, the
  origin private file system, and the key as a decimal number included), pass
  the same page leaking nothing, fail on an unreadable channel and an
  unserializable console argument, excuse an opaque frame, and see a draw made
  just before it. Two channels cannot be written in one browser each, so their
  leak test is skipped there, with the reason: the service worker in Firefox (it
  cannot register, below) and the origin private file system in WebKit (it has
  none here). The forms and the redaction are tested in Node alone
  (`e2e/tests/secret-needles.spec.ts`).
- **The accessibility audit** (T-14) is an axe scan (`@axe-core/playwright`)
  with the WCAG 2.2 A and AA tags (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa`), optionally limited to a selector; axe's best-practice rules are
  not applied. A test page with known violations proves it fails. axe resolves
  each rule with a page timer, so under `page.clock` it runs only while that
  clock moves; an audit is bounded at 20 s of real time and fails the test past
  it instead of hanging the run (a paused clock proves the bound). On CI the
  whole Playwright run is bounded too (`globalTimeout`, set only when `CI` is
  set): 10 minutes, well above a normal run (the slowest `test:e2e` step in
  recent runs, build included, took 92 s), so a hang that outlives a test's own
  timeout fails the job with Playwright's report before the job's 30-minute
  timeout. A local run is not bounded.
- **The network control** (T-15): `goOffline` and `goOnline` toggle the
  browser's offline emulation and cut the fake Play API with it; `cutPlayApi`
  fails only the Play API while the page stays online. A single failing or
  never-answering call is scripted on the fake. `sent` is every Play API call
  the page sent, its body decoded, read from the browser context's `request`
  event, held in memory and never logged: offline, Playwright's Firefox fails a
  request (`NS_ERROR_OFFLINE`) before any route sees it, so the fake records
  none there, while Chromium and WebKit route it (`OFFLINE_ROUTED`, which a test
  in `network.spec.ts` asserts per project, printing one stdout line); the
  `request` event sees it in every project. `goOnline` turns the browser online
  before it restores the fake, so the page's first request after it can still
  reach a cut fake and fail once, and the transport repeats it (seen in WebKit
  on CI): assert at least one read before an action, not exactly one.
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
  that need a round W-26 passes (T-10, T-11, T-14, T-15's signed action and its
  resend of a move lost offline, T-16's round errors, T-19) run on the vendored
  Coin Flip round, and T-12 on the vendored Cash or Crash `[3,3,4]` rounds
  (`valid/cashorcrash-cash-out-*` for the cash-out and
  `valid/cashorcrash-last-row-*` for the last surviving move, each issued for
  the same action key, signer, domain, entropy source, entropy chain id, and
  randomness block, which the harness checks when it loads), and T-24 on the
  vendored book round of one session (`valid/book-lifecycle-*`: `idle`, the
  start answered `starting` with no `proofs`, a read `starting` bound, and a
  read `won`, or in a second run `lost`, and a start answered 401
  `SESSION_REVOKED`; a book round carries no `CreateRoundAuth`, and the start's
  `actionKey` is the same scripted key, its bet the idle Snapshot's default)
  (`harness/round-play.ts`, `harness/round-vector.ts`): the seeded random source
  gives the Wrapper's key draw the `signed-action/coinflip-cancel` vector's test
  key, read from `contracts`' test-only entry at run time and never copied into
  a file, so the round's vendored `CreateRoundAuth` is the session's; a round
  configuration pins its signer, domain, and entropy source; fake RPC endpoints
  answer the tip check (`harness/fake-rpc.ts`, which can fail it on purpose);
  and the fake Play API checks the start's `actionKey` and the move's,
  cash-out's, and cancel's bytes against the vectors (an answer's `expect`; the
  cash-out's and the cancel's signatures byte for byte against their
  `signed-action/` vectors), and can answer a code no vector holds
  (`own-problem`), a `valid/` Snapshot at another `version` (`snapshot-version`,
  for W-29's drop: only `version` is replaced, and the value is checked against
  the vendored schema's `version`, an integer at or above its minimum, before
  the answer is queued, so the body stays one the schema accepts; a `version`
  definition with any keyword but `description`, `type`, and `minimum` allows no
  override, fail closed), and, for W-28 only, an `invalid/` Snapshot. The
  harness's own checks have their tests (`round-harness.spec.ts`). No row is
  pending now: `e2e/tests/pending.spec.ts` is where a row that cannot run yet is
  declared with `test.fixme`, reported as skipped, never as passed, and it lists
  none. Every spec file runs in all three projects except the proofs of the
  blocks (above): `hermetic-workers.spec.ts` in Chromium only, and
  `hermetic-proxy.spec.ts` and `hermetic-webrtc.spec.ts` in Firefox and WebKit
  only, each skipped elsewhere with its reason. One browser behavior differs per
  project and is proven as such, since the Wrapper works around it: a parent's
  `focus()` while its frame has the focus (W-46's move from the game frame to
  the result or error heading) moves the focus in Chromium and WebKit, and
  leaves it in the frame in Playwright's Firefox build, whose frames run in
  their parent's process (`fission.webContentIsolationStrategy` 0); with the
  frame element blurred first, as the Wrapper does, it moves in every project
  (`focus-from-frame.spec.ts`, `FOCUS_FROM_FRAME` in `harness/frame-focus.ts`,
  one stdout line). A release Firefox (159) moves it without the blur, checked
  by hand. T-14 asserts the full W-46 rule in every project: the result heading
  focused, the game's heading not focused, and the game's document without
  focus. T-9a's e2e cases
  ([the test plan](../wrapper/operator-embedding.md#the-test-plan-for-t-9a)) run
  in all three, against a fake operator page (`e2e/tests/operator`,
  `harness/operator-page.ts`) on a third test origin
  (`https://casino.e2e-operator.test`, with a lobby and a deposit page) and on
  an unlisted fourth (`https://pages.e2e-unlisted.test`); the bundle is served
  without the `frame-ancestors` header by default, and with it where a case asks
  (`serveWithFrameAncestors`); a Snapshot answer may carry the operator's
  `context.links` (`links`). Every project's browser has
  `location.ancestorOrigins`, Firefox's included (the first Firefox run,
  2026-10-18), and that is asserted; the Wrapper's path without the list is a
  component test. With `referrerpolicy="no-referrer"` on the operator's iframe,
  Playwright 1.64.0's Firefox build masks the entry (`"null"`) and the Wrapper
  refuses; its WebKit build, and an installed Google Chrome 155 run as the
  Chromium project through the opt-in `SE_E2E_BROWSER_CHANNEL=chrome`, keep it
  (recorded 2026-10-19; Playwright's own Chromium build is recorded by CI's
  Chromium job, which the test annotates).
- **The verify page's fake** (`harness/fake-verify-api.ts`, `verify-rounds.ts`,
  `verify-page.ts`;
  [the verify page](../verify-page.md#the-e2e-fake-of-the-verify-api-built)): a
  route at the configured `verifyApiBaseUrl` (the Wrapper's origin plus
  `/verify/v1`) answering a round, not found, a scripted error, an unreadable
  body, or an abort (errors with the document's `Problem` body); canned rounds
  in the verify API document's shape, built at run time from the vendored round
  (matching, one tampered field per check, not ended, unknown kernel, a shape of
  three options) and two rounds the backend recorded (`recorded-rounds/`, a
  `won` and a `lost` one, so checks 5 and 7 recompute and match, each with a
  tampered copy); the host's rewrite of `/verify/rounds/*` to the bundle's
  `verify/index.html`; and the round tests' fake RPC endpoints for check 6. Its
  own tests are `fake-verify-api.spec.ts`; VT-5 is `verify-page.spec.ts` and
  `verify-page-recorded.spec.ts`, which run against the bundle's page and fail,
  with a message, if the bundle lacks it (they never skip). The catch-all route
  still refuses and records any other request (VT-8's last clause). The
  remaining rows: VT-6 (`verify-link.spec.ts`: the Wrapper's verify link after a
  win opens the page in a new page, which reaches V-6), VT-7
  (`verify-page-accessibility.spec.ts`, `verify-page-keyboard.spec.ts`: axe on
  every state, keyboard, focus, live regions, 200 % zoom), and VT-8
  (`verify-page-policy.spec.ts`: the page served with the built `headers.json`
  `/verify/*` policy, its placeholder filled as the deploy side does, via the
  `verifyPolicy` option of `verify-page.ts`: no `securitypolicyviolation`, the
  policy enforced, `integrity` on every script and stylesheet and enforced by
  the browser, no request outside the configured origins).
- **Locally**, `pnpm exec playwright install chromium` (in `e2e/`) installs the
  browser once; `pnpm test:e2e` runs the `chromium` project unless
  `SE_E2E_PROJECT` names another (`firefox`, `webkit`, after installing that
  browser). Where Playwright's download is unavailable,
  `SE_E2E_BROWSER_CHANNEL=chrome` runs the Chromium project on an installed
  Chrome. It is a development-only option: CI does not use it and always runs
  Playwright's own browsers.
- **Browser starts**: every browser the suite starts, each worker's and any a
  test launches of its own (`hermetic-workers.spec.ts`,
  `hermetic-proxy.spec.ts`, and `hermetic-webrtc.spec.ts` launch up to two per
  test), starts through `startBrowser` (`e2e/tests/harness/browser-start.ts`),
  development and CI alike. The worker's browser does so through
  `e2e/tests/harness/worker-browser.ts`, which launches it with the project's
  options as Playwright does; a remote browser (`connectOptions`) fails the
  worker, and Playwright's dashboard bind is not made. A start is the launch and
  the browser's first context, and each has 10 s.
  - **One start at a time per user** on the machine, under a lock file created
    exclusively in the temporary directory and named for the user's id
    (`e2e/tests/harness/start-lock.ts`), removed when the start ends. A lock
    whose holder process is gone is taken over at once, and one older than 60 s
    whatever its holder; the takeover is not atomic, so two starts may overlap
    once after a holder died, which is the failure the lock prevents and no
    worse.
  - **Why:** on macOS, an installed Google Chrome whose start overlaps another's
    can deadlock for good (its main thread waits on RunningBoard for an App Nap
    assertion) and never answer, so a longer timeout does not help. A start the
    lock does not see (another Chrome on the machine) can still set it off.
  - **A start that runs out of time has deadlocked:** the process group of the
    browser it launched is killed with SIGKILL, one line on stderr says so, and
    exactly one new browser is started under the same hold of the lock. A second
    timeout fails the start, saying so, and any other error fails it at once.
    The group killed is found with `ps` (so every start needs `ps`, on macOS and
    Linux): a child of the worker process that leads its own process group (as
    Playwright starts every browser) and was not a child before the launch. The
    listing and the signals run in one synchronous turn, and only the group is
    signalled, never a bare process id, so no other process can be reached: a
    child's id, and the group it leads, are not reused before the worker reaps
    it, which cannot happen within that turn. A group already gone (ESRCH, or
    EPERM for an unreaped one on macOS) is left.
  - **This is not a retry of a test:** no test or assertion is ever run again,
    the browser it runs on is a fresh one with the same options, and a start
    that keeps failing still fails the test.
- **Telemetry**: the harness writes nothing but Playwright's own report, the
  start lock (a process id and a counter), and the one stderr line of a killed
  start (which part timed out and after how long; nothing else). A finding's
  detail, a refused URL or WebSocket, and the fake's record of unexpected calls
  have every form of every known secret (the fake's launch code and tokens, and
  the 32-byte draws) and anything secret-shaped replaced by `[redacted]`; the
  fake keeps whether a request was authorized, never the token.

**Where the preview-stack e2e runs, and the preview mode** (RFC-002). The
SuperEngine preview stack is private, so a public CI job cannot reach it without
a credential. This repository owns the e2e **suite** and its `preview` mode; a
job owned by the backend repository checks this repository out at a **pinned
commit**, installs with `--frozen-lockfile`, builds the Wrapper and the
reference game, and runs `pnpm test:e2e:preview` against its own throwaway
stack. That job holds no secret that this repository sees. The same suite runs
against the fake Play API in this repository's own CI, so a change here is
checked without the backend. Only the fake-API suites are deterministic and
hermetic; the preview run (wrapper.md T-10 to T-12, and so AC1) talks to a real
stack, is **not hermetic**, and is never part of `pnpm check` or of this
repository's required CI jobs. The procedure is
[`runbook/preview-e2e.md`](../../runbook/preview-e2e.md); the pin lives in the
backend repository.

- **The project and how it is reached.** `preview` is a fourth Playwright
  project (`e2e/playwright.config.ts`), Chromium only, never the default. The
  only way to run it is `pnpm test:e2e:preview`, which runs the e2e package's
  `test:preview` script: a `tsx` launcher
  (`e2e/tests/preview-support/run-preview.ts`) that sets the entry marker
  `SE_E2E_PREVIEW_ENTRY=script` and starts `playwright test --project=preview`.
  The config defines the project **only when the marker is set**; asked for
  without it (`pnpm test:e2e` with `SE_E2E_PROJECT=preview`, or a bare
  `playwright test --project=preview`) it throws a refusal that names the
  script. The marker guards against an accidental run; it is not a security
  boundary, and it is not a variable the backend's runner sets. `test:preview`
  declares no `files` and no `output`, so wireit never caches it, and no script
  but the root `test:e2e:preview` depends on it, so `pnpm check` never reaches
  it. Playwright (1.64.0) loads the config in the runner process and again in
  every worker process: the marker is an environment variable the workers
  inherit, and the check is the same in each.
- **Variables**, parsed only under the marker, by the pure
  `preview-support/preview-environment.ts` (a function of an environment passed
  as a parameter: it reads no `process.env` and does nothing at import). A
  missing or malformed one fails in the config or the global setup, before any
  browser starts, with a message that names the variable and a reason from a
  closed set and holds no value. Origins are serialized origins as in W-37
  (`https://host[:port]`, or `http:` on a loopback host only; no path, query,
  fragment, or credentials; no wildcard). `SE_E2E_PREVIEW_ORIGIN` (required):
  serves the Wrapper page and the environment document.
  `SE_E2E_PREVIEW_LAUNCH_COMMAND` (required): the **absolute** path of the
  launch hook's executable. `SE_E2E_PREVIEW_GAME_ORIGIN` (required): the one
  `https:` game origin both games run at, different from the preview origin; the
  suite serves the reference game's build at it by a route.
  `SE_E2E_PREVIEW_ALLOWED_ORIGINS` (optional): comma-separated origins the
  browser may reach besides the preview origin, such as the chain RPC endpoints.
  There is no variable for a launch code, a token, a key, or a funding endpoint.
- **The launch hook.** Called once per session a test opens, as
  `<command> <game id>` with `coin-flip` or `cash-or-crash` (the kit's own
  labels for the backend to map), without a shell, with standard input closed
  and standard error dropped, a timeout (15 s) that kills the child's whole
  process group, and a bounded output (4 KiB). It receives the runner's
  environment plus `SE_E2E_PREVIEW_ORIGIN`, funds a new player, and prints one
  line: the launch URL, validated exactly (one line, the preview origin, no
  credentials, no query, the path `/`, a fragment of 1 to 128 characters that is
  the launch code). Every failure is a `LaunchHookError` holding an exit code
  (or none) and a reason (`start`, `exit`, `timeout`, `output`, `line`), never
  the command or any output, and no `cause`.
- **The browser** gets a minimal explicit environment (`launchOptions.env`:
  `PATH`, `HOME`, `TMPDIR`, `LANG`, and nothing else), never the runner's, so no
  `SE_E2E_*`, proxy, or credential name reaches it. The runner must not rely on
  any variable reaching the browser.
- **The network.** `guardPreview` replaces the hermetic guard in the preview
  fixtures only: a request (or WebSocket) to an origin on the allow-list (the
  preview origin and the listed ones, exact match, no pattern) continues to the
  network and any other is aborted and recorded **as an origin only**, never a
  URL, because the path or query of an RPC URL can hold a provider key. The
  shared game origin is not on the list: a route fulfils it from
  `apps/reference-game/dist`. The browser-level block stays: Chromium's
  `--host-resolver-rules` is `MAP * ~NOTFOUND` plus an `EXCLUDE` per host of the
  allow-list. Chromium applies the rules to an IP literal too, so a literal is
  excluded as well, an IPv6 one without its brackets. The fake projects' flags
  are constants and are not computed from any variable. A request the test makes
  itself (the verify API read, the environment document) is checked on the same
  list and refused before it is sent, naming the origin only, and follows no
  redirect, since only its first URL is checked.
- **The environment document check** (global setup, and again in each test's
  fixture): the document is fetched as the Wrapper fetches it (no credentials,
  no cache, no redirect, 15 s). `environment` other than `preview` stops the
  run; `playApiBaseUrl` and `verifyApiBaseUrl` are read from the document, never
  derived from the preview origin; every origin the browser would reach (the two
  API bases, each RPC endpoint) must be on the allow-list, and `gameOrigins`
  must list the shared game origin; a failure names the check or the origin
  only. The Wrapper's own rules (W-26a, W-26b, the `preview` boot rule) are not
  relaxed. A best-effort comparison of the served page's hashed asset names with
  `apps/wrapper/dist` is reported on a mismatch and never fails the run; the
  primary check is that the runner hands the stack and this project the same
  pin.
- **The rows in preview mode** assert properties the contracts promise, read
  from the Snapshots the browser received (in memory, never logged), not vector
  bytes. T-10 and T-11 play Coin Flip rounds until a win (T-10) or a loss (T-11)
  is seen, at most 40; for every round that ends: the Wrapper reached `active`,
  the heading agrees with the Snapshot, the round id shown is the Snapshot's,
  the verify link is present, and the verify API answers 200 with a `status` and
  a `payout` that agree (as `bigint`); the payout line shows `payout.formatted`
  when the payout is above 0 and is absent when it is 0 (W-34). T-12 launches
  Cash or Crash `[3,3,4]`, picks the first tile of row 0 until a pick survives
  (at most 40 rounds), cashes out with the Wrapper's control (W-24), and asserts
  `won`, the payout line, the verify API's agreement, and that nothing is
  offered after the close; the last-surviving-move half is not played against
  the stack. T-12 depends on the stack certifying Cash or Crash `[3,3,4]`
  (OQ-3). The accessibility audit runs on the result state. W-29 is not a row: a
  helper records the `version` of every Snapshot response of a session and,
  among responses that did not overlap another Snapshot response in time,
  asserts it never decreases. The backend's first real run passed it, and W-29's
  interim limit is removed; the run at the pin passed it again.
- **The secret scan stays on** in every preview test, over every channel it
  reads, with no weaker needle set. The launch code is registered before the
  navigation, the play token when the `sessions:redeem` response is read, and
  the shaped patterns stay on. The action key is a draw the preview fixtures
  script with **one key per test generated in Node** (`crypto.randomBytes(32)`),
  never the public vector key; tracing must be off (the scripted bytes are an
  init-script argument), and the bytes are never logged, attached, or written.
  Every failure message goes through `redactSecrets`; the hook's output, the
  launch URL, the token, and the key are never in a test title, annotation,
  attachment, or the report. A navigation failure is rethrown redacted, since
  Playwright's message names the URL.
- **Tests of the mode itself** are hermetic and run on every change. In
  `e2e/tests/preview-guard/` (an ordinary directory of the fake projects, so
  `pnpm test:e2e` runs them): the variable parser, the launch-line validator,
  the launch hook against absolute-path fixture scripts (success, a non-zero
  exit, a timeout that leaves no child behind, over-long output, a sentinel on
  standard output and standard error that appears in no error), the browser
  environment, the allow-list's `--host-resolver-rules`, the bounded loop, the
  version helper, the Snapshot readers, and the config's decisions; and, in the
  Chromium project only, against a **local loopback test server** (an HTTP
  listener on `127.0.0.1` that the test owns; not real network), `guardPreview`
  (an allowed origin continues, a disallowed one is refused and recorded as an
  origin with no path or query, WebSockets), the environment document check, and
  the game origin fulfilled by a route with no request to any socket. Those
  tests launch a browser of their own with the preview project's flags, since
  the fake Chromium project resolves no host. The preview specs themselves
  (`e2e/tests/preview/`) are not run by this repository's CI; the backend job
  exercises them. `tools/e2e-preview-*.test.ts` (run by `pnpm test`) assert that
  the root `check` script's closure holds neither preview script, that the
  config has no `preview` project without the marker and refuses it, that the
  fake projects ignore the preview specs and keep their launch options, that no
  `harness/` module and no fake-project spec reaches `preview-support/`, and
  that every preview spec awaits a clean secret scan, and that the generic
  routes and the launcher fail as above.
- **The pin** is a full 40-character commit SHA of this repository's `main` (and
  the release version it corresponds to, once one exists); a branch or a tag
  alone is not a pin. It moves only by a backend pull request that reads the
  runbook's **Changes** table. The kit records every rename of a variable,
  change of the hook's contract, and change of an assertion that needs something
  new from the stack. The first pin was the merge commit of the pull request
  that implemented RFC-002; the pin is now a commit at or after the pull request
  that anchored the spec selection to the tests directory, the merge commit
  `0693bc7961318b500a2fed91f09021128a24b35c` (the runbook records it).
- **The first real run** (the backend's, at kit commit `9c305bbd`, against its
  preview stack) passed T-10, T-11, and T-12 and the preview-guard specs in 19.1
  s in all, each preview spec in 1.3 to 1.6 s. One failure came from the
  checkout path, which had a `preview` directory in it: Playwright matches a
  string `testMatch` or `testIgnore` against the file's absolute path, so
  `preview/**` selected every spec for the preview project (and would have
  ignored every spec in the fake ones). The project's `testMatch` and the fake
  projects' `testIgnore` are now one regular expression anchored to the tests
  directory's absolute path, and `tools/e2e-preview-checkout-path.test.ts` runs
  Playwright's listing in a copy whose path has a `preview` directory to show
  the selection is the same wherever the repository is checked out.
- **The run at the pin** (the backend's, on 2026-10-26, at kit commit
  `0693bc79`, against a freshly started preview stack, outside the backend's CI
  job) selected exactly T-10, T-11, and T-12, and all three passed in about 1.5
  s. The backend's job has not run the mode in CI yet.
- **The numbers**, set from the first run with headroom for a cold stack: the
  per-test timeout is 2 minutes, the run timeout 15 minutes, the launch hook's
  15 s, and the wait for one step of a round 30 s; each is one constant
  (`preview-config.ts`, `launch-hook.ts`, `preview-rounds.ts`). The run at the
  pin is far inside them, so they stay. The browser's environment names (`PATH`,
  `HOME`, `TMPDIR`, `LANG`) are not yet measured on the backend's job runner:
  neither run was in the backend's CI job; where they ran, a headless Chromium
  started with these four alone, and the job has not run. A name is added only
  when a runner needs one (the runbook's Troubleshooting).
