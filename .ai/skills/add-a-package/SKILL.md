---
name: add-a-package
description: Use when adding a new package under packages/ (or an app under apps/). Covers the placement check, the dependency direction, public API, wiring, tests, and docs.
---

# add-a-package

## Prerequisites

- An agreed spec (or accepted RFC) for the capability — see
  [prd-to-spec](../prd-to-spec/SKILL.md).
- Read [.ai/memories/architecture.md](../../memories/architecture.md).
- The toolchain exists (pnpm workspace, wireit scripts, oxlint and stylelint, Vitest, tsx for `tools/`). Copy
  the shape of an existing package under `packages/`: `package.json` with the
  `build` (`tsdown`) and `typecheck` (`tsc -p tsconfig.json`) wireit scripts (and
  `test` once it has its first real test), `tsconfig.json` (with `declaration`
  and `isolatedDeclarations` for a library: every export needs an explicit type),
  and `tsdown.config.ts` (see `tsdown.base.ts`; add each entry point).

## Workflow

0. **Decide it is a package.** It must have one reason to exist, a public API
   other code can use without its internals, and a place in the dependency
   direction. If it is a helper of one package, keep it inside that package; no
   `utils` or `common` package; name the concern. A package that holds a
   credential is the shell's concern: new credential-handling code goes in the
   shell, never in a leaf or an app.
1. **Place it in the graph.** Today: `contracts` (data only) is a leaf; `snapshot` and
   `play-client` depend on it; `signing` has no kit dependency at run time;
   `shell` depends on `signing`, `snapshot`, and `play-client`; the `wrapper` app
   depends on `shell`. Never put logic in `contracts`; data vendored from the
   backend goes there, and only tests import its test-only entry.
   State which packages the new one may import and which may import it; the
   graph stays acyclic, a package never imports an app. Record the placement in
   the packages' spec and in the architecture memory.
2. **Layout:** `packages/<name>/` with `src/` (internals), `src/index.ts` (the
   only public entry point, holding only `export ... from` re-exports; no other
   `index.ts` anywhere in the package), `test/`, `package.json`, and a `tsconfig` that
   extends the shared strict base. `package.json` has an `exports` map to the
   entry point only, `"type": "module"`, an explicit `files` list that selects
   only its `dist` output (`["dist"]`; never `src`, `.wireit`, `*.tsbuildinfo`,
   or a config file; npm adds `package.json` and the README itself), and no
   lifecycle scripts. `tools/package-files.test.ts` and
   `pnpm check:package-files` fail without it; add the new library to the
   `dependencies` of the root `check:package-files` script.
3. **Dependencies:** a workspace dependency on another kit package is allowed
   only along the dependency direction. A third-party runtime dependency needs
   an ADR first; a development tool needs a recorded decision. Pin per the
   lockfile policy; never add a lifecycle script.
4. **Enforce the direction:** add the package to the import-restriction rules of
   the lint configuration so a forbidden import fails: a pair of `overrides`
   entries in `.oxlintrc.json` (one for the package, one for its test files)
   carrying a `no-restricted-imports` rule, and the package's name added to the
   restricted groups of the others. Add a negative case to
   `tools/fixtures/import-direction-cases.ts` (the dependency-direction cases;
   the other rule cases are in `lint-rule-cases.ts` and `style-rule-cases.ts`) proving the rule fires, and add the package
   to the root `build` and `typecheck` wireit dependencies (and `test` when it
   gets its first test), and to `packages/*/tsdown.config.ts` coverage of the
   root `tsconfig.json`. **Wire the graph:** a package resolves another through
   its `exports`, which point at `dist/`, so its `build`, `typecheck`, and `test`
   wireit scripts list the `build` of every kit package it imports (and of
   `contracts` when its tests import the test-only entry) in `dependencies`;
   otherwise they may see a missing or stale `dist/`. Add the new package's
   `build` to the `dependencies` of each package or app that will import it.
5. **API and types:** strict TypeScript, no `any`, named exports (ADR-001), `type`
   over `interface` and arrow functions over `function` (AGENTS.md), no
   side effects at import. Money amounts are strings or `bigint`. Errors are
   typed. Nothing in the package logs or stores a key or token.
6. **Build gotcha (`contracts`):** use named re-exports in its runtime source;
   `export * as ns` makes rolldown emit an unmapped helper chunk that
   `pnpm check:build-output` rejects.
7. **Tests:** unit tests, vector replay for wire or crypto formats, and the
   check that the public entry point exports exactly what the spec lists.
8. **Release:** a changeset; mark the package private until it is meant to be
   published; if it is published, its `exports`, provenance, and license are
   set per the release runbook (planned).
9. **Docs:** a spec for its contract (with its **Boundary** section), the
   package map in `.ai/memories/architecture.md` and `overview.md`, the README
   package list, and the package's own `README.md`. The README is public
   documentation that ships to npm: write it for a consumer (what it is, when to
   use it, install line, entry points, guarantees), with links only into this repository
   (absolute `https://github.com/IntraverseGame/se-client-kit/blob/main/...`; any
   other host fails) and
   no contributor material; copy the shape of an existing one. Add the npm
   metadata to the library's `package.json` (`description`, `keywords`,
   `license`, `repository` with `directory`, `bugs`, `homepage`).
   `tools/readmes.test.ts` fails without the README or if it breaks the rules.

## Constraints

- No new runtime dependency without an ADR; no `util`/`common`/`helpers` package.
- Never import another package's internals; use its public entry point.
- Public repository: no secrets, internal hostnames, or unpublished backend
  internals in the new package or its fixtures.

## Useful commands

```sh
pnpm check
pnpm lint
```

## Expected output

A building, linted, tested package with a public entry point, an enforced place
in the dependency direction, and updated specs and memories.

## References

- [AGENTS.md#architecture-rules](../../../AGENTS.md#architecture-rules),
  [reviewer agent](../../agents/reviewer.md)
