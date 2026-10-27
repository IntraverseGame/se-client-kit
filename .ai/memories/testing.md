---
description: How tests are organized and how to add one. Read before writing or changing tests.
last-verified: 2026-10-27 (preview run evidence: the run at the pin, the browser names not yet measured on the job runner; preview mode of the e2e suite pull request, RFC-002: the `preview` project, `preview-support/`, `preview-guard/`, `tools/e2e-preview-*.test.ts`, the reference game plays any `steps` round; verify e2e rows VT-6 to VT-8 pull request: the link, accessibility, and policy and SRI specs, the `verifyPolicy` option; recorded verify rounds pull request: the backend's won and lost rounds in the e2e fake; verify API document pull request: the verify API document vendored into `contracts`, `apps/verify` reads its `RoundVerification`; verify e2e fake pull request: the fake verify API, the canned rounds, VT-5's rows; verify page states pull request: the states, view, checks 1 to 4, and verify API read tests of `apps/verify`; operator launch contract pull request, #42: T-9a's unit, component, and e2e cases, the fake operator page, the mutation checks; verify kernel pull request: `apps/verify` replays `kernelVectors.v1`; re-read after a drop pull request: T-20, `snapshot-reread.test.ts`, the fake's `snapshot-version`; fairness kernel vectors pull request: `kernelVectors.v1`, replayed by no test until the verify page; e2e fake round pull request: the round harness, the fake RPC, the round rows; reference game import guard pull request: the exact Vite helper ids and the copied-asset cases of `build.test.ts`; shell cancel fold-in pull request: the session cancel tests over disagreeing RPC endpoints, the Wrapper's cancel-states tests, the mutation checks; Wrapper session pull request: the session's tests on a manual wall clock, the Wrapper's fake session, the browser rows on the release bundle, `redeemAgain`; reference game pull request: the game's unit, component, and build tests, the game-page e2e smoke, the type-only subpath check; release dry run pull request: the tarball check, the tar module, the Wrapper artifact; shell round flows pull request: the scripted Play API transport and the typedData vectors through the flow; e2e harness pull request: the fake Play API, the secret scan, axe, the network control; Wrapper configuration and rendering pull request: the component tests; play-client cancel pull request: the cancel cases; shell entropy chain id pull request: the tip check's chain id; play-client operations pull request: the fake Play API server)
---

# Testing (agent context)

Rules: [specs/client-kit/testing-and-ci.md](../../specs/client-kit/testing-and-ci.md) and the
[Wrapper test plan](../../specs/wrapper.md#test-plan); procedure for adding
tests: [write-tests skill](../skills/write-tests/SKILL.md).

## Orientation

- **Unit** (Vitest) beside the code of each package: no real network, disk,
  timers, or clock; inject a clock and a random source; one behavior per test.
- **Vector replay:** wire and crypto formats are tested by replaying vendored
  vector files (signing vectors, Snapshot `valid/`, `invalid/`, `signature/`,
  and `typed-data/` vectors) read through the test-only entry of the `contracts`
  package. The `signed-action/` vectors (`snapshotVectors.signedAction`) are
  replayed by `signing`'s and the shell's `cancel-vector.test.ts`;
  `tools/contracts-signed-action.test.ts` checks their pairing with `typed-data/` and `valid/` and that their embedded
  key is signing's `PLAYER_KEY`. The fairness kernel's public vectors
  (`kernelVectors.v1`) are replayed by the verify page's unit tests
  (`apps/verify/src/*.test.ts`, VT-2, through `src/fixtures/kernel-vectors.ts`;
  each set's vector count is asserted so none is skipped), with StepsDerive
  written there, never in `contracts`; `signing`'s `keccak.test.ts` checks the
  seeds they name as `keccak256` of a text. Checks 5 and 7 are tested with
  evidence built from those vectors (the reference seed, and Coin Flip's
  (2, 1) from the n = 2, k = 1 derive chain); `roundSecretHash` has no vector,
  so its expected value is a constant computed outside the kit. ShuffleDraw's
  rejection limit, which the `shuffle-draw` set states, has its own unit tests
  (`drawLimit`, `acceptDraw`), since no vector rejects. VT-10, the verify page's shared-origin rule, is a text scan
  in `tools/shared-origin.test.ts` over `apps/verify`'s non-test sources and
  HTML (comments and strings included). Checks 1 to 4 replay the Snapshot
  `signature/` vectors (`src/fixtures/rounds.ts` writes them as the verify API's
  `RoundVerification` body, `fixtures/verify-body.ts`, since no vendored vector
  is a verify API body, and parses that through the page's own verify API
  read; `tools/verify-api-patterns.test.ts` holds the reader's patterns to the
  vendored document); the page's states are tested on an injected `fetch`,
  clock, and address bar (`page-state.test.ts`, `page-state-config.test.ts`, and the driver `fixtures/page-controller.ts`), and its view in jsdom
  (`render*.test.ts`, with `// @vitest-environment jsdom`, VT-4; axe, keyboard,
  and zoom are the browser rows, not built). The stylesheet's V-14 rules are
  checked from `tools/verify-page-styles.test.ts`, since `apps/verify` has no
  Node types. `tools/config-parity.test.ts` runs one shared set of
  configuration documents (`tools/fixtures/config-documents.ts`) through the
  Wrapper's and the verify page's validators and requires the same verdict and
  issues (V-3); `test:tools` builds `contracts`, `signing`, and `shell` first
  for it. Only tests may import that entry, and no
  vector may reach a bundle (a lint rule and a build check). Prefer adding a
  vector to adding a one-off assertion.
  Released vector files are never edited. The vectors were produced by an
  independent implementation in another language; that independence is the
  point, so do not regenerate them from this repository's code.
- **Component** (Vitest with jsdom): the Wrapper renders every valid Snapshot;
  accessibility checks on components. The reference game's tests
  (`apps/reference-game/src/*.test.ts`) drive the controller and the page with
  a fake parent (`src/fixtures/parent.ts`: records posts, delivers a message
  from the parent or any other source and origin) and hand-written game copies
  of the Coin Flip Snapshots (`src/fixtures/snapshots.ts`): the game's tests may
  import only types from the kit, so no vector and no shell code. `build.test.ts`
  (Node environment) runs the real Vite build of the app in memory and the
  package-import guard over scratch sources under `tmpdir()` (a kit or
  third-party package fails a build, `vite/module-runner` included; the dev
  server still resolves a third-party one, so tests may import `vitest`).
  `package-import-guard.test.ts` holds the copied-asset cases (`new URL`, CSS
  `url()`, HTML `<img src>`, a file under 4 KiB, a symlinked `<img src>`), the
  worker cases (a worker importing a kit file or a third-party package; the
  guard is in `worker.plugins`), the `packagesDirFor` path cases (a space, a
  non-ASCII character), and runs the guard's `generateBundle` hook on its own.
  The scratch root has a stand-in package `node_modules/scratch-dep`, so an
  unguarded bare import would resolve and build. Both use `src/fixtures/scratch-build.ts`:
  scratch builds with the game's own `vite.config.ts` (its guard and
  `assetsInlineLimit: 0`), in a real-path scratch directory (Vite resolves a
  relative URL from its importer's real path, and macOS's `tmpdir()` is a
  symlink), treating `*.md` as an asset because the kit packages hold no
  image. `plain-data.test.ts` and the
  accessor and sparse-array cases of `protocol.test.ts` exist because those
  parser mutants survived the message-level tests; keep them.
  `tools/type-re-exports.test.ts` runs the inline-type re-export check over the
  repository (oxlint has no non-type-aware rule for it).
- **Signing tests** (`packages/signing/src/*.test.ts`) read vectors through
  `src/fixtures/vectors.ts` and `src/fixtures/typed-data-vectors.ts` (the only
  importers of the test-only entry there; `typed-data.test.ts` replays every
  `typed-data/` vector byte for byte in hex and base64)
  and use the two public development keys in `src/fixtures/keys.ts` via an
  injected random source. Tests are typechecked by `tsconfig.test.json` (Node
  and Vitest types); `tsconfig.json` covers the shipped source only, so the
  source cannot use Node or DOM globals. oxlint forbids conditionals in test
  bodies: put branching in module-level helpers.
- **e2e** (Playwright): win, loss, cash-out, offline, typed errors, two tabs,
  the sandbox, accessibility, and a scan that no secret reaches the page, logs,
  or storage. They run against an in-repo **fake Play API** that answers from
  the contract's vectors, so a public CI job needs no private service.
  Preview-stack e2e runs elsewhere, against a pinned commit of this repository:
  the `preview` project (RFC-002, `e2e/tests/preview/`, support in
  `e2e/tests/preview-support/`) is defined only under the launcher's entry
  marker, reachable only through `pnpm test:e2e:preview`, refused by the generic
  routes, and never part of `pnpm check`; its hermetic tests live in
  `e2e/tests/preview-guard/` (they run in every fake project; the ones that need
  a socket use a loopback test server, in a browser of their own with the
  preview flags, Chromium only), and `tools/e2e-preview-*.test.ts` prove the
  boundary (script closure, config, imports, launcher, and that every preview spec awaits `secretScan.expectClean()`, `e2e-preview-specs.test.ts`). The test's own verify API read (`verify-read.ts`) checks the allow-list first and follows no redirect. Chromium applies
  `--host-resolver-rules` to IP literals too: an IP-literal host needs its own
  `EXCLUDE` (IPv6 without brackets). Playwright 1.64.0 loads the config in the
  runner and in every worker. Preview specs never import the fake Play API, the
  fake verify API, the fake RPC, or the round checks; no `harness/` module
  imports `preview-support/`. The backend's first real run (kit commit `9c305bbd`)
  passed T-10, T-11, and T-12 and the preview-guard specs in 19.1 s; its one
  failure was the checkout path having a `preview` directory in it: Playwright
  matches a string `testMatch`/`testIgnore` against the absolute path, so
  `preview/**` selected every spec under the preview project (and would have
  ignored every spec in the fake ones). The config now uses one regular expression
  anchored to the tests directory (`previewSpecPattern`), and
  `tools/e2e-preview-checkout-path.test.ts` lists specs with the real Playwright
  in a copy whose path has a `preview` directory. Timeouts are set from that run
  (test 2 minutes, run 15 minutes, hook 15 s, step 30 s). The run at the pin
  (`0693bc79`, 2026-10-26, not in the backend's CI job) selected exactly T-10 to T-12 and passed in
  about 1.5 s; the backend's job has not run in CI yet, so the browser's four
  environment names are not yet measured on its runner. Runbook:
  `runbook/preview-e2e.md`.
  The harness is `e2e/tests/harness/` (spec: testing-and-ci.md, "The e2e
  harness"); import `test` and `expect` from `harness/fixtures.ts`, never from
  `@playwright/test`. Every test is hermetic automatically (all origins are
  context routes under `.test`; any other request fails the test) and has the
  seeded `crypto.getRandomValues` (`randomDraws`). On request: `fakePlayApi`
  (script answers with `answer`/`answerEvery`: `valid/` vectors by name,
  `snapshot-version` (a `valid/` Snapshot with only its `version` replaced,
  checked against the schema's `version`; T-20's dropped answer),
  `network-failure`, `hang`; an unscripted call fails the test, clear expected
  ones with `takeUnexpected`), `secretScan` (call `allowLaunchNavigation` for
  the launch URL, then `expectClean`; a channel it cannot read is an
  `unreadable` finding, only a `SecurityError` in an opaque frame is excused;
  WebSocket URLs come from the hermetic guard, which closes every socket), and
  `network`. A test that makes a refused request or socket on purpose clears
  it with `hermetic.takeRefused()`. Behind the routes, the Chromium project
  runs with `--host-resolver-rules=MAP * ~NOTFOUND` (`harness/browser-flags.ts`):
  worker sockets and other unrouted traffic reach no host by name, unrecorded
  (`hermetic-workers.spec.ts` proves it with a loopback listener and a control
  launch). **Projects:** `chromium`, `firefox`, `webkit`
  (`e2e/playwright.config.ts`). `pnpm test:e2e` runs one,
  `SE_E2E_PROJECT` (default `chromium`, so local runs need Chromium only); CI's
  `e2e-fake` is a matrix with one job per project, each installing only its
  browser. Firefox and WebKit block traffic outside the routes with a dead-port
  proxy (`http://127.0.0.1:9`, no bypass), Firefox also with
  `media.peerconnection.enabled: false` and
  `network.proxy.allow_hijacking_localhost: true` (`harness/browser-flags.ts`),
  and WebKit with an init script that deletes every `RTC…`/`webkitRTC…` global
  in every frame and clears new windows handed out by `contentWindow`,
  `contentDocument`, and `window.open` (`harness/context-blocks.ts`,
  `applyContextBlocks`: wraps the browser's `newContext`, applied to the
  worker's browser in `worker-browser.ts` and to the proofs' own launches;
  Playwright's context reuse bypasses `newContext`, so the worker fixture
  throws in WebKit when `_reuseContext` is on).
  Proofs, Firefox and WebKit only: `hermetic-proxy.spec.ts` (TCP cases; the
  service worker's socket in WebKit; in Firefox the registration itself fails,
  since Playwright does not route a service worker's script fetch there, and a
  probe shows the route sees the page's fetch of the script but never the
  registration's; a control points the proxy at `listenAsProxy`, which records
  request lines, and counts the `CONNECT` to the pages' host just before and
  after the registration, since the browser sends some of its own) and
  `hermetic-webrtc.spec.ts` (no `RTCPeerConnection` in the worker's browser or
  in a new window, the eight ways `freshWindowsWebRtc` lists, its `<object>`
  document per browser from `OBJECT_ROUTING`, the table `objectRouting`'s test
  asserts: a page-made `blob:` URL in Firefox, which does not route the
  object's request (it fails), the routed `/blank.html` in WebKit, which routes
  it, so the guard would refuse a `blob:` URL; no event in 5 s is "not
  loaded"; STUN probe `no RTCPeerConnection` with 0 datagrams; a control
  without the removal and
  without the proxy gathers and its datagrams arrive, Firefox's with
  `media.peerconnection.ice.loopback: true`, since Firefox otherwise sends no
  STUN to loopback). WebRTC probes in `harness/webrtc-probes.ts`. Shared launch helpers in `harness/blocked-launch.ts`
  (every launch through `startBrowser`; `proxy: undefined` drops the proxy,
  `contextBlocks: false` drops the init script), page helpers in
  `harness/outside-routes.ts`, a UDP counter on both loopbacks in
  `harness/loopback-datagrams.ts`. `hermetic-workers.spec.ts` is Chromium only;
  each proof skips in-file with a reason. Counts are read after the browser
  closes; probe outcomes are `stun-probe` annotations and one stdout line each
  (`stun-probe …`, `object-routing …`; data only), so the CI log shows them. A `beforeAll` fails each
  proof file if anything accepts on `127.0.0.1:9` (`expectNothingAccepts`).
  Leak-channel tests skipped per browser, with reasons: `service-worker` in
  Firefox, `origin-private-file-system` in WebKit. The scan's second excuse:
  WebKit only, an OPFS read failing with `UnknownError` whose same-frame write
  probe fails too (every call through a frozen start-time capture of
  `Reflect.apply`, the root access, and the handle methods,
  `harness/origin-capture.ts`) (`isExcusedOpfs` in `harness/secret-scan.ts`; `secret-scan-opfs.spec.ts`).
  The opaque-frame excuse reads the origin an init script recorded
  (`harness/origin-capture.ts`), never `self.origin`. The hermetic fixture
  also serves the Wrapper's environment configuration document
  (`harness/environment-config.ts`, a valid `preview` document pointing at the
  fakes); a test can override that route to serve another document. `secret-needles.spec.ts` is Node-only
  (imports `@playwright/test` directly, no page). The fake answers only listed
  statuses: a self-written problem the operation does not list becomes an
  unexpected call. `auditAccessibility` is a
  plain function. `harness/vectors.ts` is the suite's only importer of the
  test-only entry. Test pages live in `e2e/tests/pages/` (the leaking page for
  the scan's negative tests). The Wrapper's browser rows drive the release
  bundle through `harness/wrapper-page.ts` (`launch`, `launchAndStart`,
  `scriptStartingRound`, the English texts); a launch must be a new navigation
  (a fragment-only change does not reload the page). With the shared `test`,
  the vectors are not issued for the session's key, so a round never passes
  W-26: use `coinflip-starting-created` (no `CreateRoundAuth`, W-26 waits) to
  keep a round `starting`, and a vector with one to show the failed
  verification. A round that passes W-26 needs `harness/round-play.ts`'s `test`:
  it overrides `randomDraws` so the Wrapper's key draw is the
  `signed-action/coinflip-cancel` vector's test key (read at run time from
  `vectors.ts`, never written into a file, not even a comment), serves the
  round configuration, and installs the fake RPC endpoints (`fakeRpc`, whose
  `behave` fails the tip check on purpose). Script it with `scriptRound` /
  `toReady` / `callTails` (the move is tails, the vector's), or `scriptCancel`
  for the cancel (the start answers the round `active`, so the cancel's reads
  are the next reads, in order). The fake checks bodies through an answer's
  `expect` (`startCheck`, `pickCheck`, `cancelCheck`). Mind W-29: the vectors'
  versions are fixed, so never answer a later read with an equal version
  (`coinflip-canceled` after `coinflip-resolving-cancel`, both v3, is
  ignored). One round per session (the transcript refuses a second open of the
  round id). The round `test` installs `page.clock` before every page loads
  (`pageClock`), unpaused: the Wrapper's timers still run in real time, and
  `advanceUntil` or `page.clock.runFor` moves them forward so a poll or a retry
  comes at once. Do not pause it: `pauseAt` before load stops the Wrapper's
  boot, and after load it races boot's timers against the network. Write no
  assertion that needs a timer not to fire (T-19 counts reads up to
  `check-later`, which no extra real-time poll changes). `advanceUntil` gives up
  after 15 s of real time, about 10 s of the page's clock, so before waiting on
  a 30 s background read (`check-later`, a move not confirmed) run
  `page.clock.runFor(30_500)` first (t15-unconfirmed). axe resolves each rule
  with a page `setTimeout(…, 0)`, so an audit under `page.clock` needs that
  clock moving: paused, it never finishes. `auditAccessibility` is bounded at
  `AUDIT_LIMIT_MS` (20 s, the runner's real timer) and fails past it; one
  unexplained hang after a `runFor` was seen once in 58 Chrome runs of
  t15-unconfirmed. On CI (`CI` set) `playwright.config.ts` also sets
  `globalTimeout` to 10 minutes (a normal `test:e2e` step takes at most about
  92 s, build included; the job's own timeout is 30 minutes); a local run has
  none. Tracing stays off (the key's bytes are an init-script argument; the
  round fixture fails a traced test). In T-15 offline, read the attempts from `network.sent(id)` (the context's
  `request` event), not from `fakePlayApi.served`: Chromium and WebKit route
  an offline request (recorded, then aborted), Playwright's Firefox fails it
  with `NS_ERROR_OFFLINE` before any route (`OFFLINE_ROUTED`, proven in
  `network.spec.ts`). The first call after `goOnline` is a `getSnapshot`;
  W-16's one resend after it is `t15-resend-lost.spec.ts`: script every move
  the fake may take after the read (`answer` for the resend, checked to be
  the first attempt's body field for field, then `answerEvery` with a check
  that refuses anything more, so a third send fails the fake's teardown), and
  count a send's attempts from `network.sent`: a lost send is the transport's
  attempts (as many offline as online), so a lost resend doubles the count.
  `network.sent` sees a request before the fake's route records it (the
  route's record waits on a round trip), and Chromium fails an offline request
  before the fake records it: read `fakePlayApi.served` only after the answer
  it records shows on the page, and poll a count that includes offline
  requests (`expect.poll`), as `t15-resend-lost.spec.ts` does. `goOnline`
  sets the browser online, then restores the fake: the reconnect read can hit
  the still-cut fake, fail, and be repeated by the transport, so the record
  may show two `getSnapshot` before the resend (WebKit on CI, reproduced by
  delaying the restore 200 ms). Assert "reads only, at least one, then the
  one resend", never an exact list of reads.
  The resend's answer is what the Wrapper and the game show (test 1 asserts
  "You won" in both). A resend lost too leads to the not-confirmed state, whose
  later reads ("check again", the 30 s background read) send no move:
  `t15-unconfirmed.spec.ts`. The Wrapper calls no `resend`, so the player's own
  resend sharing the one resend is the shell's unit test
  (`round-resend-lost.test.ts`).
  After a move in the game, the focus is on the Wrapper's result heading: the
  reference game moves focus only while its own document has focus (#73);
  `t14-every-state.spec.ts` waits for the game's own result heading before
  asserting it stays. Playwright's Firefox does not move the focus out of a
  focused frame on a parent's `focus()` (its frames run in-process; a release
  Firefox 159 does move it, checked by hand; running the project with
  `fission.webContentIsolationStrategy: 1` fixes that but breaks clicks into
  the game frame), so the Wrapper blurs the focused game iframe element before
  focusing the result or error heading (W-46, `render.ts`, component tests in
  `game-frame-focus.test.ts`); `focus-from-frame.spec.ts` (`FOCUS_FROM_FRAME`)
  proves the quirk and that the blur fixes it in every project. T-14 asserts
  the full rule everywhere: the heading focused, the game's heading not
  focused, the game's document without focus.
  `fakePlayApi.redeemAgain()` allows one more redeem for the cloned tab of
  T-17. T-9a's e2e cases embed the bundle from the fake operator page
  (`tests/operator`, `harness/operator-page.ts`) on `OPERATOR_ORIGIN` (listed
  by `serveListing`) or `UNLISTED_ORIGIN`; it says `hello` every 250 ms until
  `welcome` and records what it received. `startEmbedding` does not wait for
  the frame: Firefox gives a frame refused by `frame-ancestors` no name. A
  Snapshot answer's `links` replaces the vector's `context.links`. Every
  project's browser has `ancestorOrigins` (Firefox's too), which a test
  asserts; the path without it is a component test (`operator-gate.test.ts`,
  on `fixtures/framed-boot.ts`, a fake parent and a configuration read the
  test releases; it also has a switchable online state and an opening the
  test can hold, for the one-read, one-redeem guard). Under
  `referrerpolicy="no-referrer"` Playwright 1.64's Firefox masks the entry,
  its WebKit and an installed Chrome 155 (`SE_E2E_BROWSER_CHANNEL=chrome`) do
  not (the test annotates it per run). Rows that cannot run yet stay `test.fixme` in
  `pending.spec.ts`, never a body that passes. The reference game's build is
  served at D, `https://game.e2e-games.test` (`GAME_ORIGIN`, origins.ts), for
  every test (`serve-origins.ts`): the fake's redeem answers it as `gameOrigin`
  and it is the configuration's only `gameOrigins` entry, so every Wrapper
  session mounts it; a test that serves another game at D registers its route
  after. `reference-game-smoke.spec.ts` runs it in a stand-in host page
  (`pages/game-host.html`), not the Wrapper. Locally,
  `SE_E2E_BROWSER_CHANNEL=chrome` runs on an installed Chrome when Playwright's
  download is unavailable. Every browser starts through
  `harness/browser-start.ts` (`startBrowser`): one start (launch and first
  context) at a time per user on the machine (`harness/start-lock.ts`, a
  uid-named lock file in the temp directory; a dead holder's lock is taken over
  at once, any after 60 s), each part with 10 s. A part that times out has
  deadlocked: the browser's process group is killed, one `[browser-start]`
  line goes to stderr, and one new browser starts under the same hold (a second
  timeout fails; other errors are never retried; a browser whose first context
  failed is closed after the lock is released). It retries the start only,
  never a test or an assertion, so it hides no failure of the code under test.
  The kill lists processes with `ps` and signals in one synchronous turn, only
  groups led by this process's own new children (`ppid`, `pgid === pid`, not in
  the "before" set), never a bare pid: keep it that way, a free or reused pid
  would be some other process (`browser-start-kill.spec.ts` proves it on real
  `sleep` processes, behind a guard so a broken filter signals nothing). The
  worker browser does it through `harness/worker-browser.ts`, the base `test` of
  `fixtures.ts` (`hermetic-workers.spec.ts` checks the real worker browser:
  `startedAlone`, and the block on its `ps` command line); a test that launches
  a browser of its own passes its launch to `startBrowser`. Why: on macOS, a
  Chrome whose start overlaps another's can deadlock for good (RunningBoard's
  App Nap assertion, seen with `sample`) and never answer CDP. A test that
  hangs at `browser.newContext`, or a launch that times out before any test, is
  this; `test.slow()` or a longer timeout cannot fix it. Stand-ins for these
  tests: `harness/stand-in-starts.ts`.
- **The verify page's e2e** uses `harness/verify-page.ts`'s `test` (the shared
  fixtures plus `fakeVerifyApi`, `verifyRpc`, `verifyPage`): script a round id
  with `fakeVerifyApi.answerEvery` / `answer` (queued, used once) from
  `harness/verify-rounds.ts` (`matchingRound`, `tamperedRound(check)`,
  `notEndedRound`, `unknownKernelRound`), open it with `verifyPage.open`, and
  fail check 6 with `verifyRpc.behave`. The browser rows (`verify-page.spec.ts`)
  run against `apps/wrapper/dist/verify/index.html` (the page, `#verify-root`)
  and fail, with a message, if the bundle lacks it (they never skip). The
  page's headings start with their icon's text, so match a name by what it
  contains. A matching `won` or `lost` round cannot be built from the vectors;
  `harness/recorded-rounds.ts` serves two the backend recorded
  (`harness/recorded-rounds/*.json`, 2026-10-20, anvil; fixtures, not `contracts`
  vectors, kept as recorded and ignored by the formatter): set
  `test.use({ verifyRounds: "recorded" })` to pin their signer, registry, and
  entropy source and give block N its recorded hash on `verifyRpc`; the rows are
  `verify-page-recorded.spec.ts` (checks 5 and 7 recomputed and matching, a
  tampered loser names check 7, a tampered round secret check 5).
  VT-6 to VT-8 are built: `verify-link.spec.ts` uses `round-play.ts`'s `test`
  (the Wrapper plays a win) and installs the verify page, fake verify API, and a
  configuration with `verifyBaseUrl` on the Wrapper's origin itself (a later
  route wins), then follows the verify link into a new page.
  `verify-page-accessibility.spec.ts` (axe per state) and
  `verify-page-keyboard.spec.ts` (keyboard, focus, live regions, 200 % zoom) are
  VT-7; the form error is announced by the polite region, a failure by
  `role="alert"`. `verify-page-policy.spec.ts` (VT-8) sets
  `test.use({ verifyPolicy: true })`: `verify-page.ts` then serves the page with
  the built `apps/wrapper/dist/headers.json` `/verify/*` entry, its placeholder
  filled with the API and RPC origins (`verifyPolicyHeaders`), and the test
  records `securitypolicyviolation` events from an init script. A route cannot
  `fetch()` a fake origin: serve changed bytes from `WRAPPER_DIST` instead.
- **Contracts check:** CI recomputes the hash of every file in the `contracts` package
  against its lock file, and regenerates the types to fail on a diff.
- **Build output:** `pnpm check:build-output` (after `pnpm build`) inspects every
  `dist/`: only `.js` (with its `.js.map`) and `.d.ts` (no declaration map, no `sourceMappingURL` comment), no test file or build state, and no
  vector reachable from the `contracts` runtime entry (import graph plus source
  maps), covered by `tools/build-output.test.ts`. The Vite apps (`wrapper`,
  `reference-game`) may hold other file types. `tools/build-output-type-only.ts`
  (tests beside it) proves shell's `./controller` subpath is type-only (a
  `types` condition only, a declaration of type re-exports, an empty module with
  no map) and that the reference game's bundle names no kit package.
- **Package files:** `pnpm check:package-files` (after the library builds) holds
  each library's `files` to its `dist/`: everything the runtime entry loads is
  selected, and in `contracts` nothing else (no test-only entry or chunk);
  covered by `tools/package-files.test.ts`, which also checks the manifests.
- **Size budget:** `pnpm check:size-budget` (after the Wrapper's build) holds
  `apps/wrapper/dist/` to `WRAPPER_BUDGET`; the measuring and judging are pure
  (`tools/size-budget.ts`, covered by `tools/size-budget.test.ts`, which also
  keeps the limits equal to the testing spec's list). The release dry run and
  the publish step call `checkReleaseSize` directly, so a problem is listed
  once; an output without `index.html` (an empty `dist/` too) is a problem.
  **Known gap:** nothing tests that the dry-run and publish CLIs still call
  `checkReleaseSize` (mutants S8a/S8b survive): they are CLI glue, and a test
  would mean a full dry run in `pnpm check`. On `main` the required `build`
  job runs `check:size-budget` on the same commit; the publish job's digest
  check does not enforce size by itself.
- **Workflows:** `tools/workflow-text.ts` is a small block-style reader (no
  YAML parser in the repository). `tools/release-workflow.test.ts` compares
  `release.yml`'s values whole (every `if:`, permissions, jobs, the push
  refspec, checkouts, pins) and checks ci.yml's `check:size-budget` step;
  `tools/release-version-guard.test.ts` extracts the version job's guard
  script and runs it with bash in temporary git repositories (no user or
  system git configuration). Both workflows are `test:tools` inputs.
- **Release dry run:** `pnpm release:dry-run` (and the `release-dry-run` CI
  job; not part of `pnpm check`, it takes about 15 seconds) packs the five
  libraries in a scratch copy and checks the tarballs
  (`tools/package-tarball.ts`, covered by `tools/package-tarball.test.ts` with
  synthetic tarballs written by `tools/tar.ts`), imports them as a consumer,
  and builds the Wrapper artifact twice (`tools/wrapper-artifact.ts`, covered
  by `tools/wrapper-artifact.test.ts`); `tools/tar.test.ts` covers the strict
  tar reader and the deterministic writer, `tools/release-steps.test.ts` the
  scratch environment's name filter and the `--out` rule,
  `tools/release-readiness.test.ts` every refusal of the publish gate and the
  registry comparison, and `tools/release-consumer.test.ts` which `exports`
  entries the consumer check imports, which it treats as type-only, and that
  each one's declaration file is among the tarball's paths;
  `tools/type-only-outcome.test.ts` judges each type-only entry's run-time
  import outcome as the consumer script prints it (only
  `ERR_PACKAGE_PATH_NOT_EXPORTED` passes; a missing or unreadable outcome is a
  problem). The CLI itself is exercised by running it, not by a unit test.
- **Static:** lint, format check, `tsc --noEmit`, and the import-direction
  rules.

- **Shell tests** (`packages/shell/src/*.test.ts`) inject everything: a
  recording seeded random source (its first draw is the key, so leak scans
  know the key's bytes), seeded UUIDs, and an in-memory lock manager shared
  between sessions to stand for tabs (`src/fixtures/`). Snapshots are the
  golden `valid/` vectors with `roundId` and `step` replaced and validated;
  the worked round of the signing vectors is replayed through a round's
  state. `no-secret.test.ts` replaces storage, cookie, URL, network, and
  messaging globals with recording getters for a whole session. The tip check
  runs against a scripted JSON-RPC transport and a manual clock
  (`fixtures/fake-rpc.ts`): each provider's chain id and answer, a silence, a
  rejection, or a late answer is scripted, and timeouts fire only when the test
  fires them.
  The `signature/` vectors replay their verdicts through the W-26 checks
  (`create-round-auth-vectors.test.ts`). They do not pin the entropy chain
  id, so the wrong-chain cases are unit tests. A case that needs a signed
  change issues the round with a registry key drawn at run time from a seeded
  source (`fixtures/round-auth.ts`; one seed per call, never a module-level
  counter), which the configuration then pins: never write a key down to sign
  a test round. The round flows run against a scripted Play API transport
  (`fixtures/fake-play.ts`: queued answers per operation, a lost response, a
  problem, or a deferred answer to hold a call in flight) and a round issued
  for the session's own key (`fixtures/round-flow.ts`). The typedData encoder
  there is the canonical one, wrapped to record what it got;
  `typed-data-vectors.test.ts` checks that the shell's move, cash-out, and
  cancel carry the vendored `typed-data/` vectors' base64, through the flow
  with no encoder passed (the production default) and through the request
  builder. `signing`'s `close-vectors.test.ts` replays the signing vectors'
  `closes` (nine rounds, read through `fixtures/close-vectors.ts`) with the
  kit's encoders: struct hashes, digests, signatures, signers, `CloseRoundAuth`,
  and the `closed` and `canceled` hashes; the `payoutTerms` hashes are only
  checked against each round's `payoutTermsHash` (no `PayoutTerms` encoder).
  The `PlayerCancel` vector (`signed-action/coinflip-cancel`) is
  replayed twice: `signing`'s `cancel-vector.test.ts` reproduces every hash and
  the exact signature with the `player` fixture key (its test key; never read
  the key from the vector), and the shell's `cancel-vector.test.ts` checks that
  the flow's cancel has its struct hash and digest. A scripted `cancelRound`
  answer of `resolving` needs a `getSnapshot` answer too: the flow reads once at
  once, and further reads go through `refresh` (`round-cancel-settle.test.ts`,
  `round-cancel-answers.test.ts`, `round-cancel-check-later.test.ts`, and
  `round-cancel-failures.test.ts`, over `fixtures/cancel-settle.ts`; they pin
  the gate before the tracking, the in-flight hold, the stale read, `canceled`
  as final, `idle` as `ended`, another round, `active` as `not-taken`, the
  reads after each kind of failed call, the joined counted read, the 30-read
  limit and `check-later`; their mutants were checked).
  `round-cancel-over.test.ts` pins the flow's `over()` per cancel state. The
  session's cancel tests (`play-session-cancel-hold.test.ts`,
  `play-session-cancel-settled.test.ts`, over `fixtures/session-cancel.ts`)
  open a session whose RPC endpoints disagree (`disagreeingRpc` in
  `fixtures/session-round.ts`), so only the tip check fails and the cancel is
  required. The cancel is in flight through the session in two ways: a round
  started `starting` (no cancel yet) and then read `active` puts it in flight
  inside a `read()`; and a start whose own answer requires the cancel puts it
  in flight inside `start()`, where the flow is already the session's round
  (`startRoundFlow`'s `onFlow`), so a deferred cancel answer and concurrent
  reads show the hold during the start. Snapshots meant to reach the game need a higher `version`
  than the round's (`later`), or the bridge drops them and a hold test passes
  vacuously. `issuedOther` (`fixtures/session-round.ts`) is a second round
  for the session's key, for a read of one round that another round's start
  overtakes. The Wrapper's are `cancel-states.test.ts` and
  `cancel-ended.test.ts` (views, polling, and the one read after `ended`, over
  `fixtures/cancel.ts` and the fake session, which counts `served()` reads and
  `checks()`) and the
  poller's cancel cases; a focus assertion checks the focused element's id,
  since `body`'s text contains every heading. Their mutants were checked; one
  shell mutant is equivalent: dropping `over()`'s hold clause, which is
  defensive (the guard checks the hold first, and the latest Snapshot is not
  over while held).
  `resolving-cancel-vector.test.ts` replays the golden
  `valid/coinflip-resolving-cancel`. The flow layers its guards, so
  `round-actions.test.ts` pins each one alone with stand-ins for the tracking
  and the transcript state; a mutation run (one mutant per guard) checks that
  each guard is tested on its own.
- **The session's tests** (`packages/shell/src/play-session-*.test.ts`,
  `token-keeper.test.ts`, `launch-code.test.ts`) open a session over the
  scripted Play API with `openSessionOver` (`fixtures/play-session.ts`) and a
  manual wall clock (`fixtures/wall-clock.ts`, timers fire in due order only on
  `advance`); the round is issued for the key `recordingRandom(1)` draws, with
  agreeing RPC endpoints (`fixtures/session-round.ts`), so W-26 passes. Token
  times come from fixture timestamps, never from numbers in the test. A
  responder that records `request.authorization?.()` when called sees the token
  each attempt presented (reading it later sees the current one). The play
  token's disposal is observed in `play-session-token.test.ts`, which wraps
  the real `redaction.ts` with `vi.mock` only to keep the sealed tokens and
  asks `revealSecret` whether each is still live; a cashable session round is
  `issuedSteps`/`stepsAt` (`fixtures/session-round.ts`). The Wrapper's W-37
  test records every frame `src` (a `MutationObserver`, and the frame's `src`
  inside the fake session's mount) so a refused D is never given one.
- **Play client operations** run against a fake Play API server built from the
  vendored document (`packages/play-client/src/fixtures/fake-play-server.ts`):
  its routes are `PLAY_ROUTES`, its scripted answers are typed by each
  operation's responses in `PlayApiOperations`, and it refuses a call without
  the token where the document requires one. `operation-cases.ts` tables every
  operation's error statuses, and a test holds them equal to the document's;
  its `attempts` is 1 for the operations of class `never` (the redeem and the
  cancel), so the shared failure tests assert they are not repeated.
  The e2e suite's fake Play API (`e2e/tests/harness/`) is separate (e2e may
  not import `play-client`) but follows the same design: tables held to the
  document's generated types, strict bodies, and the token rule.
- **Property tests** use a seeded generator, never `Math.random`: the
  `snapshot` package's `src/test/arbitrary.ts` (mulberry32, arbitrary JSON and
  one-change mutations of a document). A package's tests that need types from
  `vitest` typecheck through a `tsconfig.test.json` with `types: ["node"]`,
  so the library's own `tsconfig.json` keeps Node globals out of `src`.

## Rules of thumb

- Deterministic and hermetic; no secrets; tests never import another package's
  internals. The one exception to hermetic is the preview-stack e2e (Wrapper
  tests T-10 to T-12), which runs from the backend-owned job and is never part
  of `pnpm check`.
- Assert on typed error `code`s, not messages; on money as strings or `bigint`.
- The payout display (W-31) is tested over the `valid/` vectors that carry
  one (`apps/wrapper/src/payout.test.ts`, and the cancel closures in
  `cancel-closure.test.ts`); read the amount from the vector, never write it
  down. T-10 answers the move with `coinflip-won-payout` (identical to
  `coinflip-won` but for `payout`) and asserts "Payout" with its `formatted`.
  The field-access test's allow-list (`render-snapshots.test.ts`) includes
  `payout`.
- Never weaken a vector assertion to go green.
- A test never prints or snapshots a key or token.

## Commands and CI jobs

- `pnpm test` runs the `vitest run` of every workspace that has tests (today `apps/wrapper`, `apps/reference-game`, `packages/signing`, `packages/snapshot`, `packages/play-client`, and `packages/shell`; each must be listed in the root `test` dependencies; a package gets a `test` script with its first real test) plus the tooling tests in
  `tools/` (`test:tools`); `pnpm test:e2e` runs the Playwright suite (the
  harness's tests, the preview mode's hermetic tests, a smoke run on the
  Wrapper's bundle, one on the reference game's build, and the pending T-rows
  as skipped). `pnpm check` is everything below.
- `tools/import-direction.test.ts` is the proof that the dependency-direction
  and other lint rules fail on a violation: it runs the real oxlint binary and
  `.oxlintrc.json` over scratch files, with the cases in
  `tools/fixtures/` (`import-direction-cases.ts`, `lint-rule-cases.ts`,
  `style-rule-cases.ts`, merged by the test). Add a case there with every new
  package or rule; write the expectation from the spec, not from the config.
- `tools/css-lint.test.ts` does the same for `stylelint.config.mjs` with CSS
  snippets (the stylelint API with the real config). Add a case with a new CSS
  rule.
- `tools/dependency-allowlist.test.ts` covers the allow-list check and keeps
  `tools/allowed-dependencies.json` equal to the ADR-001 table.
  `tools/test-only-entry.test.ts` covers the `contracts` test-only entry check.
  `tools/index-files.test.ts` covers the index-file rule (only entries, only
  re-exports) and runs it over the repository.
- The jsdom smoke test is `apps/wrapper/src/environment.test.ts`; component
  tests set `environment: "jsdom"` through `apps/wrapper/vite.config.ts`.
- **Wrapper component tests** (`apps/wrapper/src/*.test.ts`) mount the UI with
  `src/fixtures/app.ts`: a manual clock (`fixtures/manual-timers.ts`, timers
  fire only on `advance`), a scripted Snapshot read port, a recording
  clipboard, and a switchable online state; `fixtures/flush.ts` settles
  promises without a timer. Snapshots and typed errors are the golden `valid/`
  vectors (`fixtures/vectors.ts`), typed by the contract's `Snapshot` and
  `PlayProblem` and assigned to the UI's input types, which proves those are a
  subset of the contract. The Wrapper's tests cannot import `snapshot` (lint),
  so the vectors stand for validated input (T-5 validates them). A deep
  recording proxy checks the UI reads no field outside its input type and never
  `normalized`. The session's wiring runs against a scripted stand-in of the
  shell's `PlaySession` (`fixtures/fake-session.ts`, mounted with
  `fixtures/wired.ts`): its reads, start and cash-out answers, `RoundState`,
  game origin, and mount answer are set by the test. `src/release.test.ts` covers the recommended
  headers and the filled CSP; `src/release-integrity.test.ts` (Node
  environment) drives the release integrity plugin's `generateBundle` over a
  fake bundle (`src/fixtures/release-bundle.ts`) and runs the on-disk output
  check (`verifyOutput`: manifest, hashes, the type allow-list, SRI-loaded
  scripts) on the files it would write; `src/read-tree.test.ts` runs
  `readTree` on a real temporary directory with symbolic links to a file and to
  a directory. Wrapper tests write their own files only under `tmpdir()` and
  remove them: `read-tree` (per test), `release-verify` (a fake verify build in
  each test that needs one, one with a symbolic link), `build-refusals` (planted
  env files), and the test-only entry guard's scratch project
  (`fixtures/guard-scratch.ts`, per file; its Vite build uses `write: false`).
  Loading the real `vite.config.ts` (`build-refusals`, the guard) also makes
  Vite write and delete a bundled config file under
  `apps/wrapper/node_modules/.vite-temp/`. axe is not a component-test
  dependency: the axe scan of every state is the e2e suite's (T-14).
- **Cache.** Tests are wireit scripts; a passing run is cached by its declared
  `files`. A test that reads a file outside the package's `files` (a vector, a
  schema, an ADR) must list it, or depend on the task that produces it. `e2e`
  has no `files`, so it always runs. `pnpm clean:cache` forgets every
  cached result.
- CI jobs (`.github/workflows/ci.yml`): `lint`, `format`, `typecheck`, `unit`,
  `allow-list`, `contracts`, `build`, `e2e-fake` (a matrix, so its checks are
  `e2e-fake (chromium)`, `e2e-fake (firefox)`, `e2e-fake (webkit)`), `audit` (fails only on high and critical advisories; the weekly `audit.yml` reports every severity), `dependency-review` (pull requests only),
  and the aggregate `ci-ok`. `contracts-drift` and `release` are not defined yet.
