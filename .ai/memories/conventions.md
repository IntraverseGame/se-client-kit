---
description: TypeScript, error, money, secret, logging, and naming conventions. Read before writing code.
last-verified: 2026-10-15 (commit 8630f95, bootstrap; conventions are proposals until the toolchain and specs land)
---

# Conventions

Binding rules: [AGENTS.md#non-negotiables](../../AGENTS.md#non-negotiables).
This note records the patterns behind them. Items marked _proposal_ are recorded
in ADR-001 as proposed and are not settled until it is accepted.

- **Strict TypeScript.** `strict` on, no `any`, no unexplained
  `@ts-ignore` / `@ts-expect-error` (put the reason on the same line). Prefer
  `unknown` at trust boundaries and narrow it with a validator.
- **Exports** _(ADR-001, proposed)_: named exports only in libraries; a single public
  entry point per package; no import-time side effects.
- **Money:** amounts are decimal **strings** on the wire and `bigint` in code,
  in base units. Never `number`, never floating point. A decimal value (rate,
  fee) is never a ledger amount; converting one to base units uses an explicit,
  specified rounding mode. Parse amounts in one place per package.
- **Secrets:** the action key and play token live in the shell's memory for the
  session only. They are wrapped in redacting types (a `toString` / `toJSON` that
  prints a placeholder) and are never logged, serialized, put in a URL, written
  to `localStorage`, `sessionStorage`, cookies, or IndexedDB, or placed in an
  error message. The public test keys of the vectors are the only keys that may
  appear in the repository.
- **Errors:** typed errors with a stable `code`; callers branch on `code`, never
  on message text. Do not leak internals or secrets in messages. Errors from the
  backend are mapped from its published error codes.
- **Logging:** through one logger interface that redacts; the Wrapper emits no
  telemetry unless a spec says so. No `console.*` in library code.
- **Time and randomness:** injected (a clock, a random source), so tests are
  deterministic. Cryptographic randomness comes from the platform.
- **Determinism:** signing is deterministic (RFC 6979); the same input gives the
  same bytes.
- **Naming:** lowercase package names that name the concern (`signing`,
  `snapshot`); no `util`, `common`, or `helpers` packages. Files are named for
  what they hold, one concern per file.
- **Dependencies:** a runtime dependency needs an ADR; development tools need a
  recorded decision; lifecycle scripts are off by default; versions are pinned
  by the lockfile and the `packageManager` field.
- **Generated files** (typed clients, generated types) are never edited by hand;
  regenerate and commit the output. CI regenerates and fails on a diff.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/),
  one logical change per PR.
- **Public repository:** commits, issues, and logs are world-readable. No
  secrets, internal hostnames, account identifiers, or personal data.
