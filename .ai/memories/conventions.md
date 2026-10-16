---
description: TypeScript, error, money, secret, logging, and naming conventions. Read before writing code.
last-verified: 2026-10-16 (toolchain pull request; the TypeScript rules are accepted in ADR-001 and enforced by oxlint, and stylelint for CSS)
---

# Conventions

Binding rules: [AGENTS.md#non-negotiables](../../AGENTS.md#non-negotiables).
This note records the patterns behind them.

- **Strict TypeScript.** `strict` on (plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`; see
  `tsconfig.base.json`), no `any`, no `@ts-ignore`, and a `@ts-expect-error`
  only with a reason on the same line. oxlint (all four of `correctness`,
  `suspicious`, `pedantic`, `perf` as errors; warnings fail) rejects `any`,
  `@ts-ignore`, `@ts-nocheck`, a reasonless `@ts-expect-error`, a default export
  in a library, a side-effect import, a non-null assertion, `==`, `eval`,
  `new Function`, a focused or skipped test, and an unused disable directive.
  Type-aware rules are off (they need `oxlint-tsgolint`, not on the allow-list;
  a follow-up pull request). The reason on a disable comment or a
  `@ts-expect-error` is checked by review, not by a rule.
  `unicorn/require-module-specifiers` is off only for the empty `export {};`
  skeletons; the first real package pull request re-enables it. Relative imports
  carry the `.ts` extension; tsdown bundles it on build (no extension is left in `dist/`). Prefer
  `unknown` at trust boundaries and narrow it with a validator.
- **Tests:** a package gets a `test` script (and its entry in the root `test`
  wireit dependencies) with its first real test. Never add a placeholder test
  or `--passWithNoTests` to make an empty package green.
- **CSS:** stylelint with explicit rules (`stylelint.config.mjs`): no unknown
  names or values, no `!important`, no `@import`, no remote `url()` (strict CSP),
  no vendor prefixes, no stylistic rule (oxfmt formats).
- **Declarations:** libraries set `isolatedDeclarations`, so every exported
  value, function, and class member has an explicit type (re-exports of types use
  `export type`); `tsc --noEmit` and tsdown's `oxc` generator both enforce it.
  The `.d.ts` files are therefore exactly the declared API, never inferred.
- **`type` over `interface`; arrow functions over `function`** (both enforced by
  oxlint). Write `export const f = (a: number): number => { ... };`, not
  `export function f(...)`. `interface` is only for a class to `implements` or
  for declaration merging (global or module augmentation); `function` only for a
  generator (`const g = function* (): Generator<T> { ... }`), a function with its
  own `this` or `arguments`, and overloads. oxlint flags every `interface`
  (even an implemented one) and every function declaration, so an exception
  takes a disable comment such as
  `// eslint-disable-next-line typescript/consistent-type-definitions -- a class implements it`;
  oxlint cannot require the reason, so review enforces it. Known gaps: `export
  default function` and a function expression assigned to a variable
  (`const f = function () {}`) are not flagged; review catches them.
- **README per package and app is public documentation** (it ships to npm and is
  read by someone who has never seen the repository): consumer-facing (what, when
  to use, install line, entry points, guarantees), only what is true and tested,
  only absolute links into this repository
  (`https://github.com/IntraverseGame/se-client-kit/blob/main/...`; any other host,
  public or private, fails),
  no contributor or agent material (tooling, lint, CI, review, internal issue
  numbers), and the library `package.json` carries the npm metadata
  (`description`, `keywords`, `license`, `repository` with `directory`, `bugs`,
  `homepage`). Updated in the same change as the public API or role (spec drift
  sync); `tools/readme-rules.ts` and `tools/readmes.test.ts` enforce it. `e2e/`
  has none: it is neither an app nor a package.
- **Exports** _(ADR-001)_: named exports only in libraries; a single public
  entry point per package; no import-time side effects.
- **Money:** an amount (`Amount.value`) is a **string** of base units on the wire
  and a `bigint` in code. Never `number`, never floating point. A decimal value (rate,
  fee) is never a ledger amount; converting one to base units uses an explicit,
  specified rounding mode. Parse amounts in one place per package.
- **Secrets:** the action key and play token live in the shell's memory for the
  session only. They are wrapped in redacting types (a `toString` / `toJSON` that
  prints a placeholder) and are never logged, serialized, put in a URL, written
  to `localStorage`, `sessionStorage`, cookies, or IndexedDB, or placed in an
  error message. The public development keys the vectors were signed with
  (`packages/signing/src/fixtures/keys.ts`) are the only keys that may appear
  in the repository.
- **Errors:** typed errors with a stable `code`; callers branch on `code`, never
  on message text. Do not leak internals or secrets in messages. Errors from the
  backend are mapped from its published error codes.
- **Logging:** through one logger interface that redacts; the Wrapper emits no
  telemetry unless a spec says so. No `console.*` in library code (a lint
  rule for `packages/*/src`).
- **Time and randomness:** injected (a clock, a random source), so tests are
  deterministic. Cryptographic randomness comes from the platform.
- **Determinism:** signing is deterministic (RFC 6979); the same input gives the
  same bytes.
- **Naming:** lowercase package names that name the concern (`signing`,
  `snapshot`); no `util`, `common`, or `helpers` packages. Files are named for
  what they hold, one concern per file.
- **Dependencies:** a runtime dependency needs an ADR; development tools need a
  recorded decision; lifecycle scripts are off by default; versions are pinned
  by the lockfile, the `packageManager` field, and `.node-version`; dependencies
  are saved at an exact version and must be at least seven days old
  (`minimumReleaseAge`). The allow-list is `tools/allowed-dependencies.json`,
  kept equal to the ADR-001 table by a test and enforced by `pnpm check:deps`,
  which also requires exact registry versions (or `workspace:`) and covers
  overrides and catalogs in `package.json` and `pnpm-workspace.yaml`.
- **Generated files** (typed clients, generated types) are never edited by hand;
  regenerate and commit the output. CI regenerates and fails on a diff.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/),
  one logical change per PR.
- **Public repository:** commits, issues, and logs are world-readable. No
  secrets, internal hostnames, account identifiers, or personal data.
