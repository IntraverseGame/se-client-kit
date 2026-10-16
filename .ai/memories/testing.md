---
description: How tests are organized and how to add one. Read before writing or changing tests.
last-verified: 2026-10-16 (signing pull request; the tooling tests, a jsdom smoke test, and the `signing` unit and vector tests exist)
---

# Testing (agent context)

Rules: [specs/client-kit.md](../../specs/client-kit.md#testing-and-ci) and the
[Wrapper test plan](../../specs/wrapper.md#test-plan); procedure for adding
tests: [write-tests skill](../skills/write-tests/SKILL.md).

## Orientation

- **Unit** (Vitest) beside the code of each package: no real network, disk,
  timers, or clock; inject a clock and a random source; one behavior per test.
- **Vector replay:** wire and crypto formats are tested by replaying vendored
  vector files (signing vectors, Snapshot `valid/` and `invalid/` vectors, the
  signed-action vectors) read through the test-only entry of the `contracts`
  package; only tests may import that entry, and no vector may reach a bundle
  (a lint rule and a build check). Prefer adding a vector to adding a one-off assertion.
  Released vector files are never edited. The vectors were produced by an
  independent implementation in another language; that independence is the
  point, so do not regenerate them from this repository's code.
- **Component** (Vitest with jsdom): the Wrapper renders every valid Snapshot;
  accessibility checks on components.
- **Signing tests** (`packages/signing/src/*.test.ts`) read vectors through
  `src/fixtures/vectors.ts` (the only importer of the test-only entry there)
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
- **Contracts check:** CI recomputes the hash of every file in the `contracts` package
  against its lock file, and regenerates the types to fail on a diff.
- **Build output:** `pnpm check:build-output` (after `pnpm build`) inspects every
  `dist/`: only `.js` (with its `.js.map`) and `.d.ts` (no declaration map, no `sourceMappingURL` comment), no test file or build state, and no
  vector reachable from the `contracts` runtime entry (import graph plus source
  maps), covered by `tools/build-output.test.ts`.
- **Package files:** `pnpm check:package-files` (after the library builds) holds
  each library's `files` to its `dist/`: everything the runtime entry loads is
  selected, and in `contracts` nothing else (no test-only entry or chunk);
  covered by `tools/package-files.test.ts`, which also checks the manifests.
- **Static:** lint, format check, `tsc --noEmit`, and the import-direction
  rules.

## Rules of thumb

- Deterministic and hermetic; no secrets; tests never import another package's
  internals. The one exception to hermetic is the preview-stack e2e (Wrapper
  tests T-10 to T-12), which runs from the backend-owned job and is never part
  of `pnpm check`.
- Assert on typed error `code`s, not messages; on money as strings or `bigint`.
- Never weaken a vector assertion to go green.
- A test never prints or snapshots a key or token.

## Commands and CI jobs

- `pnpm test` runs the `vitest run` of every workspace that has tests (today only `apps/wrapper`; a package gets a `test` script with its first real test) plus the tooling tests in
  `tools/` (`test:tools`); `pnpm test:e2e` runs the Playwright suite (none yet,
  so it passes with no tests). `pnpm check` is everything below.
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
- The jsdom smoke test is `apps/wrapper/src/environment.test.ts`; component
  tests set `environment: "jsdom"` through `apps/wrapper/vite.config.ts`.
- **Cache.** Tests are wireit scripts; a passing run is cached by its declared
  `files`. A test that reads a file outside the package's `files` (a vector, a
  schema, an ADR) must list it, or depend on the task that produces it. `e2e`
  has no `files`, so it always runs. `pnpm clean:cache` forgets every
  cached result.
- CI jobs (`.github/workflows/ci.yml`): `lint`, `format`, `typecheck`, `unit`,
  `allow-list`, `contracts`, `build`, `e2e-fake`, `audit` (fails only on high and critical advisories; the weekly `audit.yml` reports every severity), `dependency-review` (pull requests only),
  and the aggregate `ci-ok`. `contracts-drift` and `release` are not defined yet.
