---
description: Package boundaries, key custody, how contracts and vectors flow, and decisions an agent must not "fix". Read before changing structure or adding packages.
last-verified: 2026-10-17 (reference game pull request: the type-only `controller` subpath of `shell`, its lint and build-output checks, the Coin Flip game; shell round flows pull request: start, move, cash-out, the required cancel, W-19 resync, the re-issue state, the Snapshot reader; Wrapper configuration and rendering pull request: the Wrapper's modules; shell controller bridge pull request: the `se.controller/1` bridge, its allow-list; play-client cancel pull request: `cancelRound`, never repeated; shell entropy chain id pull request: a pinned chain per entropy source; play-client operations pull request: the operations, the token seal)
---

# Architecture (agent context)

The contract is the kit's [client kit spec](../../specs/client-kit.md) and
[Wrapper spec](../../specs/wrapper.md); this note is the orientation around
them. `contracts`, `signing`, `snapshot`, and `play-client` have code; `shell`
has five slices (redaction, logger, key custody, the signer lock, the
transcript state; the chain configuration and tip check; the W-26
`CreateRoundAuth` checks and the round's verdict; the `se.controller/1` game
bridge; the round flows, the pick use case, and the UI's Snapshot reader); the Wrapper app has its first slice (configuration, rendering,
accessibility, the release check) and `reference-game` is the Coin Flip
sample (types only from `shell`'s `controller` subpath). Flag any
divergence from the
structure below.

## Mental model

- **Packages** under `packages/`, **apps** under `apps/`. A package has one
  public entry point (its `package.json` `exports`); everything else is
  internal.
- **Dependency direction is one way:** `contracts` (data only) ← `snapshot` and
  `play-client` ← `shell` ← `wrapper` (app); `signing` ← `shell`; `signing`'s and
  `snapshot`'s tests read vectors from `contracts`' test-only entry (read only by
  tests; the consumers are listed in `specs/client-kit.md`);
  `reference-game` depends on nothing but the controller protocol's types
  (`import type` from `@intraverse/se-client-shell/controller`, a `types`-only
  `exports` entry; a Vite guard fails its build on a runtime import of any package, kit or
  third-party, and the lint bans bare specifiers in its non-test sources). No
  cycles; a package never imports an app; `snapshot` and `play-client` never
  import each other. Enforced by `no-restricted-imports` overrides in
  `.oxlintrc.json` (per package, with a separate entry for its test files) and
  proven by `tools/import-direction.test.ts` (cases in `tools/fixtures/`), which runs the real config over
  scratch files; a new package updates both. `pnpm check:contracts` is a second,
  independent check that only tests import the test-only entry.
- **`contracts` is data only.** No validator, client, encoder, or helper in it.
  Two entry points: runtime (schemas, generated types) and test-only (vectors).
  Only tests import the test-only entry; the build fails if a vector reaches any
  bundle; the published tarball excludes it. A function added to `contracts` is a
  defect. If the backend publishes a package, `contracts` is what it replaces.
- **The shell is the only code that touches a credential** (action key, play
  token). The UI gets use cases (`start`, `pick`, `cashOut`) and read-only
  state, never a secret. Do not "simplify" this by letting the UI sign or read
  a token. `play-client` sends the token but keeps none: each request takes its
  `Authorization` value from a function the shell passes. Its operations (one
  function per `operationId` of the vendored Play API document) take their
  routes and wire types from the document's generated types; a route that
  drifts from the document does not compile. The redeem and refresh hand the
  new token to a `seal` the shell passes and return only the sealed value.
  `cancelRound` has the retry class `never`, like the redeem: the document
  does not answer a repeated cancel from a log, so after a lost response or a
  `503` the caller reads the Snapshot first. Do not make it `idempotent`. A
  round signs at most one cancel: after a refused one (a 400 included) the
  shell reads the Snapshot and never signs at sequence 1 again (W-15, W-25).
- **Shell internals stay internal.** The shell's public entry is the redacting
  logger, `REDACTED`, `ShellError`, and the chain configuration's validation
  (`validateChainConfig`, for W-26a's boot rule) with the RPC transport types
  the Wrapper implements, and the game bridge (`createControllerBridge`) with
  the `se.controller/1` message types, and the UI's Snapshot reader
  (`createSnapshotReader`: validated Snapshots and typed Play API errors only,
  decided in human review 2026-10-17; never a key, a token, or a signing
  capability). The bridge holds no secret: the pick use
  case is injected, and the game's copy of a Snapshot is built from an
  allow-list (W-38), never by deleting fields; do not "simplify" it into
  forwarding the Snapshot. The bridge's pick pre-check is an early filter, not
  the gate: the pick use case must re-check W-23 against the shell's own latest
  Snapshot and refuse a step already signed (W-15). The protocol types are on
  the main entry and, as types only, at the `controller` subpath
  (`src/controller.ts`: type re-exports, no value; `exports` has `types` only,
  and `check:build-output` proves the emitted module is empty). That subpath is
  the working rule until a second consumer appears; then the types split into
  a `controller` package. Do not add a value to it. The reference game takes its
  parent's origin from its `parentOrigin` URL parameter (checked against
  `location.ancestorOrigins`): the Wrapper's mount must append it (open, #9). The tip check and its pass-or-fail decision, the
  W-26 `CreateRoundAuth` checks, and the round's verdict
  (`round-verification.ts`, which alone settles `T_0`, typed
  `SettledInitial`, and says when a `PlayerCancel` must be signed), the round
  flows (`round-flow.ts`), and the pick use case (`pick-use-case.ts`) are
  internal until the Wrapper wires them. The environment configuration, never a
  Snapshot or a response, pins the backend signer, the registry domain, and
  each entropy source's chain id (every tip-check endpoint must report it with
  `eth_chainId`; one that reports another chain fails the check). The
  signing session (lock + key) and the per-round transcript state are not
  exported, so the UI cannot sign an arbitrary action text; they are reached
  through the round flows. Every use of the key checks the signer
  lock first (no lock, no Web Locks API, a lost lock: `lock-not-held`). Its
  injected seams are listed in `specs/client-kit/the-shell-package.md`
  ("Provisional items"): the domain, the `PlayerCancel` hash (#41), the
  tip check with the bind mode, and the Snapshot-reading rule, which is
  the shell's own. Do not hard-code them. After a 400 `INVALID_ARGUMENT` or a
  409 `STALE_ACTION` a round holds and reads the Snapshot; it signs again, from
  the next sequence, only when the Snapshot shows its own action applied
  (W-19). A round signs at most one cancel, and a cancel is never resent
  blindly: only after a lost response or a 503, and a read that shows the
  round still `active` with no move, are the same bytes sent again, once. A
  re-issue stops every new signature while a W-16 resend still goes out; any
  other failed verdict puts the transcript state in `failed`. A pick needs both
  a `ready` verdict and an `open` or `adopted` state: keep both guards.
  `createSnapshotReader` is built only by the shell or the Wrapper's
  composition root; only the reader object reaches the UI.
  The `typedData` the flows send is `signing`'s `encodeTypedData` in base64
  (`typed-data.ts`); the encoder option exists only for tests, and the
  Wrapper passes none.
- **A Snapshot is untrusted until validated.** `play-client` returns it as
  `unknown`; only `snapshot`'s validator produces a typed value, so an
  unvalidated Snapshot cannot reach the renderer by construction.
  `snapshot`'s evaluator is hand-written over the schema's keyword profile and
  fails closed on a keyword outside it; do not swap in `ajv` (it needs
  `unsafe-eval`) or make an unknown keyword pass. It is strict as the schema is
  (closed objects); tolerance (W-29) applies only within what the schema
  allows (decided 2026-10-16), so a new Snapshot field needs a kit sync.
- **Signing mirrors the backend's decisions:** a hand-written, fixed-type
  EIP-712 encoder, 65-byte `r ‖ s ‖ v` signatures with `v` in `{27, 28}` and low
  `s`, deterministic (RFC 6979), the zero address rejected on recovery. It is
  checked against the same vectors as the backend's verifier. Do not swap in a
  general EIP-712 library. The key lives only in the closure of the signer
  `createSigner` returns (address, `sign`, `destroy`); the transcript helper
  (`createTranscript`) refuses a second, different message at one sequence;
  `encodeTypedData` builds the canonical `ActionTypedData` bytes (`typedData`)
  from plain fields, independent of the grammar module and of the transcript;
  the action grammar (`actionGrammar`) is the signed-action spec's, with the
  row derived from the path (`r = len(path) - 1`). `PlayerCancel`'s type is
  published but waits on an independent vector (#41). Draw-registry types are
  encoded internally for the vector
  replay only.

## Contracts and vectors

- The kit shares **documents, never code** with the backend. Each contract file
  lives in the `contracts` package and is pinned in its lock file with
  its source commit and a SHA-256. A contract sync touches that one package.
- CI recomputes the hashes offline and fails on a mismatch. It holds no
  credential for any private repository; drift is detected from the backend
  side, which reads this repository's public lock file.
- Vectors are **append-only**: a released version's vector files are never
  edited; new cases are new files or a new version. A vendored vector file
  records the commit it came from.
- Changes within `/play/v1` and `se.snapshot/1` are additive; clients are
  tolerant readers only within what the synced schema allows (its objects are
  closed, so a new Snapshot field or status needs a kit sync). A breaking
  change is a new surface or schema version and a new major of the affected
  packages. One pre-release exception (OQ-7): `se.snapshot/1` made
  `proofs.createRoundAuth` required on a config Snapshot with `proofs`, and
  changed or removed existing vectors; the kit vendored it with
  `--allow-vector-change`. After the first release, additive only.

## Things not to "fix"

- **Packages build with tsdown, not tsc.** `exports` point at `dist/` (`index.js`
  and `index.d.ts`; `contracts` also `testing.*`), so a package that imports
  another sees its built `dist/`: the wireit `build`, `typecheck`, and `test`
  scripts depend on the `build` of the kit packages they import. `contracts`
  builds two entries, so the test-only entry is a separate chunk and the runtime
  entry's import graph never reaches it (checked by `check:build-output`).
  `isolatedDeclarations` is on for libraries; do not turn it off to avoid
  writing a return type.

- **Lifecycle scripts are off** (no `true` entry in `allowBuilds` of `pnpm-workspace.yaml`; `esbuild`, brought by
  `tsx`, is denied explicitly) and
  a version must be seven days old (`minimumReleaseAge`). Do not add a build
  script to the allow-list, and do not lower the age to get a fix in.
- **wireit scripts declare their inputs.** Do not replace a script by an ad-hoc
  command, and do not widen `output` or drop `files` to make a task "always
  green"; a script without `files` is deliberately uncached.

- No UI framework in the Wrapper (a small UI, and a framework's dependency graph
  would sit in the code that holds the key). Changing it needs an ADR.
- The runtime-dependency allow-list is deliberately tiny (the two noble
  cryptography libraries, in `signing` only). A new runtime dependency needs an
  ADR.
- No git submodules; no importing backend code; no fetching private contracts
  in CI.
- The Wrapper (`apps/wrapper/src`): `boot.ts` reads and validates the
  environment configuration document (`environment-config.ts`, which reuses
  the shell's `validateChainConfig` for the chain part and both boot rules);
  `wrapper-app.ts` holds the UI state (`wrapper-state.ts`, pure transitions),
  renders it (`render.ts` with `round-view.ts`, `state-views.ts`, `dom.ts`),
  and polls (`snapshot-poller.ts`). The UI reads only its input types
  (`round-input.ts`), handed over already validated by a read port the session
  will supply; it imports only `shell` (lint), which does not yet export the
  Snapshot validator or its types. The build adds SRI, a `<meta>` CSP, the
  headers file, and the integrity manifest, then verifies the output directory
  on disk against the manifest (`release-integrity.ts`, `release-headers.ts`).
  There is no `publicDir`, and no dynamic `import()` (its chunk would get no
  SRI, so the build refuses it).
- The Wrapper bundle is built identically for every environment; values come
  from one configuration document. Do not add per-environment builds or a test
  build: the e2e tests the unmodified release bundle and stubs
  `crypto.getRandomValues` from outside with Playwright's `addInitScript`.

## Known open items

<!-- TODO: hosting and deploy of the released Wrapper (credentials stay outside this repository); CODEOWNERS handles. -->
