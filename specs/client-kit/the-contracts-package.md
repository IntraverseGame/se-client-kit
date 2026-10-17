# The `contracts` package

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`contracts` holds the **data** the kit vendors from the backend and **nothing
else**. It has no logic: no validator, no client, no encoder, no helper. The
logic packages read it and never write to it.

- **Contents.** The Play API OpenAPI document (the Play and verify documents
  only), the Snapshot JSON Schema, the signing vectors, the Snapshot vectors
  (`valid/`, `invalid/`, `signature/`, and `typed-data/`, the canonical
  `typedData` bytes of signed actions), later the signed-action vectors, the
  types generated from the documents and the schema (`openapi-typescript` for
  the OpenAPI documents, with `exportType` so every object is a `type` alias,
  and `emptyObjectsUnknown` so an object schema without properties is a record
  of `unknown` values; a leftover `export interface` fails the generation;
  `openapi-typescript` is pinned at 6.7.6, which has no TypeScript dependency,
  reads the document from a `file:` URL, and is given a `fetch` that refuses, so
  a reference outside the document fails the generation; every `$ref` in the
  vendored documents is local, which a test checks
  ([ADR-004](../../decisions/ADR-004-openapi-typescript-6.md));
  `json-schema-to-typescript` for the Snapshot schema, which gives the
  structural types only: the conditional blindness rules stay with the validator
  in `snapshot`; its `export interface` declarations are rewritten as
  `export type` aliases after generation, since it has no option for that, and
  its "This interface was referenced by ..." notes are dropped from the doc
  comments; an interface that extends another, or a note in another shape, fails
  the generation), the **lock file** `contracts.lock.json` (source, source
  commit, and SHA-256 per artifact), and the input of the drift-check job (the
  lock file itself and the list of published sources). Generated files are
  committed and never edited by hand.
- **Two entry points** (`package.json` `exports`):
  - the **runtime entry** (`.`) exports the schemas and the generated types. It
    is the only entry any production code may import;
  - the **test-only entry** (`./testing`) exports the vectors. Only test files
    may import it.
- **Source layout (pinned).** Inside `packages/contracts/src/`, the **runtime
  sources** are `index.ts` (the runtime entry), `schemas/` (the vendored OpenAPI
  documents, `schemas/play.v1.openapi.yaml` for `/play/v1`, and the Snapshot
  schema), and `generated/` (the generated types). The **test-only sources** are
  `testing.ts` (the test-only entry) and `vectors/`: every vendored vector
  (`vectors/signing.json`, from the backend's `test/vectors/signing.json`;
  `vectors/snapshot/valid/`, `vectors/snapshot/invalid/`,
  `vectors/snapshot/signature/`, and `vectors/snapshot/typed-data/`; later the
  signed-action vectors), and any module that only the test-only entry uses.
  Nothing else belongs in `src/`. A module that both entries import is a runtime
  module by definition, so it lives under `schemas/` or `generated/` and holds
  no vector data. (`test/vectors/...` is the path in the backend's contracts
  repository, which is already public by name; `contracts.lock.json` records
  each artifact's public name and the path in this package, never a path inside
  a private repository.) Today the runtime modules are `schemas/snapshot.ts`
  (the schema as data of unknown shape), `generated/snapshot.ts` (its structural
  types), and `generated/play.ts` (the Play API document's types; the document
  itself is not imported by any module, only read by the generator); the
  test-only module is `vectors/catalog.ts`, generated, which imports every
  vector and exports `signingVectors` and `snapshotVectors` (`valid`, `invalid`,
  `signature`, and `typedData`, the last from `typed-data/`).
  <!-- TODO(verify API): the verify API document is not published yet; it joins `schemas/` with its `openapi-typescript` types under `generated/`. -->
- **Tarball.** What is published is the allow-list of check 3 below. The
  manifest still exports `./testing` for the kit's own tests; the published
  package has no such file. `contracts.lock.json` is not in the tarball: it
  stays in this repository, and each release's notes state the contracts it was
  built against.
- **Public types.** The runtime entry names its public types one by one; a new
  definition in a vendored schema becomes public API only when it is added
  there, and a test fails while a generated type is neither exported nor
  deliberately left out. `Snapshot1` is left out: it is the generator's
  structural copy of `Snapshot`, which the schema refers to from
  `PlayProblem.snapshot`. The Play API document's types are its three roots,
  renamed on export: `PlayApiPaths` (by path and method), `PlayApiOperations`
  (by `operationId`), and `PlayApiComponents` (its schemas and responses); its
  empty `webhooks`, `$defs`, and `external` are left out. The generator appends
  one more type, `operationRoutes` (exported as `PlayApiOperationRoutes`): each
  operation's literal path and method by `operationId`, read from the generated
  `paths`, since two operations of one shape (a move and a cash-out) are the
  same type structurally and `paths` alone cannot tell them apart; a `paths`
  member it cannot read fails the generation. The document embeds a copy of the
  Snapshot schema's definitions, so `PlayApiComponents["schemas"]["Snapshot"]`
  duplicates `Snapshot`; `play-client` never reads it (a Snapshot answer stays
  `unknown`).
- **Display numbers are not amounts.** The generated Snapshot types carry two
  JSON numbers from the contract: `Amount.normalized` and `Multiplier`, both
  display-only by the contract's own definition. They are never an input to
  arithmetic on an amount; amounts are `Amount.value`, a string of base units,
  read as `bigint` (the money rule in `AGENTS.md`). The validator and render
  helpers in `snapshot` follow this, and so does the Play API document's copy of
  the same definitions. The `CreateRoundAuth` integers (`entropyChainId`,
  `prepareWindow`, `domain.chainId`, and `newRound`'s `gameId`, `gameVersion`,
  `circuitVersion`) are JSON numbers bounded by the schema at or below 2^53 - 1
  and are not amounts; `newRound.betAmount` and `expiry` are strings (`Uint128`,
  `Uint256`), read as `bigint`.
- **Vectors never reach a browser bundle.** Three checks, all required:
  1. a lint rule (an import restriction) fails any import of the test-only entry
     from a file that is not a test file or a test helper;
  2. the build fails when a vector would reach an output. **The Wrapper** is
     covered by a Vite plugin (`apps/wrapper/test-only-entry-guard.ts`) that
     fails the build, and the dev server's module requests, the moment a module
     in the graph, direct or transitive, (a) is the package specifier
     `@intraverse/se-client-contracts/testing`, (b) resolves to or loads a path
     under `contracts/{dist,src}/{testing,vectors}` (case-insensitive: a
     relative import, a `?raw` or `?url` import, the imports `import.meta.glob`
     expands to), or (c) writes such a path in its text, which catches
     `new URL("<path>", import.meta.url)` assets, and `url()` and `src` paths in
     CSS and HTML, that Vite reads without resolving. Script modules are parsed
     with the bundler's own parser (Vite's `parseAst`, as TypeScript, before any
     transform) and every string literal and template element is tested by its
     decoded value, as it is and normalized (backslashes, `//`, `/./`, `x/..`),
     so JS escapes and comments, regular expressions, and stray quotes cannot
     hide a literal. Other modules (CSS, HTML, JSON, ...) are tested as written,
     with HTML character references decoded (decimal and hex with any number of
     leading zeros, with or without the semicolon, and the complete set of named
     references that expand to path characters: the 16 of the standard's 2,231
     whose expansion is only ASCII letters, digits, and `/ \ . % : ? # & _ - ~`,
     tab, or newline, compared with the standard's list by a test), with
     percent-sequences decoded, and with both, each also normalized (CSS escapes
     such as `\74 ` are not resolved by Vite and reach no file). The raw source
     text is tested too. A script module of the project that the parser cannot
     parse is refused (fail closed); third-party code under `node_modules` is
     not, because the resolve layer covers it and not the literal scan.
     `parseAst` can crash the process on extremely deeply nested input (about
     20,000 nested brackets); a crash fails the build, the safe direction. A
     comment or string that merely mentions such a path fails the build on
     purpose. The guard is also part of the worker pipeline (`worker.plugins`),
     so `new Worker(new URL(...))`, `?worker`, `?sharedworker`, and their
     `&inline` and `&url` forms are covered, a worker that starts another
     included. The Wrapper's config has no other plugin pipeline; a new one must
     add the guard too. The guard is off only under Vitest, which loads the
     config with `command: "serve"`, because component tests may use the
     vectors; it cannot be turned off for a build by mode or by environment
     (`vite build --mode test` and a build with `VITEST` set are refused). The
     Vite API with `configFile: false` bypasses `vite.config.ts` on purpose, and
     the guard's tests use it. Real Vite builds over fixtures prove each case
     (`apps/wrapper/src/test-only-entry-guard.test.ts` and
     `apps/wrapper/src/test-only-entry-guard-paths.test.ts`), and a performance
     test keeps the source check linear
     (`test-only-entry-guard-performance.test.ts`). **Not covered:** a path
     assembled at run time, and the dev server's dependency pre-bundling (it
     bundles `node_modules` code without these hooks; dev only, nothing ships).
     A project stylesheet (and the `<style>` block of an HTML page, which Vite
     hands over as a stylesheet) that mentions CSS `@import` is refused: Vite
     inlines an imported stylesheet by reading the file itself, bypassing every
     plugin, so its text cannot be scanned and following the import reliably is
     not possible (stylelint already bans `@import` in the repository's own
     CSS). The text is tested as written, with no comment stripping: a stripper
     that is not aware of strings reads
     `@charset "/*"; @import "./b.css"; a::after{content:"*/"}` as one comment
     and misses the import, and a string-aware tokenizer is more code the guard
     could get wrong, so a comment or a string that merely mentions `@import`
     fails the build too, like a path mention. A CSS Modules
     `composes: x from "./y.module.css"` loads a file by reading it as well and
     is refused the same way (`from global` names no file and is allowed). Other
     routes the guard does not see (a loader that reads a file by itself) are
     backed up by the output canary. The guard (the input side) does not look at
     `public/` either: Vite copies its files verbatim into `dist/` without a
     module, and the Wrapper has no `public/` today; a vector copied there is
     caught by the output canary below. **The output canary**
     (`pnpm check:build-output`, part of `pnpm check` and the `build` job) is
     independent of the input syntax: it fingerprints every file under
     `packages/contracts/src/vectors/**` (and the compiled test-only entry
     `packages/contracts/dist/testing.js` when present) and fails if any emitted
     file in any `dist/` (the Wrapper's and every package's, with the test-only
     chunks of `contracts` itself excluded) is a byte-for-byte copy of a vector
     (SHA-256, so a renamed or hashed file name does not matter, no minimum size
     for a vector file) or contains a vector's exact content, its minified JSON
     form (when it parses as JSON), the JSON-escaped form of either (a source
     map's `sourcesContent`), or its base64 form (a data URI). The text forms
     are also taken with the trailing newline trimmed and with LF and CRLF line
     breaks. The substring forms apply only to vectors of at least 64 bytes, so
     a tiny file such as `[]` cannot cause false positives; the compiled entry
     is compared only above that size. A missing `packages/contracts/src` fails
     the check, while a missing `vectors/` directory (the package is a skeleton
     today) is a documented no-op for the scan, covered by fixture tests with
     synthetic vectors. **Limits:** data transformed so that none of those forms
     remains (a JSON object printed as a JavaScript literal with unquoted keys,
     a re-encoded or compressed copy, a line-wrapped base64 copy, a hex or
     UTF-16 copy, a re-indented JSON copy, which is covered only through the
     minified form and only when the vector parses as JSON), and a vector below
     the minimum size inlined into another file, are not detected; the lint
     rule, the Wrapper guard, the runtime-graph check, and review cover those.
     The scan is linear in the size of the dists times the number of forms;
     there is no size cap. **The libraries** are covered by
     `pnpm check:build-output`: tsdown bundles, so a vector has no file of its
     own in `dist/`, and the check is an allow-list over the `contracts` runtime
     entry. It follows the import graph of `dist/index.js` (and of
     `dist/index.d.ts`) and reads the source map of every chunk it loads. The
     test-only chunk must not be reachable; no runtime chunk may import a
     `contracts` subpath by name; every reachable chunk must have a source map,
     unless its lines are only blank, line comments (block comments are not
     recognized, so a `/*` cannot hide code), and pure re-exports or imports
     (`export * from`, `export { ... } from`, `import ...`); a map must list at
     least one source and may not have a `sourceRoot` other than empty or `.`
     (it is not resolved, so the check fails closed); a source that climbs above
     the package root fails (it is not clamped); and every source must be a
     runtime source (`src/index.ts`, `src/schemas/`, `src/generated/`), so a
     vector, the test-only entry, or a data module shared with them anywhere
     else fails. The import graph follows relative specifiers in quotes and
     template literals without a substitution; a computed `import()` (a template
     with `${...}`, a concatenation) is not followed (a residual: the canary
     still scans every emitted file outside the test-only chunks). **Known
     limit:** a namespace re-export (`export * as ns from ...`) in the
     `contracts` runtime source makes rolldown emit a `rolldown-runtime-*.js`
     helper chunk that has code and no source map, so the check fails closed on
     honest output. Use named re-exports; extend the check deliberately (a spec
     change and a test, no ADR) when a namespace re-export is first needed.
     **Residual weakness:** the check trusts the source maps. If rolldown ever
     omits a module from `sources`, or a plugin inlines data under an allowed
     source name, nothing in this check detects it; the lint rule, the Wrapper
     guard, and review are the other layers. The check also requires every
     `package.json` `exports` target to exist in `dist/` (an empty or renamed
     entry fails), fails if another package's output mentions the test-only
     entry, and fails on any test file, build state, or file in a package
     `dist/` that is not a `.js` (with its `.js.map`) or a `.d.ts`. Declaration
     files carry no declaration map and no `sourceMappingURL` comment;
  3. the published `contracts` tarball excludes the test-only entry (the `files`
     field), so a consumer of the npm package cannot import vectors at all.
     Every library's `files` restricts its tarball to its `dist` output (npm
     always adds `package.json` and the README): `["dist"]` for `signing`,
     `snapshot`, `play-client`, and `shell`, and for `contracts` an allow-list
     that fails closed, `dist/index.js`, `dist/index.js.map`, `dist/index.d.ts`,
     and `dist/runtime/`. Its tsdown config writes a shared chunk to
     `dist/runtime/` only when every module in it is a runtime source
     (`src/index.ts`, `src/schemas/`, `src/generated/`) and any other chunk to
     `dist/chunks/`, which is never published. `pnpm check:package-files` (part
     of `pnpm check` and the `build` job, after the library builds) evaluates
     each `files` against the built `dist/`: every file the runtime entry loads
     (its JavaScript and declaration graphs and their source maps) must be
     selected, and in `contracts` nothing else may be (no `testing*` file, no
     chunk only the test-only entry loads). `tools/package-files.test.ts` holds
     the manifests to the same rules without a build (every library declares
     `files`, no entry selects `src/`, `.wireit/`, `*.tsbuildinfo`, or a config
     file, every entry lies under `dist`, `contracts` selects no `testing*`
     path). Its matcher approximates npm's `files` with the wireit matcher and
     refuses `!` entries. The tarball content check of the release dry run
     (`tools/package-tarball.ts`, on the `pnpm pack` output) reads what npm
     would serve: each published package contains its `package.json`,
     `README.md`, and `LICENSE` and otherwise only `dist/` files its `files`
     selects; every `exports` target is present except `./testing`, which must
     be absent, as must any `testing` or `vectors` path; the build-output checks
     and the output canary pass over every packed file; and the packed packages
     import in Node while `./testing` does not resolve.
- **Dependencies.** `contracts` depends on no other kit package and has no
  runtime dependency. `snapshot` and `play-client` depend on its runtime entry;
  the test-only entry has these consumers, **all of them tests and all of them
  development dependencies**: the unit tests of `signing`, `snapshot`, and
  `shell`; the Wrapper's component tests; and the e2e suite's fake Play API. It
  never reaches a published tarball or a browser bundle (the three checks
  above).
- **Replaceable by design.** If the backend later publishes its contracts as a
  package (OQ-6 decided: publish later, option B), `contracts` is the one
  package that is replaced by that dependency (or becomes a thin re-export of
  it). No logic package changes, because none holds a copy or an import path of
  its own.
- **The lock file lives here.** A contract sync touches one package.
