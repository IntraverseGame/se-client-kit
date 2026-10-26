---
description: Package boundaries, key custody, how contracts and vectors flow, and decisions an agent must not "fix". Read before changing structure or adding packages.
last-verified: 2026-10-20 (verify API document pull request: the verify API document vendored into `contracts`, `apps/verify` reads its `RoundVerification`; verify page states pull request: `apps/verify`'s states, view, checks 1 to 4 and 6, configuration read, and the verify API read; operator launch contract pull request, #42: the shell's operator channel and `serialized-origin.ts`, the Wrapper's operator gate, dispatch, and links; verify kernel pull request: `apps/verify` with the kernel derivations of checks 5 and 7, `signing`'s raw `keccak256`; start resend pull request: `startMayBeStored`, W-22's one resend of a start whose round may exist; Play API document: a start, move, or cash-out may be stored after a lost response, `UNAVAILABLE`, or `INTERNAL`; Play API document: a cancel that loses to the round's closure, `bet.balance` read apart from the round; re-read after a drop pull request: `snapshot-reread.ts`, W-35's re-read schedule; Snapshot last-round read pull request: the next bet beside an ended round, no new-round step, `ended` a defensive fallback, the interim `version` limit; fairness kernel vectors pull request: `kernelVectors.v1` in `contracts`, three file groups recorded under their set ids; Snapshot payout contract sync: `payout`, `Amount1` not exported; backend docs: the verify edge rules, the capability carrier; RFC-001 decisions: the operator-embedding spec, ADR-006, ADR-007; shell cancel fold-in pull request: the session read side (`session-reads.ts`), `RoundState.cancel`, `checkAgain`, the Wrapper's cancel-aware polling and views; Wrapper session pull request: `takeLaunchCode`, `openPlaySession` and its use cases, the token keeper, `isRoundOver`, the game frame's mount; reference game pull request: the type-only `controller` subpath of `shell`, its lint and build-output checks, the Coin Flip game; shell round flows pull request: start, move, cash-out, the required cancel, W-19 resync, the re-issue state, the Snapshot reader; Wrapper configuration and rendering pull request: the Wrapper's modules; shell controller bridge pull request: the `se.controller/1` bridge, its allow-list; play-client cancel pull request: `cancelRound`, never repeated; shell entropy chain id pull request: a pinned chain per entropy source; play-client operations pull request: the operations, the token seal)
---

# Architecture (agent context)

The contract is the kit's [client kit spec](../../specs/client-kit.md) and
[Wrapper spec](../../specs/wrapper.md); this note is the orientation around
them. `contracts`, `signing`, `snapshot`, and `play-client` have code; `shell`
has five slices (redaction, logger, key custody, the signer lock, the
transcript state; the chain configuration and tip check; the W-26
`CreateRoundAuth` checks and the round's verdict; the `se.controller/1` game
bridge; the round flows, the pick use case, and the UI's Snapshot reader; the
session: the launch code, the redeem, the token keeper, and the UI's use cases);
the Wrapper app opens a session and renders from it (configuration, rendering,
accessibility, the release check, the session wiring) and `reference-game` is
the `steps` sample: Coin Flip, and any other `steps` round as rows of tiles
(Cash or Crash `[3,3,4]` is the second configuration it is tested on, RFC-002;
types only from `shell`'s `controller` subpath). Flag any
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
  `signing`, `play-client` and `contracts`' runtime entry ← `verify` (app; never `shell`, and
  nothing imports it; it reads the Snapshot schema's patterns from the runtime
  entry, reads the verify API through `play-client`, and may take `snapshot`; its tests read the
  vectors from the test-only entry);
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
  `location.ancestorOrigins`): the Wrapper's mount appends it (`gameUrlOf` in
  `session-wiring.ts`). The tip check and its pass-or-fail decision, the
  W-26 `CreateRoundAuth` checks, and the round's verdict
  (`round-verification.ts`, which alone settles `T_0`, typed
  `SettledInitial`, and says when a `PlayerCancel` must be signed), the round
  flows (`round-flow.ts`), and the pick use case (`pick-use-case.ts`) are
  internal: the UI reaches them only through the session (`openPlaySession`,
  `session-play.ts`), whose use cases (`read`, `start`, `cashOut`, `mountGame`
  with the session's pick use case) and read-only `RoundState` are public.
  The session runs one start or cash-out at a time (`busy`) and refuses a
  start beside an open held round (`round-exists`); the game allow-list and
  the own origin are `SessionParts`, fixed at open, so `GameMountOptions` is
  only the frame, its listener, and the incompatible notice. A launch code
  that will not be redeemed is forgotten with `discardLaunchCode`. The
  play token lives only in `token-keeper.ts` (sealed, refreshed there); a
  session-ending answer to any call ends the session through the transport
  wrapper in `play-session.ts`. Whether a round is over is decided only by
  `isRoundOver` (`snapshot-reading.ts`) from a Snapshot (`canceled` is final,
  per b27afc5), and, while the shell's own cancel has not settled, by the
  round flow's cancel state (`cancel-state.ts`); the Wrapper keeps no status
  list. The
  launch code is taken by `takeLaunchCode`, which the Wrapper's entry calls
  before any request. The environment configuration, never a
  Snapshot or a response, pins the backend signer, the registry domain, and
  each entropy source's chain id (every tip-check endpoint must report it with
  `eth_chainId`; one that reports another chain fails the check). The
  signing session (lock + key) and the per-round transcript state are not
  exported, so the UI cannot sign an arbitrary action text; they are reached
  through the round flows. Every use of the key checks the signer
  lock first (no lock, no Web Locks API, a lost lock: `lock-not-held`). Its
  injected seams are listed in `specs/client-kit/the-shell-package.md`
  ("Provisional items"): the domain, the
  tip check with the bind mode, and the Snapshot-reading rule, which is
  the shell's own. Do not hard-code them. After a 400 `INVALID_ARGUMENT` or a
  409 `STALE_ACTION` a round holds and reads the Snapshot; it signs again, from
  the next sequence, only when the Snapshot shows its own action applied
  (W-19). A round signs at most one cancel, and a cancel is never resent
  blindly: only after a lost response or a 503, and a read that shows the
  round still `active` with no move, are the same bytes sent again, once. Per `se.snapshot/1` as vendored from the backend's b27afc5, `canceled` is
  final and a cancel not yet answered shows `resolving`: a `resolving` answer (or a `resolving` read after any failed cancel call, a failed read after an unknown outcome or a 422, or an unknown outcome and an `active` read with no move when no resend is
  allowed) puts the cancel in `settling` (no
  `unconfirmed` state: nothing leaves a possibly stored cancel unread); the flow's `observe` holds back every Snapshot of the round from
  signing until it settles (`in-flight`, `settling`, `check-later`; the gate is
  before the tracking), and only the flow's own counted reads (`refresh`,
  `checkAgain`, one at a time) settle it: `canceled`, `won`, `lost` give `sent`,
  `active` (also as the answer, or after a 400/422) gives `not-taken`, `idle`
  gives `ended` (neutral "round ended"; since 726f0a2 not expected, as `idle`
  never follows `active`: a defensive fallback); after 30 reads it is `check-later`
  ("still resolving — contact support"). Since b47b286 a cancel that arrives
  after the round had closed settles by that closure (`won`/`lost` with its
  `payout`, or `canceled` with `closeReason: "expired"`, the cancel never
  honored; the shell reads it as `sent`). The Wrapper shows such a `canceled`
  `expired` as "This round failed verification." (not "and was canceled"),
  and such a `won`/`lost` with "…; it closed before the cancel arrived." A 500
  `INTERNAL` to the cancel is "may be stored" like a 503 (`mayBeStored` in
  `round-request.ts`; the Play API document since 65504f5: after a lost
  response, `UNAVAILABLE`, or `INTERNAL` the cancel may already have been
  taken), so a failed read after it keeps settling. After either, the shell
  reads only and never resends the cancel (an `active` read is `not-taken`),
  more conservative than the document, which allows a resend after the read
  (human review, 2026-10-19). A 400, or a 500 with another code, is a
  refusal. A round the engine cannot settle on its own stays
  `resolving` until resolved manually (65504f5): `check-later`. Cancel refusals go to the evidence.
  No new round while `in-flight`, `settling`, or `check-later`; `ended` does
  not block one. The Snapshot read keeps answering the session's ended round
  until the next start (726f0a2), so the Wrapper offers the next bet (bet
  selector and start, from that Snapshot's `bet`) beside a round's result, with
  no separate "new round" step; the ended round's id and verify link go once
  the round the player started from them shows (W-31, W-40). Until the
  backend's per-session counter lands, a later read can carry a lower
  `version` than the one last shown; the Wrapper drops it (W-29). Where a poll
  runs, the next read shows the state; where none runs (an action's answer to
  an `active` round, the start's answer from an ended round), the Wrapper
  re-reads (`snapshot-reread.ts`, W-35): 4 reads at the backoff, then one
  every 30 s, until one is not dropped for a lower `version`; reads only, no
  notice, never in `settling` or `check-later`, nor after `ended`. At `idle`
  and on a round's result, where nothing polls, the page becoming visible
  again (not `focus`) reads once after a 1 s debounce (`balance-refresh.ts`, wired in
  `boot.ts`; RFC-001 Q16): a quiet read (`readQuietly`) that drops a failure. The
  rules change only with a vendored contract change
  (W-25, W-35). The session folds them in (`session-reads.ts`): the round
  guard keys on the cancel state first (whatever the session read), a read
  from elsewhere is replaced by the round's latest Snapshot for the UI, and not
  sent to the game, while the cancel holds the round (the flow is the session's
  round before its first observe, `startRoundFlow`'s `onFlow`), `read()` is the counted read while
  `settling` and `checkAgain` from `check-later`, and an action whose cancel
  moved to a read-decided state answers with the round, not the cancel call's
  failure (`lastError` is never cleared: compare it by identity and compare the
  cancel state). `RoundState.cancel` carries the state to the UI. A
  re-issue stops every new signature while a W-16 resend still goes out. A
  move or cash-out whose send had an unknown outcome (no answer, or a 503 not
  marked `retryable: false`) is resent once, from the flow's `observe`, when a
  read shows the round `active` at the step before it (`round-flow.ts`,
  `resendLost`; human review, 2026-10-18): the recorded body, never re-signed,
  also after a re-issue (unlike the cancel). The once-only state is the
  delivery's (`resendOnce`), shared with the manual `resend`: never a third
  send. `isUnknownOutcome` is the one definition of a lost send for every
  action, the cancel included. The start is not a signed action and has its own
  one resend (`startMayBeStored` in `round-request.ts`, used by
  `round-start.ts`; W-22, human review, 2026-10-19): no answer, a 503
  `UNAVAILABLE` whatever its `retryable`, a bare 503, or a 500 `INTERNAL`
  resends the same key and body right away, once (never a third time, the
  transport's own repeats aside), after checking the lock again (`address`:
  `lock-not-held` or `session-ended`, nothing sent); a voided start's 503
  (`FUNDING_UNCONFIRMED`, ...) and every other failure are thrown with one
  send. The Play API document says so since 075b850 (after a lost response,
  `UNAVAILABLE`, or `INTERNAL` the round may already have been started; the
  same key and body answer it); a bare 503 is the kit's own reading. It says the
  same of a move or cash-out, but the kit keeps them more conservative (human
  review, 2026-10-19): no resend after a 500 `INTERNAL` or a 503 marked
  `retryable: false`, the reads decide. Keep `isUnknownOutcome` and
  `mayBeStored` as they are for the move, cash-out, and cancel. The backend
  recognises a repeat by its signed action (sequence and bytes) in the round's
  action log, not by the key (still sent, not stored yet). Only the newest read by `version` triggers the resend.
  A read that caused the resend answers with the resend's answer
  (`session-reads.ts` `see`: a newer Snapshot of the round than the read is
  shown, and sent to the game). A resend lost too is the flow's
  `unconfirmed()`, `RoundState.unconfirmed` (`move` or `cash-out`; human
  review, 2026-10-19): the Wrapper's not-confirmed view
  (`unconfirmed-view.ts`), read on "check again" and every 30 s in the
  background, reads only, until a read settles the round.
  A cancel 503 `retryable: false` earns no resend but keeps the reads going
  (it may be stored). Any other failed verdict puts the transcript state
  in `failed`. A pick needs both a `ready` verdict and an `open` or `adopted`
  state: keep both guards.
  `createSnapshotReader` is built only by the shell or the Wrapper's
  composition root; only the reader object reaches the UI.
  The `typedData` the flows send is `signing`'s `encodeTypedData` in base64
  (`typed-data.ts`); no options type carries an encoder: a test passes one
  only as the separate `FlowTestHooks` argument of the internal constructors,
  and the session passes none. Do not move it back into an options type.
  Provisional session input: `bindMode` (the Wrapper wires `tip`). D is the
  redeem answer's `gameOrigin`, fixed at open; no session option gives it, so
  do not add one back (W-37). W-37's registrable-domain rule is the
  last-two-labels comparison of ADR-007 (accepted; built: `serialized-origin.ts`,
  the bridge's `same-site` refusal): do not add a public suffix list. The bridge
  takes the configuration's `environment` from the session (the loopback
  exemption is `local` only); the UI's mount cannot pass it.
  The operator channel (`operator-channel.ts`, `operator-protocol.ts`) is the
  shell's, beside the bridge: it records an early `hello`, `check` accepts or
  refuses it (or times out after 10 s on the injected clock), posts only
  `welcome` and `resize` to the fixed origin, and holds no secret. Do not add
  operator messages beyond `hello`, `welcome`, and `resize` (a change is
  `se.operator/2`), and never take a URL or a capability from one.
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
  row derived from the path (`r = len(path) - 1`). `hashPlayerCancel` encodes
  `PlayerCancel`, pinned by the independent signer's `signed-action/` vector
  (#41) and by the signing vectors of contracts release 1.0.0 (`types` and the
  `player-cancel` round of `closes`); the shell uses it directly (no injected cancel encoding). Draw-registry types are
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
- The Snapshot's `payout` (synced from the backend's f8cc92b) is an optional
  server-computed `Amount` on `won` and `lost` only. The generator emits it as
  `Amount1`, a structural copy of `Amount` that, like `Snapshot1`, is not
  exported (`tools/contracts-public-types.test.ts`). `snapshot`'s per-status
  types (`narrowing.ts`) carry `payout?: never` on idle, starting, active,
  resolving, and canceled. The Wrapper shows it (W-31, `shownPayout` in
  `round-view.ts`): "Payout" with its `formatted` on `won`, and on `lost` only
  when `value` > 0 as a `bigint`; absent shows nothing; never computed (W-34).
- The fairness kernel's public vector sets (the SuperEngine fairness kernel,
  kernelVersion 1: `kernel/public/v1/seed`, `shuffle-draw`, `steps-derive`,
  `derive`) are
  vendored as data only, under `vectors/kernel/v1/`, each locked under its set
  id. The only kernel logic is the verify page's (`apps/verify`): Seed,
  SeedHash, `roundSecretHash`, ShuffleDraw (`shuffleDraw`, any label), and
  StepsDerive over it, keyed on the kernel version (`kernels.ts`, version 1
  only), with SHA-256 from Web Crypto and the raw `keccak256` `signing`
  exports; its tests replay all four sets. The
  bundle's path in its source repository never appears here: it lives only in
  the sync's sources file, outside the repository.

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
  renders it (`render.ts` with `round-view.ts`, `state-views.ts`,
  `cancel-views.ts`, `dom.ts`), and polls (`snapshot-poller.ts`). Whether a
  round is over and how it is polled take the shell's cancel state
  (`round-input.ts`: `roundEnded`, `pollModeOf`): `settling` polls fast at any
  status and through the round's failed state, a typed error, or a rejected
  read (only a final state stops it, `wrapper-app.ts` `followed`);
  `check-later` reads every 30 s (`checkLaterDelayMs`) plus "check again",
  and so does an `active` round whose move or cash-out is not confirmed
  (`pollModeOf`'s `unconfirmed`, W-16), which a typed error stops like any
  poll outside the cancel's states; "check again" first clears a shown typed
  error, as "try again" does (`wrapper-app.ts`);
  `ended`, `not-taken`, and `sent` stop it. `main.ts` takes the launch code first;
  `boot.ts` opens the session once configured, and `session-wiring.ts` shows
  the opening, connects the session's read and intents, maps the shell's
  `RoundState` to the UI's `RoundCheck`, and mounts the game frame (sandboxed,
  `src` set only after the bridge accepted D, with `?parentOrigin=`), into a
  game host `render.ts` builds once and never re-renders. `json-rpc.ts` is the
  tip check's transport. The operator contract
  (`specs/wrapper/operator-embedding.md`, W-49a to W-49f; ADR-006, accepted)
  is built: `message-dispatch.ts` is the page's one `message` listener,
  installed at boot before the configuration is read and routing by `source`
  (the parent to the shell's operator channel, the game frame to the bridge);
  `embedding.ts` is W-49a's framing decision (direct embedding only; with
  `location.ancestorOrigins`, exactly one listed entry); `operator-gate.ts`
  awaits the handshake before `boot.ts` opens the session, so nothing is
  redeemed, signed, mounted, or offered before `welcome`, and starts
  `height-observer.ts` for `resize` after it; `operator-links.ts` builds the
  lobby and deposit anchors from `context.links` in W-49f's states only, once
  the gate opened (`allowLinks`), never while a start or cash-out call is in
  flight (`callInFlight`, from `session-wiring.ts`), and the "chain check not
  independent" notice hides nothing. Never relax a refusal to "allow when
  unknown", never navigate from script, and keep the configuration's
  disjoint-origins rule (`overlapping-origins`) checked against the page's own
  origin. The UI reads only its input types (`round-input.ts`),
  handed over already validated by the session; it imports only `shell`
  (lint). The build adds SRI, a `<meta>` CSP, the
  headers file, and the integrity manifest, then verifies the output directory
  on disk against the manifest (`release-integrity.ts`, `release-headers.ts`).
  There is no `publicDir`, and no dynamic `import()` (its chunk would get no
  SRI, so the build refuses it).
- The Wrapper bundle is built identically for every environment; values come
  from one configuration document. Do not add per-environment builds or a test
  build: the e2e tests the unmodified release bundle and stubs
  `crypto.getRandomValues` from outside with Playwright's `addInitScript`.

## Known open items

- **The verify page** is the kit's (backend TPO, 2026-10-18), specified in
  `specs/verify-page.md` and built but for the e2e rows: `apps/verify` (private)
  holds checks 1 to 7, the configuration read, the states and their view (V-3
  to V-14; "What is built" in the spec), its HTML (`index.html`, mount point
  `#verify-root`, entry `src/main.ts`), and a Vite `build` (base `/verify/`,
  the test-only-entry guard on, production only). The Wrapper's build copies
  `apps/verify/dist/` into its release under `verify/` with its own `<meta>`
  policy, SRI, and manifest entries, `headers.json` is keyed by path (`/*`,
  `/verify/*`), and the size budget measures `verify/` apart. The
  test-only-entry guard (`tools/test-only-entry-guard.ts`, with
  `tools/guard-text.ts`) is shared by both builds from `tools/`, so neither app
  imports the other. The verify API document (`GET /verify/v1/rounds/{roundId}`,
  `contracts`' `schemas/verify.v1.openapi.yaml`, generated types
  `VerifyApi*`, synced from se-backend `main` at `17d2099`; the lock records `af3aab4`, the last commit that touched the file) is vendored; the request is
  `play-client`'s `getRoundVerification` (a read with no credential, body
  `unknown`; A-1 closed), `verify-api.ts` maps its errors to the page's states,
  and `verify-body.ts` (with the readers it uses) is the only code that
  validates the body, mapping `RoundVerification` to the page's evidence (the
  spec's "The evidence"). A-1 to A-4 were decided by the human on 2026-10-20; A-5 (what a round
  without entropy or commitment does, the decoded `newRound`, the written
  payout text) is settled: a voided or refused round is its own V-8 state, with no "check again". The fairness kernel's public vectors are in `contracts`
  (`kernelVectors.v1`, 81 vectors in four sets, from se-backend `9294d22`),
  with none yet for Coin Flip's payouts or `roundSecretHash`, which the page
  checks against its definition.
  Its checks 5 and 7 follow the SuperEngine fairness kernel, kernelVersion 1
  (public; SHA-256 commitments and seed via Web Crypto, StepsDerive with the raw
  `keccak256` that `signing` exports). ShuffleDraw's input checks, hashed
  words, limit `2^256 - (2^256 mod m)`, and counter rule are stated by the
  vendored `kernel/public/v1/shuffle-draw` set's description; it has no
  rejection vector (every vector accepts at counter 0), so the kit's unit
  tests of the limit (`drawLimit`, `acceptDraw`) exercise a rejection. Decided 2026-10-18: a new private app `apps/verify`
  that never imports `shell` and holds no credential; a quorum read of block
  N's hash through its own read-only JSON-RPC module (W-26a and W-26b's rules);
  its own size budget; a required `verifyApiBaseUrl` configuration field (the
  Wrapper's validator accepts and requires it, and does not use it at run time; the
  validated document keeps it for `verifyContentSecurityPolicyFor`; it ships
  before, or with, any document that carries it). The field stays required
  (D-4): the preview configuration is to set it to the Wrapper's
  origin plus `/verify/v1`, a
  same-origin read when the Wrapper is served from the backend's origin, as in
  preview (the edge keeps `/verify/v1/` on the backend and rewrites
  `/verify/rounds/*` to the page, b6e1e48); otherwise the verify API is on
  another origin and needs the backend's CORS decision first. Served on the
  Wrapper's origin, the page is
  that origin's trusted code and MUST NOT use `navigator.locks`,
  `BroadcastChannel`, storage, or workers (`tools/shared-origin.test.ts`,
  VT-10, built). Decided 2026-10-19 (D-5 to D-9): a Coin Flip pick outside
  `[0, n)` fails check 7's status; `keccak256` is bytes in, bytes out; the
  verify app is ignored by changesets (its notes go in the Wrapper's). Its derivations are keyed on the kernel version the
  verify API's response carries as `kernel.version` (the Snapshot has none); an
  unknown version is "not recomputable".

<!-- TODO: hosting and deploy of the released Wrapper (credentials stay outside this repository); CODEOWNERS handles. -->
