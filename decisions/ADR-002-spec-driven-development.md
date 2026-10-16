# ADR-002 — Spec-Driven Development and an agent-agnostic knowledge layer

- Status: accepted. Amended by
  [ADR-003](./ADR-003-agent-workflow-and-approvals.md) (workflow and adapters).
- Date: 2026-10-16 (proposed 2026-10-15)

## Context

Humans and several AI coding tools (OpenCode, Claude Code, Codex) work on this
repository. Knowledge scattered across tool-specific files drifts. The code here
holds the player's key and signs actions that move real money, so a change that
silently alters behavior, or that leaks a secret, erodes trust in everything
built on it. The repository is also public: its documents are read by players,
operators, and auditors, so they must stand on their own.

## Decision

- **Specs are the source of truth** for behavior and contracts (`specs/`).
  Implementation follows the specs, and a behavior change updates its spec in
  the same pull request.
- The development flow — rough PRD → spec/RFC → ADR → implementation → drift
  sync → review — is canonical in `CONTRIBUTING.md#development-flow`.
- **Mandatory actions** on every non-trivial change (listed in `AGENTS.md`):
  Spec Drift Synchronization; update memories; update specs/RFCs and record
  ADRs; sync runbooks; document anything the code logs or emits, and what it may
  never contain.
- **Knowledge placement:** `specs/`, `decisions/`, `rfcs/`, `runbook/` are human
  knowledge that stands alone; `.ai/` (memories, skills, agents, templates)
  references it without duplicating. Precedence: developer instructions > code
  > specs > decisions > runbook > memories > working memories > assumptions.
- **Agent-agnostic:** `AGENTS.md` is the only instruction source. Tool adapters
  are pointers only: `CLAUDE.md` (`@AGENTS.md`) and the symlinks
  `.opencode/skills`, `.claude/skills`, `.agents/skills` → `.ai/skills`.
- **Public by default:** everything in `specs/`, `decisions/`, `rfcs/`,
  `runbook/`, and `.ai/` is published. None of it holds secrets, internal
  hostnames, personal data, or private-repository internals. Contracts owned by
  another repository are referred to by name and copied as documents under a
  lock file, never linked to private sources.

## Alternatives considered

- **Code as the only documentation** — cheap, but contracts (signature encoding,
  error semantics, what may be logged) are invisible until broken.
- **Tool-specific instruction files** (one per AI tool) — duplicated and
  divergent content.
- **Wiki outside the repo** — drifts from code; not reviewed with changes; not
  publicly auditable alongside the code.

## Consequences / tradeoffs

- More documentation work per PR; reviewers must block on drift.
- Any tool that reads `AGENTS.md` or the open skills layout works without
  changes; removing all AI tooling leaves the human knowledge intact.
- Windows contributors need symlink support (documented in the README).
- A public knowledge layer must be reviewed for leaks like code is.

## References

- `AGENTS.md`, `.ai/README.md`, `CONTRIBUTING.md`
