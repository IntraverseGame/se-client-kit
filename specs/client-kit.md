# Client kit (`se-client-kit`)

Status: **Draft, for human review.** The repository exists (public, default
branch `main`) and holds this knowledge layer and the toolchain; the packages
and apps are empty skeletons so far ([Bootstrap](#bootstrap)). The decisions
behind it are [ADR-001](../decisions/ADR-001-toolchain-and-signing.md). The
Wrapper's behavior is [wrapper.md](./wrapper.md).

## Purpose

- `se-client-kit` is one **public** GitHub monorepo (organization
  `IntraverseGame`) that holds **everything the player's browser runs**: the
  Wrapper, as headless shell logic and as UI, and the libraries the shell is
  made of. There is no other frontend repository.
- **Why public.** The player trusts this code with the key that can cash out
  their round. A player, an operator, an auditor, or a game developer must be
  able to read exactly what holds that key, build it, and compare it with what
  is served. Closed code asks for trust; the kit's design asks for a check.
- It is also how the contracts the SuperEngine backend publishes (the Play API,
  the Snapshot, the signing vectors) get a second, independent implementation,
  in a different language, tested against the same vectors.

## Scope

In scope: the repository layout and packages, how each package gets its
contracts, versioning and compatibility, the supply chain, what must never be
public, the tests and CI jobs, and who owns what.

Out of scope: the Wrapper's behavior ([wrapper.md](./wrapper.md)); the
signed-action grammar (the backend's signed-action spec); the hosting and the
deploy credentials of the released Wrapper, an [open item](#open-items) for the
infrastructure owner; the procedure to release
([runbook](../runbook/client-kit-release.md)).

## Boundary

The kit is a repository of packages and apps. These are its ownership lines.

- **The kit owns:**
  - all browser code: the shell, the UI, the libraries;
  - the `contracts` package (the data vendored from the backend and its lock
    file), and the typed client, the Snapshot validator, and the signing code,
    as implementations of contracts it does not define;
  - the browser e2e suite (its tests; where some of them run is below);
  - its releases: npm packages and the Wrapper bundle.
- **The SuperEngine backend owns** (the source of truth, in private
  repositories):
  - the Play API contract (an OpenAPI document per surface) and its versioning;
  - the Snapshot schema `se.snapshot/1` and its golden vectors;
  - the signed-action spec and its vectors;
  - every rule of what the backend accepts, and its error codes;
  - the preview stack the end-to-end tests run against, and the deploy of a
    released Wrapper to the SuperEngine origin.
- **The contracts repository owns** the registry contract and the signing
  vectors file (`test/vectors/signing.json`, generated with `viem`).
- **Neither side imports the other's code.** They share contracts (documents and
  vectors), copied into the kit with a recorded source commit and a content hash
  ([Contracts](#how-the-kit-gets-its-contracts)). No git submodule is used.

## Contract

### Repository layout

```text
se-client-kit/
  packages/
    contracts/      DATA ONLY: the vendored contracts, generated types, the lock file
    signing/        EIP-712 and secp256k1
    snapshot/       validator and render helpers for se.snapshot/1
    play-client/    typed /play/v1 client
    shell/          headless part of the Wrapper
  apps/
    wrapper/        the Wrapper UI (Vite)
    reference-game/ a minimal sandboxed game for tests and as a sample
  e2e/              Playwright suite and the fake Play API
  tools/            repository checks and their tests (allow-list, test-only entry)
  .changeset/       pending release notes
  package.json, pnpm-workspace.yaml, pnpm-lock.yaml, .node-version
  tsconfig.base.json, tsdown.base.ts, .oxlintrc.json, .oxfmtrc.json, stylelint.config.mjs
  .github/          workflows, the setup action, CODEOWNERS, dependabot
```

Every workspace is a pnpm package with wireit scripts (see
[Task orchestration](#task-orchestration-and-caching)); the root `package.json`
fans them out. Exactly: the five `packages/*` and `apps/reference-game` have
`build` and `typecheck`; `apps/wrapper` has `build`, `typecheck`, and `test`
(Vitest with jsdom; today only an environment smoke test); `e2e`
(`@intraverse/se-client-e2e`, private) has `typecheck` and `test` (Playwright,
with no suites yet) and no `build`. **A package gets a `test` script with its
first real test**, not before: a `test` script that passes with no tests would
be a green check that checks nothing, so the empty skeletons have none, and the
root `test` runs the Wrapper's tests and the `tools/` tests (`test:tools`). The
pull request that adds a package's first test adds its `test` script and its
entry in the root `test` dependencies.

Directories are `packages/<name>` and `apps/<name>`. The intended npm names are
`@intraverse/se-client-<name>` (scope `@intraverse`, decided in
[ADR-001](../decisions/ADR-001-toolchain-and-signing.md)); the two apps keep the
prefix and are never published. The npm organization and the names are not
claimed on npm yet: that is part of the publishing work (#12).

### Packages

Every package and app has a `README.md`, and it is **public documentation**: npm
renders it on the package page, and its reader has never seen this repository.
It is written for a consumer: what the package is and the problem it solves,
when to use it and when not to, the install line
(`pnpm add @intraverse/se-client-<name>`, with a plain statement that it is not
published yet while that is true), a minimal example once a public API exists
(until then, "pre-release: no public API yet"), the entry points, the guarantees
and limits that matter to a user, where amounts are touched (strings or
`bigint`), and links. It states only what is true and tested today. It must not
hold contributor or agent material (the build and CI tooling, lint rules, the
dependency-direction matrix, the review process, internal issue numbers); that
lives in CONTRIBUTING.md, the specification, and the `add-a-package` skill, and
a one-line pointer to CONTRIBUTING.md is enough. The only links allowed are
absolute links into this repository
(`https://github.com/IntraverseGame/se-client-kit/blob/main/...` or
`/tree/main/...`, so they work on npm) whose paths, and heading anchors for
Markdown files, exist, plus anchors within the README itself. Any other host,
public or private, any other branch or repository, and any relative, `http:`, or
`mailto:` link fails, so no stray or private URL ships in a published README
(plain-text URLs in prose or code are held to the same rule). Each library's
`package.json` carries `description`, `keywords`, `license`, `repository` (with
`directory`), `bugs`, and `homepage`, using only the public repository URL. The
README is updated in the same change as the API or role it describes.
`pnpm check:readmes` (an uncached script, because it depends on what git tracks
and ignores; part of `pnpm check` and `pnpm test`) runs `tools/readme-rules.ts`
over every README and enforces: the package name; for a library an install line
and, while it is private, a plain "not published to npm yet"; a "Specified, not
implemented yet" line when the status says there is no public API or an empty
entry (the sentence must be in prose: code blocks, inline code, and HTML
comments do not count); and links. Links are extracted in every form (inline and
image links, reference definitions, autolinks, HTML `href`, `src`, `srcset`,
`data`, `poster`, `action`, `formaction`, and other URL attributes in any
quoting, `url()` in `style` attributes and `<style>` blocks, a
`<meta http-equiv=refresh>` target, and bare URLs and `www.` hosts in prose),
matched case-insensitively for the scheme and host. Every inline Markdown
destination is a link, whatever it looks like (`README`, `docs`, `page#sec`, and
`%2e%2fa` are resolved relative to the page by a renderer and break on the npm
package page), including a `<...>` destination, a title, and spaces or newlines
inside the parentheses. Fenced code blocks (closed ones) and inline code spans
are removed first, so `fns[i](event)` written as code is not a link, while the
same text in prose is; a code span written where a destination goes counts as a
relative destination and fails. Indented code blocks are not recognized (a link
in one is still extracted). Only absolute links into this repository
(`blob/main` or `tree/main`) and anchors inside the README are allowed;
`javascript:`, `data:`, `mailto:`, `ftp:`, `file:`, `www.`, protocol-relative
`//host`, relative, and any other host fail. A repository link must point at a
path that exists and is tracked or at least not ignored: with a `.git`
directory, `git ls-files --cached --others --exclude-per-directory=.gitignore`
decides (so a file added in the same change, still untracked, is fine, and an
ignored or build-output file is not); without one (an unpacked copy), the
repository's `.gitignore` is applied by a small matcher that fails closed on a
line it cannot interpret (only the root `.gitignore` is read, and a path below a
nested `.gitignore` fails closed), a path through a symlinked directory is not
tracked (as with `git ls-files`), and paths under `dist/`, `node_modules/`,
`.wireit/`, or matching `*.tsbuildinfo` always fail. Words are matched after
folding: NFKC, zero-width and bidi controls and soft hyphens removed, a small
set of Cyrillic and Greek lookalikes mapped to Latin, whitespace runs (spaces,
tabs, newlines, no-break spaces) folded to one space, and case folded (so a
lowercase "todo" in prose fails), against `TODO`, `FIXME`, `XXX` and a list of
forbidden contributor terms. Other cross-script lookalikes are left to review.

| Package                                      | Published                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Depends on (kit)                                                                                           | Runtime dependencies                |
| -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@intraverse/se-client-contracts`            | npm (runtime entry only) | **Data only, no logic.** Everything vendored from the backend and nothing else: the Play API OpenAPI document, the Snapshot JSON Schema, the signing vectors, the Snapshot vectors (and later the signed-action vectors), the types generated from them, `contracts.lock.json` (source commit and content hash per artifact), and the input of the drift-check job. It has **two entry points**: a **runtime** entry (the schemas and the generated types) and a separate **test-only** entry (the vectors), so vectors can never reach a browser bundle ([rules below](#the-contracts-package)). | none                                                                                                       | none                                |
| `@intraverse/se-client-signing`              | npm                      | The hand-written, fixed-type EIP-712 encoder and secp256k1 signing and recovery: domain separator, type hashes, `hashStruct`, the `0x1901` digest, `PlayerAction`, `PlayerCashOut`, `PlayerCancel`, and the registry types the shell must recompute or verify (`NewRound`, `CreateRoundAuth`, `MarkReadyAuth`, `CloseRoundAuth`, `PayoutTerms`). Canonical 65-byte signatures. It takes vectors from `contracts` in **tests only** (a development dependency on the test-only entry).                                                                                                             | none at run time                                                                                           | `@noble/curves`, `@noble/hashes`    |
| `@intraverse/se-client-snapshot`             | npm                      | The hand-written validator over the Snapshot schema's keyword profile (the `Snapshot`, `PlayProblem`, and `AmountRequest` validators) and the render helpers (pure functions over a validated Snapshot). It takes the schema and the types from `contracts`, and its tests take the vectors from `contracts`' test entry.                                                                                                                                                                                                                                                                         | `contracts`                                                                                                | none                                |
| `@intraverse/se-client-play-client`          | npm                      | A typed `fetch` client for the Play API (and the verify API read the Wrapper needs), generated from the OpenAPI documents. It takes its types from `contracts`, returns the Snapshot body as `unknown`, and never interprets it.                                                                                                                                                                                                                                                                                                                                                                  | `contracts`                                                                                                | none (it uses the platform `fetch`) |
| `@intraverse/se-client-shell`                | npm                      | The headless part of the Wrapper: session and token lifecycle, key custody, the transcript, Web Locks, bind-receipt and tip checks, the controller boundary, the redacting types and logger. It has no DOM dependency beyond the platform APIs it is given.                                                                                                                                                                                                                                                                                                                                       | `signing`, `snapshot`, `play-client` (and `contracts` through them)                                        | none                                |
| `@intraverse/se-client-wrapper` (app)        | no: a release bundle     | The UI: rendering, accessibility, the iframe mount, the build. It uses the shell and renders only what the shell hands it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `shell` (and its types)                                                                                    | none                                |
| `@intraverse/se-client-reference-game` (app) | no                       | A minimal game for the tests and as a sample for game developers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nothing but the type definitions of the controller protocol `se.controller/1` (type-only, no runtime code) | none                                |

Dependency direction. There are no cycles, and a package never imports an app:

```text
contracts ──▶ snapshot ────┐
    │                      ├──▶ shell ──▶ wrapper (app)
    └─────▶ play-client ───┤
signing ───────────────────┘
contracts (test-only entry) ──▶ the tests of signing, snapshot, shell, wrapper,
                                and the e2e fake Play API (devDependencies)
```

- `contracts` is the only leaf that holds data; `signing` has no kit dependency
  at run time. `snapshot` and `play-client` depend on `contracts`'s runtime
  entry. `signing` takes vectors from `contracts`' test-only entry in its tests.
  No other package imports `contracts` directly except in tests (the consumers
  of the test-only entry are listed [below](#the-contracts-package)). No package
  imports another sideways (`snapshot` and `play-client` never import each
  other), and a package never imports an app.
- `play-client` returns the Snapshot as `unknown`, so only `snapshot`'s
  validator can turn it into a typed value: a Snapshot cannot reach the renderer
  unvalidated by construction.
- `shell` is the only package that holds a credential. `wrapper` cannot reach
  the key or the token: the shell exposes use cases (`start`, `pick`, `cashOut`)
  and read-only state, never a secret.
- A lint rule enforces the direction: a `no-restricted-imports` entry per
  package and per package's test files in `.oxlintrc.json`, checked in CI by
  `pnpm lint`. A fixture test (`tools/import-direction.test.ts`) runs the real
  configuration over scratch files and fails if a violating import is not
  reported (the cases are in `tools/fixtures/`: `import-direction-cases.ts`,
  `lint-rule-cases.ts`, and `style-rule-cases.ts`). The same entries reject
  another package's internals (`/src`, `/dist`, a relative path into a sibling
  package) and the `contracts` test-only entry outside tests.
- The same configuration enforces the other code rules that a linter can
  express: the `correctness`, `suspicious`, `pedantic`, and `perf` categories
  (all errors, and any warning fails the run); no `any`; no `@ts-ignore`,
  `@ts-nocheck`, or reasonless `@ts-expect-error`; no default export in a
  library; no side-effect import (`import "./x"`), so a module has no
  import-time side effect from its imports; a `.ts` extension on relative
  imports; type-only imports marked as such; no non-null assertion, `eval`,
  `new Function`, or `==`; no `console` in library code; no focused or skipped
  test; and an unused lint-disable directive is an error. A top-level call or
  assignment that runs at import time is not expressible as a lint rule and
  stays a review item, and so does the reason on a lint-disable comment or a
  `@ts-expect-error`: the human reviewer and the reviewer agent enforce it,
  there is no rule for it (an unused disable directive is an error). Type-aware
  rules are not enabled (they need `oxlint-tsgolint`, which is not in the
  ADR-001 allow-list; adding it is a follow-up pull request with an ADR
  amendment). `unicorn/require-module-specifiers` is off only because the empty
  package skeletons are `export {};`; the first pull request that gives a
  package real code re-enables it.
- **Code style**: `type` over `interface`
  (`typescript/consistent-type-definitions`: `interface` only when a class
  `implements` it, or for declaration merging, with a disable comment naming the
  rule and giving the reason on the same line; oxlint flags every interface and
  cannot require the reason, so review enforces it), and arrow functions over
  `function` (`func-style` in expression style with arrows allowed, so
  `export function` and `function` declarations are flagged, plus
  `prefer-arrow-callback`). Canonical form:
  `export const findProblems = (dists: readonly Dist[]): string[] => { ... };`
  with explicit parameter and return types, which `isolatedDeclarations`
  requires of an exported arrow. Exceptions: a generator is a function
  expression (`const g = function* (): Generator<T> { ... }`), a function that
  needs its own `this` or `arguments` is a function expression, overloads stay
  declarations; none of these is flagged. Known gaps (review catches them):
  `export default function` and `const f = function () {}`.
- **CSS** is linted by stylelint (`pnpm lint:css`, part of `pnpm lint`) with the
  hand-written `stylelint.config.mjs`: correctness rules (no unknown property,
  at-rule, function, unit, or value; no invalid hex color; no duplicate selector
  or property; no empty block) and the Wrapper's constraints: no `!important`;
  no `@import`; only `data:` and same-origin relative `url()` (the Wrapper runs
  under a strict CSP and is served from the SuperEngine origin); no vendor
  prefixes. It enables no stylistic rule, because oxfmt formats. The cases are
  in `tools/css-lint.test.ts`. Files under `dist`, `.wireit`, `node_modules`,
  and the `.gitignore` paths are not linted.
- **Tool scripts.** The TypeScript scripts under `tools/` run with `tsx`
  (`tsx tools/<script>.ts`, a root development dependency). `tsx` brings
  `esbuild`, whose install script only verifies a prebuilt binary; it is denied
  in `allowBuilds`, so no lifecycle script runs.

### The `contracts` package

`contracts` holds the **data** the kit vendors from the backend and **nothing
else**. It has no logic: no validator, no client, no encoder, no helper. The
logic packages read it and never write to it.

- **Contents.** The Play API OpenAPI document (the Play and verify documents
  only), the Snapshot JSON Schema, the signing vectors, the Snapshot vectors
  (`valid/` and `invalid/`), later the signed-action vectors, the types
  generated from the documents and the schema (`openapi-typescript` for the
  OpenAPI documents; `json-schema-to-typescript` for the Snapshot schema, which
  gives the structural types only: the conditional blindness rules stay with the
  validator in `snapshot`), the **lock file** `contracts.lock.json` (source,
  source commit, and SHA-256 per artifact), and the input of the drift-check job
  (the lock file itself and the list of published sources). Generated files are
  committed and never edited by hand.
- **Two entry points** (`package.json` `exports`):
  - the **runtime entry** (`.`) exports the schemas and the generated types. It
    is the only entry any production code may import;
  - the **test-only entry** (`./testing`) exports the vectors. Only test files
    may import it.
- **Source layout (pinned).** Inside `packages/contracts/src/`, the **runtime
  sources** are `index.ts` (the runtime entry), `schemas/` (the vendored OpenAPI
  documents and the Snapshot schema), and `generated/` (the generated types).
  The **test-only sources** are `testing.ts` (the test-only entry) and
  `vectors/`: every vendored vector (`vectors/signing.json`, from the backend's
  `test/vectors/signing.json`; `vectors/snapshot/valid/` and
  `vectors/snapshot/invalid/`; later the signed-action vectors), and any module
  that only the test-only entry uses. Nothing else belongs in `src/`. A module
  that both entries import is a runtime module by definition, so it lives under
  `schemas/` or `generated/` and holds no vector data. (`test/vectors/...` is
  the path in the backend's contracts repository; `contracts.lock.json` records
  the source path and the path in this package.)
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
     refuses `!` entries. The full `npm pack` tarball content check, which
     arrives with the release work (#12), also asserts that each published
     package contains its `README.md` and `LICENSE`.
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

### The cryptography

- `signing` is a hand-written encoder for a **fixed set of types**, over
  `@noble/curves` (secp256k1) and `@noble/hashes` (Keccak-256, SHA-256). It
  follows the rules of the backend's Go verifier: signatures are 65 bytes
  `r ‖ s ‖ v`, `v` in `{27, 28}`, low `s`; recovery rejects any other length,
  `v`, a high `s`, and the zero address; signing is deterministic (RFC 6979) and
  normalizes `s`.
- No general EIP-712 library (`viem`, `ethers`) is a dependency. They are used
  only as the independent generator of the vectors in the contracts repository.
- **Vectors.** The package's tests replay `test/vectors/signing.json` from the
  contracts repository (the file `viem` generated, so an independent
  implementation checks this one) and the worked-round vectors, read through the
  test-only entry of the `contracts` package, where they are copied with their
  source commit noted. The signed-action spec's vectors join them.
  <!-- TODO(signed-action spec): the spec's vector file and where it is published. -->

### How the kit gets its contracts

The kit and the backend share **documents**, never code. Each document is copied
into the `contracts` package (`packages/contracts/`) and pinned in its
`contracts.lock.json`, which records, for each file, the source (by name), the
source commit, and the SHA-256 of the content. **Decided (TPO, 2026-10-15;
[OQ-6](./wrapper.md#decided-questions)): vendor now, publish later.** The
sources are private today, so the kit vendors copies and does not wait for the
backend to publish; no git submodule is used. When the backend publishes its
contracts (the Snapshot bundle, the OpenAPI documents, the vectors), the
`contracts` package is replaced by that dependency (option B) without touching a
logic package.

| Contract (by name and version)                                                         | Used by       | Form in the kit                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Play API `/play/v1` and the verify API read (OpenAPI documents)                    | `play-client` | in `contracts`: the Play and verify documents only, never any other surface's document. Types are generated with a pinned `openapi-typescript` (a development dependency) into committed files in `contracts`; `play-client`'s hand-written thin `fetch` layer sits on them. CI regenerates and fails on a diff.                                                  |
| The Snapshot schema `se.snapshot/1`, its golden vectors, and the published bundle      | `snapshot`    | in `contracts`: the schema, types (runtime entry), and the `valid/` and `invalid/` vectors (test-only entry). <!-- TODO(Snapshot bundle): the backend specifies a content-hashed bundle (schema plus vectors) for TypeScript consumers; until it is published the kit copies the schema file and the vectors by the same procedure, with the same lock entry. --> |
| The signing vectors (`test/vectors/signing.json`) and the signed-action spec's vectors | `signing`     | in `contracts`: the files, unchanged, on the test-only entry                                                                                                                                                                                                                                                                                                      |
| The environment configuration schema                                                   | the Wrapper   | owned by the kit (in `shell`), not copied and not in `contracts`                                                                                                                                                                                                                                                                                                  |

Rules:

1. **Vendor, with the source noted.** A contract file is copied by a person (or
   a script run by a person) with access, and the pull request shows the diff
   and the new lock entry. **No kit job holds a credential to read a private
   repository**: the kit's CI never fetches from one.
2. **Verify offline.** The `contracts` job recomputes each copied file's SHA-256
   and fails when it differs from the lock, and fails when the generated types
   in `contracts` differ from a regeneration of the committed documents.
3. **Detect drift.** Until the backend publishes its contracts, drift is
   detected from the backend side, which reads this repository's public lock
   file (no credential needed), and by the person who runs the sync. Once a
   published source exists, a `contracts-drift` job compares each lock entry
   with it and reports a difference as a warning for an additive change and a
   failure for a breaking one.
   <!-- TODO(contract publication): the published locations; then the drift job and its severity. -->
4. **Additive changes cost the kit nothing.** Within `/play/v1` and
   `se.snapshot/1` changes are additive, and clients are tolerant readers, so an
   older kit keeps working; the sync adds new fields when the kit wants them.
5. **Review before publish.** Every file copied into this public repository is
   reviewed as [Never in the public repository](#never-in-the-public-repository)
   says. The signing vectors use a well-known local test key and are public by
   design; the review still happens.

### Versioning and compatibility

- The kit uses semantic versioning per package, managed by changesets. The
  published packages (`contracts`, `signing`, `snapshot`, `play-client`, and
  `shell`) version independently; the Wrapper bundle has its own version and a
  release record. The changelogs are generated by `@changesets/changelog-github`
  (`.changeset/config.json`, repository `IntraverseGame/se-client-kit`), which
  needs a GitHub token only when `changeset version` runs in the release job:
  the `GITHUB_TOKEN` the Actions runtime provides to that job with least
  privilege, never a stored secret and never in the repository
  ([release runbook](../runbook/client-kit-release.md#release)).
- **Contract compatibility.** A kit built for `/play/v1` and `se.snapshot/1`
  keeps working through every additive change of those contracts. A breaking
  change is a new surface prefix (`/play/v2`) or `se.snapshot/2`, served
  alongside the old one for a deprecation window, and a new **major** of the
  affected kit packages.
- The kit states what it was built against in `contracts.lock.json` and in each
  release's notes: the Play API prefix, the Snapshot schema id, and the signing
  vector set. A Wrapper release is served only against a matching backend
  contract
  ([release runbook](../runbook/client-kit-release.md#verify-before-and-after)).
- The release cadence is independent of the backend's: the kit can ship a UI fix
  without a backend release, and the backend can ship an additive change without
  a kit release.

### Supply chain

The kit publishes code players run and packages others install, so its build is
the attack surface a player cannot see. The rules:

- **Lockfile and install.** `pnpm-lock.yaml` is committed; CI installs with
  `--frozen-lockfile`. Dependency lifecycle scripts are disabled by default
  (only an explicit allow-list may run one), and the lockfile and every
  `package.json` are code-owner paths. A newly published dependency version
  SHOULD wait a configured age before it is accepted (pnpm's minimum release
  age). The age is **7 days** (`minimumReleaseAge: 10080` minutes, strict, in
  `pnpm-workspace.yaml`), no lifecycle script is allowed (`allowBuilds` has no
  `true` entry; `esbuild`, brought by `tsx`, is denied explicitly so the strict
  check passes), the trust policy is `no-downgrade`, and dependencies are saved
  at an exact version. Dependabot's `cooldown` is 7 days to match, for the `npm`
  and the `github-actions` ecosystems.
- **Runtime dependencies are an allow-list**: `@noble/curves` and
  `@noble/hashes`, and nothing else
  ([ADR-001](../decisions/ADR-001-toolchain-and-signing.md)). Anything else
  needs an ADR first. A CI job (`allow-list`, `pnpm check:deps`) fails if any
  `package.json` declares a dependency outside the list in
  `tools/allowed-dependencies.json`, which a test keeps equal to the ADR's
  table. It checks names and specifiers in `dependencies`, `devDependencies`,
  `peerDependencies`, and `optionalDependencies`, in `overrides`,
  `pnpm.overrides`, `resolutions`, `catalog`, and `catalogs` of every
  `package.json`, and in `overrides`, `catalog`, and `catalogs` of
  `pnpm-workspace.yaml`. A specifier must be an exact registry version (or
  `workspace:` for a kit package, or a `catalog:` reference); git, URL, `file:`,
  `link:`, `npm:` alias, range, and tag specifiers are rejected, as is any
  construct in those YAML sections the check cannot read.
- **Pinned toolchain.** The Node version, the package manager (`packageManager`
  with its hash), and every GitHub Action (**by full commit SHA**, updated by
  Dependabot's pull requests) are pinned.
- **Provenance.** Packages are published from GitHub Actions with npm
  provenance, so each version links to the commit and workflow that built it.
  The Wrapper bundle is released with a build-provenance attestation and a
  SHA-256 manifest of every file.
- **Credentials.** The publishing credential is never in the repository. The
  preferred form is npm trusted publishing from the release workflow (no
  long-lived token); otherwise a token in a protected GitHub environment with
  required
  reviewers. <!-- TODO(infrastructure owner): which form the npm organization supports, and the rotation procedure. -->
- **Bundling.** A package's own source is the only thing in its `dist/`; nothing
  from `node_modules` is ever bundled (`deps` in `tsdown.base.ts`). A kit
  package stays an import (`neverBundle` for the `@intraverse/` scope), a
  package's `dependencies` are external by tsdown's default, and any other
  package, a devDependency or one that is not declared at all, fails the build
  (`onlyBundle: []`). tsdown would otherwise inline anything not listed in
  `dependencies`, which could copy another package, a dependency the allow-list
  never saw (a runtime dependency moved to `devDependencies` would ship inside
  the package), or the `contracts` vectors into this one.
  `tools/tsdown-bundling.test.ts` builds a fixture each way.
- **Reproducible build.** The Wrapper build is deterministic for a commit and a
  lockfile, so anyone can rebuild a release and compare its manifest. The
  packages (tsdown) are too: building the same sources twice from a clean state,
  in two different directories, gave byte-identical `dist/` trees (JavaScript,
  its source maps, and declarations; chunk names are content hashes).
- **Vulnerability and license checks** run in CI on every change and on a
  schedule (`pnpm audit` for production dependencies: the CI job fails on high
  and critical advisories only, the weekly scheduled run reports every severity;
  dependency review on pull requests, secret scanning with push protection on
  this public repository).

### How the Wrapper reaches the SuperEngine origin

The Wrapper must be served from the SuperEngine origin and from nowhere else: it
is SuperEngine code whose shell holds the player's key, and the game runs on
another origin.

1. The release workflow builds the Wrapper and publishes a **release bundle**:
   hashed static files, an integrity manifest (SHA-256 per file, from which
   Subresource Integrity attributes are generated), the attestation, and a
   headers file with the recommended `Content-Security-Policy` (no
   `unsafe-inline`, no `unsafe-eval`, `connect-src` limited to the SE origin and
   the configured RPCs, `frame-src` the game origins),
   `Referrer-Policy: no-referrer`, and a `Permissions-Policy`.
2. A deploy job **on the SuperEngine side** pulls a released version by its tag
   and digest, verifies the attestation and the manifest, and uploads it to the
   public, content-addressed artifact store behind the CDN. The environment's
   configuration document points at that version.
3. The **deploy credentials stay on the SuperEngine side**, in a protected
   environment. This repository holds none: it only publishes artifacts anyone
   can read.
4. A rollback is repointing the environment to the previous released digest.

<!-- TODO(infrastructure owner): the hosting hostnames, the repository and the protected environment that run the deploy job, the CDN header rules, and the `frame-ancestors` allow-list (the Wrapper is embedded by each operator's page, so the allow-list comes from operator configuration and cannot be one static header), and the RPC provider list with its CORS behavior and `connect-src` entries (owned by the infrastructure owner; see [wrapper.md](./wrapper.md#configuration)). -->

### Never in the public repository

A public repository cannot take content back once it is cloned, forked, or
cached. The following never enter the kit, in any file, commit, issue, pull
request, workflow log, agent output, or release note:

- secrets: credentials, tokens, private keys (the test keys in the vectors are
  public by design and are the only exception), connection strings, signing
  keys, npm or deploy credentials;
- internal hostnames, internal URLs, dashboard links, account identifiers, cloud
  resource names;
- unpublished backend internals: only the player-facing contracts (the Play API
  document, the Snapshot schema bundle, the signed-action specification, the
  signing vectors) are shared, and only as copies; no operator, wallet, or admin
  API document, no internal module names or designs;
- anything about an operator's credentials or contracts, or a player's data;
- unreleased security findings (they go through `SECURITY.md`).

Every file added from a private source is **reviewed before it is merged**, by
the code owners, against this list. Backend-owned contracts are referenced by
name and version only, never by a link into a private repository.

### Testing and CI

The kit's tests are the executable half of
[wrapper.md's test plan](./wrapper.md#test-plan).

| Level     | Tool                                 | What                                                                                                                                           |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                               | per package; the signing, Snapshot, and transcript vectors; the token schedule; redaction                                                      |
| Component | Vitest and jsdom                     | the Wrapper renders every `valid/` Snapshot                                                                                                    |
| e2e       | Playwright                           | win, loss, cash-out, offline, typed errors, two tabs, the sandbox, accessibility, the no-secret scan                                           |
| Static    | oxlint, stylelint, oxfmt, TypeScript | lint (oxlint for TypeScript, stylelint for CSS), format check (oxfmt, for every file type it supports), `tsc --noEmit`, import-direction rules |
| Tooling   | Vitest, tsx                          | `tools/`: the lint fixtures that prove a violation fails (TypeScript and CSS), the allow-list check, the test-only-entry check                 |

**CI jobs** (GitHub Actions, one required aggregate job `ci-ok`): `lint` and
`format`; `typecheck`; `unit` (`pnpm test`); `allow-list` (the dependency
allow-list); `contracts` (the hash check, the regenerated-types diff, and the
import check that the test-only entry is imported only by tests);
`contracts-drift` (rule 3 above, when a source is published); `build` (the
bundle, its manifest, a size budget, a check that the same bundle is what e2e
runs and what is released (no test or per-environment build), and a check that
no vector reaches any bundle or release output); `e2e-fake` (Playwright against
the in-repo fake Play API, which answers from the contract's vectors); `audit`
(`pnpm audit --prod`, failing on high and critical advisories only);
`dependency-review` (pull requests only); `release` (changesets, provenance, on
the default branch only).

Today `contracts` runs the test-only-entry import check only; the hash check and
the regenerated-types diff arrive with the `contracts` package, and
`contracts-drift` and `release` are not defined yet. `build` builds every
workspace; the manifest, size budget, and no-vector content check join it with
the first release build, and the job also runs `pnpm check:build-output` and
`pnpm check:package-files`. `e2e-fake` has no suites yet. The workflows hold no
secret, run with `permissions: {}` at the top and `contents: read` per job, and
pin every Action by full commit SHA.

#### Task orchestration and caching

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
([ADR-001](../decisions/ADR-001-toolchain-and-signing.md)).

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

### Environment configuration

The Wrapper's build is identical in every environment; the values come from one
environment configuration document ([wrapper.md](./wrapper.md#configuration))
whose schema the kit owns. The release build **refuses** a configuration fixture
with `minRpcQuorum` below 2 outside the `local` and `preview` fixtures, so the
single-RPC gap of the first release cannot ship by accident. This is an
**additional guard**: the Wrapper itself also refuses to start with
`environment: production` and `minRpcQuorum` below 2
([wrapper.md](./wrapper.md#contract), W-26a). The configuration schema, and so
the fixture check, also refuses an entropy source with fewer configured
endpoints than `minRpcQuorum` (W-26b).

### Bootstrap

The repository exists. Bootstrap is the scaffolding that follows this knowledge
layer: the workspace, the six packages and apps (`contracts`, `signing`,
`snapshot`, `play-client`, `shell`, `wrapper`) and the reference game, the lint
and format configuration, the CI workflows, the CODEOWNERS file, and the pinned
versions (ADR-001's table). The toolchain pull request landed the workspace, the
empty skeletons, the lint and format configuration, the CI workflows,
dependabot, changesets, and the pinned versions; CODEOWNERS stays comment-only
until the org owners name themselves. Its checklist, and the repository settings
the org owners apply (branch protection, secret scanning with push protection,
the publishing environment), are in the
[release runbook](../runbook/client-kit-release.md#bootstrap-the-toolchain).

## Errors and edge cases

- **A contract file in the kit is stale.** The drift check flags it; the fix is
  a sync pull request here. Until then the kit works against the contract it
  pinned.
- **A breaking contract change lands first.** It needs a new surface prefix, so
  the old kit keeps working through the deprecation window.
- **A dependency of the kit is compromised.** The lockfile and the allow-list
  limit the exposure to two runtime dependencies; the runbook has the deprecate
  and rotate steps.
- **The kit's vectors and the backend's disagree.** One of them is wrong. Both
  implementations replay the same file, so a disagreement is a failing test in
  one repository, never a silent difference.

## Security

What the kit must never contain is [above](#never-in-the-public-repository).
What the Wrapper must never expose is in [wrapper.md](./wrapper.md#security).
The release path is the main risk: [Supply chain](#supply-chain) and the
runbook's escalation steps.

## Observability

The kit has no runtime component of its own: the Wrapper emits no telemetry in
the first release ([wrapper.md](./wrapper.md#observability)). The release
workflow's logs are public and hold no secret.

## Open items

| Item                                                                                                                                                                                                                                                   | Owner                                               | Marker                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CODEOWNERS (comment-only until the org owners give their handles; branch protection, with a required pull request and no self-approval, is the interim control), branch protection, secret scanning, and the publishing environment of this repository | the two org owners                                  | <!-- TODO(org owners): CODEOWNERS = the two org owners, branch protection, secret scanning with push protection, the publishing environment -->                                                                                                                               |
| Claiming the `intraverse` npm organization and the `@intraverse/se-client-*` names (decided; not claimed yet)                                                                                                                                          | the org owners, with the publishing work (#12)      | <!-- TODO(org owners): claim the npm organization `intraverse` and the package names -->                                                                                                                                                                                      |
| License                                                                                                                                                                                                                                                | TPO                                                 | MIT today (set at creation); confirmed by the TPO in review. Not blocking                                                                                                                                                                                                     |
| Hosting of the released Wrapper and its deploy credentials                                                                                                                                                                                             | infrastructure owner                                | <!-- TODO(infrastructure owner): hosting, deploy repository and environment, `frame-ancestors` source -->                                                                                                                                                                     |
| Publication of the backend's contracts and vectors (later step; not a blocker, OQ-6 decided)                                                                                                                                                           | backend maintainers                                 | <!-- TODO(contract publication): where and when -->                                                                                                                                                                                                                           |
| The preview-stack pin and job                                                                                                                                                                                                                          | backend repository                                  | <!-- TODO(preview stack) -->                                                                                                                                                                                                                                                  |
| Type-aware lint (`oxlint-tsgolint`, for rules such as `no-floating-promises`)                                                                                                                                                                          | follow-up pull request (needs an ADR-001 amendment) | <!-- TODO(follow-up): add `oxlint-tsgolint` to the allow-list and enable the type-aware rules -->                                                                                                                                                                             |
| Where the controller protocol's type definitions live, so `reference-game` can import only types                                                                                                                                                       | TPO, with the shell's first pull request            | <!-- TODO(controller protocol): a type-only subpath of `shell` is the working rule; a separate `controller` package is the alternative if game developers should not depend on `shell` at all. Recommended: start with the subpath, split when a second consumer appears. --> |

## References

- [wrapper.md](./wrapper.md),
  [ADR-001](../decisions/ADR-001-toolchain-and-signing.md),
  [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Backend-owned contracts, by name and version: the Play API `/play/v1`; the
  Snapshot schema `se.snapshot/1` and its bundle; the signed-action spec; the
  signing vectors.
