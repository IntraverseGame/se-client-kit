---
description: How tests are organized and how to add one. Read before writing or changing tests.
last-verified: 2026-10-17 (Wrapper session pull request: the session's tests on a manual wall clock, the Wrapper's fake session, the browser rows on the release bundle, `redeemAgain`; reference game pull request: the game's unit, component, and build tests, the game-page e2e smoke, the type-only subpath check; release dry run pull request: the tarball check, the tar module, the Wrapper artifact; shell round flows pull request: the scripted Play API transport and the typedData vectors through the flow; e2e harness pull request: the fake Play API, the secret scan, axe, the network control; Wrapper configuration and rendering pull request: the component tests; play-client cancel pull request: the cancel cases; shell entropy chain id pull request: the tip check's chain id; play-client operations pull request: the fake Play API server)
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
  vendored but not replayed yet (#41); `tools/contracts-signed-action.test.ts`
  checks their pairing with `typed-data/` and `valid/` and that their embedded
  key is signing's `PLAYER_KEY`. Only tests may import that entry, and no
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
  third-party package fails a build; the dev server still resolves a
  third-party one, so tests may import `vitest`). `plain-data.test.ts` and the
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
  Preview-stack e2e runs elsewhere, against a pinned commit of this repository.
  The harness is `e2e/tests/harness/` (spec: testing-and-ci.md, "The e2e
  harness"); import `test` and `expect` from `harness/fixtures.ts`, never from
  `@playwright/test`. Every test is hermetic automatically (all origins are
  context routes under `.test`; any other request fails the test) and has the
  seeded `crypto.getRandomValues` (`randomDraws`). On request: `fakePlayApi`
  (script answers with `answer`/`answerEvery`: `valid/` vectors by name,
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
  launch). The opaque-frame excuse reads the origin an init script recorded
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
  (a fragment-only change does not reload the page). The vectors are not issued
  for the session's key, so a round never passes W-26 in e2e: use
  `coinflip-starting-created` (no `CreateRoundAuth`, W-26 waits) to keep a
  round `starting`, and a vector with one to show the failed verification.
  `fakePlayApi.redeemAgain()` allows one more redeem for the cloned tab of
  T-17. `t9a-embedding.spec.ts` frames the bundle from a test page on
  `PAGES_ORIGIN` (Chromium has `ancestorOrigins`); the Firefox path is a
  component test (`boot-session.test.ts`). Rows that cannot run yet stay `test.fixme` in
  `pending.spec.ts`, never a body that passes. The reference game's build is
  served at D, `https://game.e2e-games.test` (`GAME_ORIGIN`, origins.ts), for
  every test (`serve-origins.ts`): the fake's redeem answers it as `gameOrigin`
  and it is the configuration's only `gameOrigins` entry, so every Wrapper
  session mounts it; a test that serves another game at D registers its route
  after. `reference-game-smoke.spec.ts` runs it in a stand-in host page
  (`pages/game-host.html`), not the Wrapper. Locally,
  `SE_E2E_BROWSER_CHANNEL=chrome` runs on an installed Chrome when Playwright's
  download is unavailable.
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
  builder. The flow layers its guards, so
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
- Never weaken a vector assertion to go green.
- A test never prints or snapshots a key or token.

## Commands and CI jobs

- `pnpm test` runs the `vitest run` of every workspace that has tests (today `apps/wrapper`, `apps/reference-game`, `packages/signing`, `packages/snapshot`, `packages/play-client`, and `packages/shell`; each must be listed in the root `test` dependencies; a package gets a `test` script with its first real test) plus the tooling tests in
  `tools/` (`test:tools`); `pnpm test:e2e` runs the Playwright suite (the
  harness's tests, a smoke run on the Wrapper's bundle, one on the reference
  game's build, and the pending T-rows
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
  a directory (the one Wrapper test that writes to disk, under `tmpdir()`,
  removed after each test). axe is not a component-test
  dependency: the axe scan of every state is the e2e suite's (T-14).
- **Cache.** Tests are wireit scripts; a passing run is cached by its declared
  `files`. A test that reads a file outside the package's `files` (a vector, a
  schema, an ADR) must list it, or depend on the task that produces it. `e2e`
  has no `files`, so it always runs. `pnpm clean:cache` forgets every
  cached result.
- CI jobs (`.github/workflows/ci.yml`): `lint`, `format`, `typecheck`, `unit`,
  `allow-list`, `contracts`, `build`, `e2e-fake`, `audit` (fails only on high and critical advisories; the weekly `audit.yml` reports every severity), `dependency-review` (pull requests only),
  and the aggregate `ci-ok`. `contracts-drift` and `release` are not defined yet.
