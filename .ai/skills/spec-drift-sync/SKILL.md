---
name: spec-drift-sync
description: Use before merging any non-trivial change. Reconciles code with specs, and code/specs with memories, runbooks, and telemetry docs (Spec Drift Synchronization).
---

# spec-drift-sync

## Prerequisites

- The branch diff (`git diff main...HEAD`).

## Workflow

1. List what changed in behavior or contracts: a package's public API, signing
   or key-handling behavior, the Snapshot or Play client handling, error
   types, contract copies, what the Wrapper emits, build or release tooling.
2. For each, find its canonical doc (see the table in
   [AGENTS.md#knowledge-maintenance](../../../AGENTS.md#knowledge-maintenance))
   and compare:
   - code changed behavior → update the spec;
   - spec changed → the code must implement it (or the spec change is reverted);
   - contract changed → vectors and tests updated.
3. Contract copies: every file in the `contracts` package matches its entry in the lock
   file (source commit and hash); generated types match a fresh regeneration;
   released vector files are untouched; the package holds no logic and only
   tests import its test-only entry.
4. Public API: exported names, `package.json` `exports`, the changeset, and the
   package's `README.md` (public documentation: role, status, entry points,
   guarantees, and no contributor material) agree with the spec.
5. Security: nothing in the diff logs, stores, or exposes a key or token; the
   spec's statement of what may never be logged still holds.
6. Telemetry: anything that logs, emits metrics, or sends events is described in
   its spec, with what it may never contain.
7. Memories: update `last-verified` on memories you re-checked; fix stale ones.
8. Resolve working memories linked to the branch.
9. Added or resolved a `TODO` marker → check it is still accurate
   (`git grep -n "TODO"`).
10. Added, renamed, moved, or split a spec section → the table of contents in
    [`specs/README.md`](../../../specs/README.md#table-of-contents) matches the
    headings, a long contract section lives in its own file as the
    conventions there say, and no "above" or "below" points across files.
11. Report what was synchronized, or state "no drift" with the evidence.

## Constraints

- Follow the precedence order; if code and spec disagree and the intended
  behavior is unclear, ask the human with
  [ask-the-human](../ask-the-human/SKILL.md) (options: fix the code, fix the
  spec, or open an RFC) — do not guess.

## Useful commands

```sh
git diff --stat main...HEAD
git grep -n "TODO"
pnpm check
```

## Expected output

A drift report plus the doc/code changes in the same PR.

## References

- [ADR-002](../../../decisions/ADR-002-spec-driven-development.md),
  [reviewer agent](../../agents/reviewer.md)
