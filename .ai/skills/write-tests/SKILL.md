---
name: write-tests
description: Use when adding or changing behavior, signing code, contracts, or the UI. Chooses the right test level and applies the repository's test rules.
---

# write-tests

## Prerequisites

- [.ai/memories/testing.md](../../memories/testing.md) (orientation) and the
  testing section of the kit's spec (the rules:
  [`specs/client-kit/testing-and-ci.md`](../../../specs/client-kit/testing-and-ci.md) and the
  [Wrapper test plan](../../../specs/wrapper.md#test-plan)).

## Workflow

1. Pick the level:
   - pure logic, a use case, a parser, a validator → **unit** (Vitest, beside the
     code);
   - a wire or crypto format → **vector replay**: run the vendored vector files
     through the code; add a vector rather than a one-off assertion;
   - rendering of a Snapshot, accessibility of a component → **component**
     (Vitest with a DOM);
   - a user path through the built Wrapper (win, loss, cash-out, offline,
     errors, two tabs, the sandbox) → **e2e** (Playwright, against the in-repo
     fake Play API);
   - a contract copy → the **hash check** against the lock file.
2. Unit tests: no real network, disk, timers, or clock; inject a clock and a
   random source; table-driven where it helps; one behavior per test.
3. Assert on typed errors (their `code` or class), never on message text.
4. Money: assert on strings or `bigint`, never on `number`.
5. Secrets: a test never prints or snapshots a key or token. The only keys in
   the repository are the public test keys of the vectors. Add a test that the
   thing you touched does not leak a credential into logs, errors, or storage
   when it handles one.
6. e2e: unique ids per run; no dependence on test order; no real wallet or
   third-party service.
7. Run the whole suite before pushing.

## Constraints

- Deterministic and hermetic; no secrets; no test imports another package's
  internals. The preview-stack e2e (backend-owned job, never part of
  `pnpm check`) is the one non-hermetic suite; do not add tests to it here.
- Never weaken a vector assertion or skip a test to go green — fix the code, or
  change the spec through the development flow. A released vector file is never
  edited; add a new version.

## Useful commands

```sh
pnpm test                  # unit and component (wireit skips what did not change)
pnpm test:e2e              # Playwright against the fake Play API
pnpm check                 # everything the CI runs
```

A test that reads files outside its own package (a vector, the schema) must
have those files in its wireit `files`, or depend on the task that produces
them; otherwise a cached pass could hide a failure. `tools/wireit-inputs.test.ts`
checks the `files` of every script against the files on disk; it runs in
`test:tools`, whose `files` cover every workspace tree so that a new file
re-runs it. A root `tools/` test that reads a file outside them adds that file
to `test:tools` `files`.

## Expected output

Tests at the right level that fail without the change and pass with it.

## References

- [.ai/memories/testing.md](../../memories/testing.md),
  [.ai/memories/conventions.md](../../memories/conventions.md)
