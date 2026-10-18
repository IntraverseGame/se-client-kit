# The reference game and the controller types

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`apps/reference-game` is a minimal Coin Flip game: the target of the e2e suite
and a sample for game developers. It is not a production game, is never
published, and holds no key, no token, and no amount. It speaks the game's side
of `se.controller/1`
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
  hosts a game sets it.
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
  and all seven statuses. It parses every message against `se.controller/1`
  (`protocol.ts`, `game-snapshot.ts`): a plain object with exactly its fields,
  read through its own data properties only; a `snapshot` whose copy has exactly
  the W-38 allow-listed fields, each well formed; a `reject` with an `id` of 1
  to 64 characters from `[A-Za-z0-9_-]` and a `reason` from the closed list.
  Anything else is ignored. A Snapshot with a lower `version` than the latest is
  ignored (W-29).
- **Coin Flip only.** A round is Coin Flip when its config has exactly one step,
  index 0, with two options: option 0 is heads, option 1 is tails. Any other
  config shows "not a Coin Flip round" and takes no pick. What the player called
  is the step's `selectedIndex`; the coin landed on the side that is not the
  `losingIndex` (on a win with no `losingIndex`, on the called side).
- **Statuses.** Every status the bridge forwards is shown: `idle` (place a bet
  in the Wrapper), `starting`, `active` (the two calls), `resolving`, `won`,
  `lost`, and `canceled` (with `closeReason: expired` said, and the reveal when
  there is one). The calls are shown only while the round is `active`, on its
  current step, and not called yet.
- **A pick.** A click sends one `action` (`verb: pick`,
  `args: { step, option }`, `id` `pick-<n>` from a counter) and holds both calls
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
  English only; `context.language` is not used.
- **Observability.** The game logs nothing, stores nothing, and sends nothing
  but its `hello` and `action` messages to its parent.
- **Tests.** Unit and component tests (Vitest, jsdom) cover the origin and
  source checks, the schema refusal (accessor properties, accessor and sparse
  array items included), the rendering per status and per reject reason, focus,
  and the stylesheet's rules and contrast; a build test runs the real Vite build
  with the guard, checks its CSP, and proves the guard fails a runtime import of
  a kit or a third-party package in a build (a `vite/` subpath that is not a
  helper included), fails a kit package's file copied as an asset by
  `new URL(..., import.meta.url)`, a CSS `url()`, or an HTML `<img src>` (and
  one under 4 KiB, which the game does not inline, and one behind a symlink),
  fails a worker that imports a kit package's file or a third-party package, all
  with the game's own configuration, and lets the dev server resolve a
  third-party one. The e2e suite serves the build at
  `https://game.e2e-games.test` and runs a smoke test of the game page in a
  stand-in host page ([The e2e harness](./testing-and-ci.md#the-e2e-harness)); a
  whole round through the Wrapper is T-10 and T-11, pending a fake round in the
  e2e harness that passes the shell's verification (W-26), tracked in #11.
