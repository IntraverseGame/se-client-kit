# Packages

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

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

| Package                                      | Published                              | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Depends on (kit)                                                                                                                                                                                                                                                  | Runtime dependencies                |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@intraverse/se-client-contracts`            | npm (runtime entry only)               | **Data only, no logic.** Everything vendored from the backend and nothing else: the Play API OpenAPI document, the Snapshot JSON Schema, the signing vectors, the Snapshot vectors (`valid/`, `invalid/`, `signature/`, `typed-data/`, `signed-action/`), the types generated from them, `contracts.lock.json` (source commit and content hash per artifact; kept in this repository, not published in the tarball), and the input of the drift-check job. It has **two entry points**: a **runtime** entry (the schemas and the generated types) and a separate **test-only** entry (the vectors), so vectors can never reach a browser bundle ([rules](./the-contracts-package.md)).                                                                                                                              | none                                                                                                                                                                                                                                                              | none                                |
| `@intraverse/se-client-signing`              | npm                                    | The hand-written, fixed-type EIP-712 encoder and secp256k1 signing and recovery: domain separator, type hashes, `hashStruct`, the `0x1901` digest, `PlayerAction`, `PlayerCashOut`, `PlayerCancel`, and the registry types the shell must recompute or verify (`NewRound`, `CreateRoundAuth`, `MarkReadyAuth`, `CloseRoundAuth`, `PayoutTerms`). Canonical 65-byte signatures, key generation, the transcript helper (the `previous` chain, one signature per sequence), the canonical `typedData` encoder (`ActionTypedData`), the action grammar, and a raw `keccak256` over bytes (for the verify page's StepsDerive) ([The cryptography](./the-cryptography.md) says which types are implemented today). It takes vectors from `contracts` in **tests only** (a development dependency on the test-only entry). | none at run time                                                                                                                                                                                                                                                  | `@noble/curves`, `@noble/hashes`    |
| `@intraverse/se-client-snapshot`             | npm                                    | The hand-written validator over the Snapshot schema's keyword profile (the `Snapshot`, `PlayProblem`, and `AmountRequest` validators) and the render helpers (pure functions over a validated Snapshot). It takes the schema and the types from `contracts`, and its tests take the vectors from `contracts`' test entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `contracts`                                                                                                                                                                                                                                                       | none                                |
| `@intraverse/se-client-play-client`          | npm                                    | A typed `fetch` client for the Play API (and the verify API read the Wrapper needs), generated from the OpenAPI documents. It takes its types from `contracts`, returns the Snapshot body as `unknown`, and never interprets it. It holds no credential: the shell keeps the play token and runs its refresh, using the client's request layer and schedule functions.                                                                                                                                                                                                                                                                                                                                                                                                                                              | `contracts`                                                                                                                                                                                                                                                       | none (it uses the platform `fetch`) |
| `@intraverse/se-client-shell`                | npm                                    | The headless part of the Wrapper: session and token lifecycle, key custody, the transcript, Web Locks, `CreateRoundAuth` and tip checks, the controller boundary, the redacting types and logger. It has no DOM dependency beyond the platform APIs it is given.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `signing`, `snapshot`, `play-client` (and `contracts` through them)                                                                                                                                                                                               | none                                |
| `@intraverse/se-client-wrapper` (app)        | no: a release bundle                   | The UI: rendering, accessibility, the iframe mount, the build. It uses the shell and renders only what the shell hands it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `shell` (and its types)                                                                                                                                                                                                                                           | none                                |
| `@intraverse/se-client-reference-game` (app) | no                                     | A minimal game for the tests and as a sample for game developers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | nothing but the type definitions of the controller protocol `se.controller/1`: `import type` from `shell`'s type-only subpath `@intraverse/se-client-shell/controller`, a development dependency (no runtime code; [The reference game](./the-reference-game.md)) | none                                |
| `@intraverse/se-client-verify` (app)         | no: ships inside the Wrapper's release | The verify page ([Verify page](../verify-page.md)): a round recomputed in the browser from its public evidence. Today it holds only the fairness kernel's derivations (kernelVersion 1: the commitments, the seed, StepsDerive) for checks 5 and 7, keyed on the kernel version; the page, its reads, and its other checks are not built yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `signing` (its raw `keccak256`); later `contracts` (runtime entry), `play-client`, and `snapshot` if the verify API's body embeds a Snapshot; never `shell`                                                                                                       | none (Web Crypto for SHA-256)       |

Dependency direction. There are no cycles, and a package never imports an app:

```text
contracts ──▶ snapshot ────┐
    │                      ├──▶ shell ──▶ wrapper (app)
    └─────▶ play-client ───┤
signing ───────────────────┘
signing ──────────────────────▶ verify (app; never shell)
contracts (test-only entry) ──▶ the tests of signing, snapshot, shell, wrapper,
                                verify, and the e2e fake Play API
                                (devDependencies)
```

- `contracts` is the only leaf that holds data; `signing` has no kit dependency
  at run time. `snapshot` and `play-client` depend on `contracts`'s runtime
  entry. `signing` takes vectors from `contracts`' test-only entry in its tests.
  No other package imports `contracts` directly except in tests (the consumers
  of the test-only entry are listed in
  [The `contracts` package](./the-contracts-package.md)). No package imports
  another sideways (`snapshot` and `play-client` never import each other), and a
  package never imports an app.
- `reference-game` imports no kit package at run time. Its sources and tests
  take the `se.controller/1` types from `shell`'s type-only subpath
  (`@intraverse/se-client-shell/controller`, a `types` condition only), with
  `import type` or `export type`; every other import of `shell` fails the lint,
  a runtime import of any package (kit or third-party) fails its Vite build, the
  lint refuses any other bare specifier in its non-test sources, and
  `pnpm check:build-output` proves the subpath has no runtime code
  ([The reference game](./the-reference-game.md)).
- `verify` (the verify page, an app) takes `signing` at run time for its raw
  `keccak256` (StepsDerive) and may take `contracts`' runtime entry,
  `play-client`, and `snapshot`; it never takes `shell` (it holds no credential,
  and the code that holds the key stays out of its bundle) nor the `contracts`
  test-only entry outside its tests, and no package or app imports it
  ([Verify page](../verify-page.md#build-and-release-v-15-to-v-17), V-15). The
  lint and `tools/fixtures/verify-direction-cases.ts` hold it to that. It is
  never versioned or released on its own: the page ships inside the Wrapper's
  release artifact, so its release notes go in the Wrapper's changesets, and
  `.changeset/config.json` ignores it as it does the reference game (decided by
  the human, 2026-10-19).
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
  `verify-direction-cases.ts`, `lint-rule-cases.ts`, and `style-rule-cases.ts`).
  The same entries reject another package's internals (`/src`, `/dist`, a
  relative path into a sibling package) and the `contracts` test-only entry
  outside tests.
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
  amendment). `unicorn/require-module-specifiers` is on: the last empty skeleton
  (`export {};`) went with the reference game, so an empty export statement
  fails.
- **Index files**: an `index.ts` exists only as the entry point of a package or
  an app (`packages/<name>/src/index.ts`, `apps/<name>/src/index.ts`) and holds
  only re-exports (`export { ... } from "...";`,
  `export type { ... } from "...";`, `export * from "...";`, or the empty
  `export {};`): no import, no declaration, no logic. An empty re-export
  (`export {} from`, a side-effect import) and a namespace re-export
  (`export * as ns from`) are not allowed. Comments are full-line `//` only (a
  block comment could hide a statement). A directory of internals has no
  `index.ts`; its modules are named after what they hold and imported by that
  name. An entry names each module once. oxlint cannot express this;
  `tools/index-files.test.ts` checks every index file in the repository. oxlint
  1.87's `no-duplicate-imports` with `includeExports` reports any
  `export { a, b } from` that names more than one binding, so `.oxlintrc.json`
  turns `includeExports` off for the entries only (duplicate imports there still
  fail, and the check above catches a module re-exported twice); everywhere else
  it stays on, so a multi-name `export { ... } from` outside an entry also
  fails. The override comes out when oxlint stops reporting a single multi-name
  re-export.
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
