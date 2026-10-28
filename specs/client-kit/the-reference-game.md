# The reference game and the controller types

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`apps/reference-game` is a minimal `steps` game: the target of the e2e suite and
a sample for game developers. It plays Coin Flip (one step of two options, as
heads or tails) and any other `steps` round as rows of tiles; Cash or Crash
`[3,3,4]` is the second configuration it is tested on (RFC-002). It is not a
production game, is never published, and holds no key, no token, and no amount.
It speaks the game's side of `se.controller/1`
([W-38](../wrapper/the-game-iframe-and-the-controller-boundary.md)) and nothing
else.

## The controller types (decided with the reference game, issue #10)

- **Where they live.** `shell` exports the protocol's types at a **type-only
  subpath**, `@intraverse/se-client-shell/controller`: `HelloMessage`,
  `ActionMessage`, `SnapshotMessage`, `RejectMessage`, the unions `GameMessage`
  and `WrapperMessage`, `GameSnapshot`, `GameStep`, `Pick`, `Presentation`,
  `RoundStatus`, and `RejectReason`. The source is
  `packages/shell/src/controller.ts`: type re-exports of
  `controller-protocol.ts` only. No value is exported there
  (`CONTROLLER_SCHEMA`, `ROUND_STATUSES`, and the bridge stay on the main
  entry), and none of the types reaches a key, a token, a signature, or another
  shell internal.
- **The `playback` copy's types** (RFC-003, decided by the human, 2026-10-28).
  The subpath also exports `GamePlaybackSnapshot`, the `playback` copy of W-38,
  with its draw and event types, type-only like the others: no value, and
  nothing that reaches a key, a token, a signature, or another shell internal.
  `GameSnapshot` stays the `steps` copy.
- **Split later.** When a second consumer of the types appears (a game outside
  this repository, or a game SDK), they move to a `controller` package of their
  own, so a game developer does not depend on `shell` at all. Until then the
  subpath is the working rule (the [open item](../client-kit.md#open-items) is
  closed by this decision).
- **Type-only: what is checked, and what is review.** The checks prove the
  subpath carries no runtime code and that the game takes it as types only;
  which types it re-exports, and what they describe, is a matter for review (the
  checks read `controller.d.ts`, not the declaration chunks it imports).
  - `exports["./controller"]` has a `types` condition and nothing else, so a
    runtime import of the subpath does not resolve.
  - `pnpm check:build-output` (`tools/build-output-type-only.ts`) fails when
    `shell` does not declare the subpath type-only, when `controller.d.ts` holds
    anything but type re-exports and relative imports of declaration chunks, or
    when the JavaScript file the bundler writes beside it is not an empty module
    or has a source map.
  - The release dry run (`tools/release-consumer.ts`) treats an `exports` entry
    with a `types` condition and nothing else as type-only: in the packed
    `shell` it requires `dist/controller.d.ts` to be present and a runtime
    import of the subpath to fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, instead
    of importing it.
  - The import-direction lint lets `reference-game` (its sources and its tests)
    import that subpath only, with `import type` or `export type`: a value
    import, `export *`, a side-effect import, a dynamic import, the main entry,
    any other subpath, and shell's internals fail
    (`tools/import-direction.test.ts`). An inline `import { type X }` fails
    `no-import-type-side-effects`; an all-inline `export { type X } from`, which
    oxlint cannot catch without type information, fails
    `tools/type-re-exports.ts`, which runs over the whole repository in
    `pnpm test`.
- **Known residue.** The declaration chunk the bundler shares between the two
  entries keeps an unused `import` of the `snapshot` package's types (from
  `toGameSnapshot` in the same source file). It is a type-level reference only.
  Moving the protocol's types into a module with no import removes it; that is
  left to the change that splits the types out.
  <!-- TODO(controller types): move the protocol types into an import-free module, or split the `controller` package. -->

## The game

- **Build.** Plain TypeScript and Vite, like the Wrapper (`vite build` into
  `dist/`: `index.html`, one script, one stylesheet), and stylelint for its CSS
  (ADR-001, amended 2026-10-17). It depends on **no package at run time**, kit
  or third-party: `shell` and `vite` are development dependencies, `shell` for
  its types only.
  - A Vite plugin (`package-import-guard.ts`) fails the **build** on every bare
    specifier in the production module graph: a kit package, a third-party
    package, a Node built-in, or a development tool such as `vite` or `vitest`.
    Only Vite's own helper ids, exactly those its build emits
    (`vite/modulepreload-polyfill` with Vite 8, found from real builds; any
    other `vite/...` id, such as `vite/module-runner`, is a package import), and
    virtual ids (`\0...`) may resolve. The rule is scoped to the build, so the
    component tests may import `vitest`; a kit package (a bare `@intraverse/`
    specifier) and a file under `packages/` are refused in the dev server and
    the tests too. A file under `packages/` that the build would copy as an
    asset file (a `new URL(..., import.meta.url)`, a CSS `url()`, an HTML `src`
    or `href`) never reaches the guard's `load`, so the guard also fails the
    build when an emitted asset's original file, resolved through symlinks, lies
    under `packages/`. A worker's module graph is built with `worker.plugins`
    only (none by default), so `vite.config.ts` lists the guard there too, and a
    worker is held to the same rules. The guard finds `packages/` as a
    file-system path (`fileURLToPath`), so a checkout path with a space or a
    non-ASCII character matches. The build inlines no asset as a `data:` URL
    (`build.assetsInlineLimit: 0` in `vite.config.ts`): the page's policy
    refuses `data:` URLs anyway, and an inlined asset reaches no plugin hook, so
    with every asset emitted as a file the check sees each one, a small file
    included. A CSS `@import` of a file under `packages/` is not a guard path. A
    type import is erased before anything resolves, so it passes.
  - The lint says the same at the source: the game's non-test sources
    (`apps/reference-game/src/**`, except the test files and fixtures) may
    import only relative modules and the controller types; any other bare
    specifier fails.
  - `pnpm check:build-output` also fails when a file of
    `apps/reference-game/dist` names a kit package, or when its JavaScript still
    imports a package (a specifier that is not a relative or root-relative
    path). The guard is the proof: Vite inlines what it bundles, so a scan of
    the output cannot see inlined code.
- **Content Security Policy.** The page carries a `<meta>` policy:
  `default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
  The build has no inline script or style for it to refuse (the build test
  checks both). `frame-ancestors` cannot be set in a `<meta>`; the server that
  hosts a game sets it. On staging (`se-games-stage`), the Pages deploy serves
  the page at the origin's root, where the Wrapper frames it, with the same
  policy as a header plus `frame-ancestors` the Wrapper's origin and the
  operator origins (every ancestor)
  ([The game's site](../client-kit.md#the-games-site)).
- **The parent's origin** (the reference game's choice, not a protocol rule).
  The Wrapper's mount appends its own origin as `parentOrigin` to the game's URL
  ([W-37](../wrapper/the-game-iframe-and-the-controller-boundary.md), decided in
  human review, 2026-10-17). The game accepts a message only when `event.source`
  is `window.parent` and `event.origin` is the parent's origin, and posts only
  with `targetOrigin` set to it. It learns the origin from its own URL, the
  `parentOrigin` query parameter, and from `location.ancestorOrigins[0]` where
  the browser has it: the report is used when the parameter is absent, and the
  two MUST agree when both are present. A browser that masks the report (for
  example under the Wrapper's `no-referrer` policy) gives exactly `"null"`,
  which counts as no report (decided in human review, 2026-10-17). A report that
  is anything else and not a serialized origin, a parameter that is not one
  (`https://host[:port]`, or `http:` on a loopback host), a repeated parameter,
  or a disagreement leaves the game talking to nobody: it shows that it cannot
  start, sends nothing, and listens to nothing. A page that is not framed shows
  that the game runs inside the Wrapper, and sends nothing. A framer that names
  another origin gains nothing: what the game posts to that origin is dropped by
  the browser, and the framer's own messages carry its real origin.
- **Messages.** On load the game sends one `hello`: `presentations: ["steps"]`
  (`["steps", "playback"]` once the book-slot page ships, #146, below) and all
  seven statuses. It parses every message against `se.controller/1`
  (`protocol.ts`, `game-snapshot.ts`): a plain object with exactly its fields,
  read through its own data properties only; a `snapshot` whose copy has exactly
  the W-38 allow-listed fields, each well formed; a `reject` with an `id` of 1
  to 64 characters from `[A-Za-z0-9_-]` and a `reason` from the closed list.
  Anything else is ignored. A Snapshot with a lower `version` than the latest is
  ignored (W-29).
- **Coin Flip, and rows of tiles.** A round is Coin Flip when its config has
  exactly one step, index 0, with two options: option 0 is heads, option 1 is
  tails. What the player called is the step's `selectedIndex`; the coin landed
  on the side that is not the `losingIndex` (on a win with no `losingIndex`, on
  the called side). Coin Flip keeps its own page, the two calls. Any other
  `steps` config with at least one step is played as a **board** (`board.ts`): a
  labelled group per step (`Row <n>`, from the step's position, with its display
  multiplier) holding a button per option (`Tile <n>`, from 1; the tile that
  ended a revealed row says `(crash)` in its text). A picked tile is
  `aria-pressed`. A tile takes a pick only in the row the Snapshot's `step`
  names, while the round is `active` and that row has no `selectedIndex`; every
  other tile is held (`aria-disabled`). A config with no step shows "nothing to
  play" and takes no pick. The cash-out is the Wrapper's control (W-24), not the
  game's: the game sends no message for it, and the page says the Wrapper offers
  it. The same build plays both, so the preview run serves one build at one game
  origin for both games.
- **The book-slot page (issue #146, decided by the human, 2026-10-28).** The
  same build plays a book round (`playback`, W-50 to W-56), so the staging game
  origin serves `book-slot-v1` from the one page at its root, beside
  `coin-flip-v1` and `cash-or-crash-v1`, with no deploy change. The game's
  `hello` declares `presentations: ["steps", "playback"]` and all seven
  statuses, and it renders by the copy's `presentation`. On a `playback` copy it
  plays the base mode: the mode it shows is `config.model`, and it offers the
  player no choice and sends no `action` (a book round takes no pick). A book
  round shows four statuses (W-54): `idle` (place a bet in the Wrapper),
  `starting` (the round is being prepared), and `won` and `lost` (the draw); a
  `playback` copy in any other status is ignored like a malformed copy. The draw
  is shown at once, with no timed animation, so the Wrapper's result and the
  game's agree when they show: the drawn row (`Book <index>`), its display
  multiplier (`×<payoutMultiplier>`, never an amount), and the events as an
  ordered list, one item per event, `<index>. <type>`, and its `data`, when
  present, as compact JSON text set with `textContent` only (never parsed as
  markup). That text is cut to `EVENT_DATA_TEXT_LIMIT` code points, a named
  constant of 200, with `…` added when it is cut; the cut counts code points,
  never UTF-16 code units, so a surrogate pair is never split. The page knows
  nothing of the package's event types: a real slot renderer is the game
  developer's. The copy's parser takes the `playback` allow-list exactly (W-38).
  Two contract rules hold for every event (the backend, 2026-10-28): its `type`
  is always present, and its `data` is absent or an object. A copy with an event
  that breaks either, a `config.draw` outside `won` and `lost`, or an extra
  field is ignored like any malformed copy. A `won` or `lost` copy without
  `config.draw` is not malformed (the schema makes the draw optional): the page
  shows the status with no draw and no events, and is not ignored. A `data`
  object may hold numbers for display; the page shows them as text and never
  treats one as money. The page names no event type and no `data` shape of any
  package: generic text, shown at once with no animation.
- **Statuses.** Every status the bridge forwards is shown: `idle` (place a bet
  in the Wrapper), `starting`, `active` (the two calls), `resolving`, `won`,
  `lost`, and `canceled` (with `closeReason: expired` said, and the reveal when
  there is one). The calls are shown only while the round is `active`, on its
  current step, and not called yet.
- **A pick.** A click sends one `action` (`verb: pick`,
  `args: { step, option }`, where `step` is the row's `index`, `id` `pick-<n>`
  from a counter shared by both pages) and holds both calls (or every tile)
  (`aria-disabled`, styled as held: a grey fill, muted text, and a dashed
  border, within WCAG AA on both themes; the chosen call stays pressed) until it
  is answered. The next Snapshot with a higher `version` answers it (the Wrapper
  sends nothing on acceptance). A `reject` answers it only when its `id` is the
  pending pick's; the reason is shown in the alert, and the player may call
  again: `not_legal` (that call is not allowed now), `not_active` (the round is
  not taking a call), `busy` (the last call is still on its way), and `invalid`
  (the game sent a call the Wrapper could not read). A newer Snapshot clears it.
- **Accessibility**, by the Wrapper's rules where they apply (W-45 to W-48): one
  polite, atomic live region holding the heading and its detail, one
  `role="alert"` for a reject, text labels on every control, the calls labelled
  as a group, focus moved to the heading whenever the calls hide while one of
  them holds focus, and when the player's own pick is answered by a Snapshot
  that hides them (decided in human review, 2026-10-17), so focus never drops to
  the page while the game's document has focus; otherwise an update never moves
  focus. In both cases the game moves focus only while its own document has
  focus (`document.hasFocus()`), and otherwise never calls `focus()`: the
  Wrapper owns focus at a round's end, when it moves focus to its result heading
  (W-46), so the game yields and focus ends there whichever of the two updates
  comes first (decided in human review, 2026-10-18). When the game's document
  does not have focus (the Wrapper took it, or the browser window is in the
  background), a call that hides lets focus drop to the frame's body; at a
  round's end the Wrapper's W-46 move puts it on the result heading. Rem sizes,
  44 by 44 CSS pixel targets, visible focus, no motion under
  `prefers-reduced-motion`, and the Snapshot's `context.theme.appearance` and
  `context.device` as `data-theme` and `data-device` on the root. The text is
  English only; `context.language` is not used. On a board, focus moves to the
  heading when a **Snapshot** answers the player's own pick while a tile held
  focus (the row locks), and when no row takes a pick while a tile held focus,
  under the same rule (`document.hasFocus()`). A **`reject`** also answers the
  pick, but it leaves the row open for another pick, so a tile that holds focus
  keeps it, as Coin Flip's calls do. A reject for a pick that a Snapshot already
  answered is ignored (the game answers a pick once), so it moves nothing.
- **Observability.** The game logs nothing, stores nothing, and sends nothing
  but its `hello` and `action` messages to its parent.
- **Tests.** Unit and component tests (Vitest, jsdom) cover the origin and
  source checks, the schema refusal (accessor properties, accessor and sparse
  array items included), the rendering per status and per reject reason (Coin
  Flip, and Cash or Crash `[3,3,4]` on hand-written copies of the vendored
  `valid/cashorcrash-*` Snapshots: row 2 active, resolving, lost, won by
  cash-out, and won by the time limit), the board's rows, tiles, marks, and
  focus, and the stylesheet's rules and contrast; a build test runs the real
  Vite build with the guard, checks its CSP, and proves the guard fails a
  runtime import of a kit or a third-party package in a build (a `vite/` subpath
  that is not a helper included), fails a kit package's file copied as an asset
  by `new URL(..., import.meta.url)`, a CSS `url()`, or an HTML `<img src>` (and
  one under 4 KiB, which the game does not inline, and one behind a symlink),
  fails a worker that imports a kit package's file or a third-party package, all
  with the game's own configuration, and lets the dev server resolve a
  third-party one. The e2e suite serves the build at
  `https://game.e2e-games.test` and runs a smoke test of the game page in a
  stand-in host page ([The e2e harness](./testing-and-ci.md#the-e2e-harness)); a
  whole round through the Wrapper is T-10 and T-11 on the fake round (Coin
  Flip), and T-10 to T-12 in the preview run (T-12 on Cash or Crash). For #146:
  the book page's parsing and rendering per status on hand-written copies of the
  vendored `valid/book-playback-*` Snapshots (the playback copy of `won` with
  its two events, and of `idle`, `starting`, and `lost` built the same way), an
  event `data` shown as text and never as markup, an event without a `type` or
  with a `data` that is not an object refused, a `won` or `lost` copy without
  `config.draw` shown with its status and no draw, a `data` text cut at
  `EVENT_DATA_TEXT_LIMIT` code points (the test reads the constant) with a
  surrogate pair at the cut kept whole, no `action` sent on a book round, and
  the `hello` with both presentations; a whole book round through the Wrapper is
  T-24.
