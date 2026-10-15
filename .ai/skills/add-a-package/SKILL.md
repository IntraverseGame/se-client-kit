---
name: add-a-package
description: Use when adding a new package under packages/ (or an app under apps/). Covers the placement check, the dependency direction, public API, wiring, tests, and docs.
---

# add-a-package

## Prerequisites

- An agreed spec (or accepted RFC) for the capability — see
  [prd-to-spec](../prd-to-spec/SKILL.md).
- Read [.ai/memories/architecture.md](../../memories/architecture.md).
- The toolchain exists
  (<!-- TODO(toolchain PR): workspace, build, lint, and test configuration land with the toolchain -->).

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
   only public entry point), `test/`, `package.json`, and a `tsconfig` that
   extends the shared strict base. `package.json` has an `exports` map to the
   entry point only, `"type": "module"`, an explicit `files` list, and no
   lifecycle scripts.
3. **Dependencies:** a workspace dependency on another kit package is allowed
   only along the dependency direction. A third-party runtime dependency needs
   an ADR first; a development tool needs a recorded decision. Pin per the
   lockfile policy; never add a lifecycle script.
4. **Enforce the direction:** add the package to the import-restriction rules of
   the lint configuration so a forbidden import fails
   (<!-- TODO(toolchain PR): the rule format depends on the lint tool -->). Add a
   negative fixture proving the rule fires.
5. **API and types:** strict TypeScript, no `any`, named exports (ADR-001, proposed), no
   side effects at import. Money amounts are strings or `bigint`. Errors are
   typed. Nothing in the package logs or stores a key or token.
6. **Tests:** unit tests, vector replay for wire or crypto formats, and the
   check that the public entry point exports exactly what the spec lists.
7. **Release:** a changeset; mark the package private until it is meant to be
   published; if it is published, its `exports`, provenance, and license are
   set per the release runbook (planned).
8. **Docs:** a spec for its contract (with its **Boundary** section), the
   package map in `.ai/memories/architecture.md` and `overview.md`, and the
   README package list.

## Constraints

- No new runtime dependency without an ADR; no `util`/`common`/`helpers` package.
- Never import another package's internals; use its public entry point.
- Public repository: no secrets, internal hostnames, or unpublished backend
  internals in the new package or its fixtures.

## Useful commands

```sh
pnpm check   # <!-- TODO(toolchain PR): available once the toolchain lands -->
pnpm lint
```

## Expected output

A building, linted, tested package with a public entry point, an enforced place
in the dependency direction, and updated specs and memories.

## References

- [AGENTS.md#architecture-rules](../../../AGENTS.md#architecture-rules),
  [reviewer agent](../../agents/reviewer.md)
