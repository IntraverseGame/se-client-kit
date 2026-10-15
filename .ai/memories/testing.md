---
description: How tests are organized and how to add one. Read before writing or changing tests.
last-verified: 2026-10-15 (commit 8630f95, bootstrap; the levels are planned, no tests exist yet)
---

# Testing (agent context)

Rules: [specs/client-kit.md](../../specs/client-kit.md#testing-and-ci) and the
[Wrapper test plan](../../specs/wrapper.md#test-plan); procedure for adding
tests: [write-tests skill](../skills/write-tests/SKILL.md).

## Orientation (planned)

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
- **e2e** (Playwright): win, loss, cash-out, offline, typed errors, two tabs,
  the sandbox, accessibility, and a scan that no secret reaches the page, logs,
  or storage. They run against an in-repo **fake Play API** that answers from
  the contract's vectors, so a public CI job needs no private service.
  Preview-stack e2e runs elsewhere, against a pinned commit of this repository.
- **Contracts check:** CI recomputes the hash of every file in the `contracts` package
  against its lock file, and regenerates the types to fail on a diff.
- **Static:** lint, format check, `tsc --noEmit`, and the import-direction
  rules.

## Rules of thumb

- Deterministic and hermetic; no secrets; tests never import another package's
  internals.
- Assert on typed error `code`s, not messages; on money as strings or `bigint`.
- Never weaken a vector assertion to go green.
- A test never prints or snapshots a key or token.

<!-- TODO(toolchain PR): commands and CI job names land with the toolchain. -->
