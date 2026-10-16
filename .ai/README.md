# .ai — agent knowledge layer

Map of the AI-oriented layer. It **consumes and references** the root-level
project knowledge (`specs/`, `decisions/`, `rfcs/`, `runbook/`,
`CONTRIBUTING.md`) and never duplicates it. If all AI tooling were removed,
those root-level sources would still stand on their own.

Entry point for agents: [`AGENTS.md`](../AGENTS.md). Tool adapters (`CLAUDE.md`,
`.opencode/skills`, `.claude/skills`, `.agents/skills`, `.claude/agents`,
`.opencode/agents`) are pointers into this layer and must never contain content.

**Approval gate:** no agent stages, commits, or pushes on its own. A change is
eligible only after a human approves it and then the reviewer agent approves it
(ADR-003). The pr-shepherd posts to a pull request only after a human confirms
the exact text. Workflow and per-tool invocation:
[CONTRIBUTING.md#using-the-role-agents](../CONTRIBUTING.md#using-the-role-agents).

**Questions:** an agent blocked on an open question or a decision asks the human
rather than guessing: [AGENTS.md](../AGENTS.md#asking-the-human), procedure in
[`ask-the-human`](./skills/ask-the-human/SKILL.md).

**Public repository:** everything here is world-readable. No secrets, internal
hostnames, dashboard links, personal data, or private-repository internals, in
memories included.

## Placement rules

| Location                | Holds                                               | Test question                                                        |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `specs/`                | current behavior, contracts, invariants             | Is this what the system is supposed to do?                           |
| `decisions/`            | accepted decisions and rationale (ADRs)             | Does it document _why_?                                              |
| `rfcs/`                 | proposals (`active/`) and closed ones (`archived/`) | Is it proposed, not accepted?                                        |
| `runbook/`              | how to develop, release, operate, troubleshoot      | Would a human need it with no AI tooling?                            |
| `.ai/memories/`         | durable context that helps an agent orient          | Does it help an agent decide, without being a contract or procedure? |
| `.ai/memories/working/` | unresolved / in-flight context                      | Is it still active or unresolved?                                    |
| `.ai/skills/`           | how to perform a reusable class of task             | Is it a repeatable workflow?                                         |
| `.ai/agents/`           | role-specific behavior and boundaries               | Does it apply to one role only?                                      |
| `.ai/templates/`        | templates for maintaining this layer                | —                                                                    |

**Precedence** when sources disagree: explicit developer instructions >
code/config > specs > decisions > runbook > memories > working memories > agent
assumptions. Fix or flag the lower source and mention it in your report.

**Rules:** single source of truth — link, don't copy; memories describe the
present, not history; no secrets, internal hostnames, or dashboard links.

## Index

Load only what the task needs.

### Memories (`memories/`)

- [`overview.md`](./memories/overview.md) — what the kit is, the package map,
  the backend boundary. Read first.
- [`architecture.md`](./memories/architecture.md) — dependency direction, key
  custody, how contracts and vectors flow. Before changing structure.
- [`conventions.md`](./memories/conventions.md) — TypeScript, errors, money,
  secrets, logging. Before writing code.
- [`testing.md`](./memories/testing.md) — test levels and how to add one. Before
  writing tests.
- [`development-workflow.md`](./memories/development-workflow.md) — worktrees,
  approvals, scripts, PRs. Before starting work or opening a PR.
- [`working/README.md`](./memories/working/README.md) — lifecycle rules for
  in-flight memories.

### Skills (`skills/`)

- [`add-a-package`](./skills/add-a-package/SKILL.md) — add a package under
  `packages/` (or an app under `apps/`).
- [`write-tests`](./skills/write-tests/SKILL.md) — unit, vector replay,
  component, e2e.
- [`prd-to-spec`](./skills/prd-to-spec/SKILL.md) — turn a rough PRD into a spec,
  RFC, or ADR.
- [`spec-drift-sync`](./skills/spec-drift-sync/SKILL.md) — reconcile code and
  specs before merge.
- [`shepherd-a-pull-request`](./skills/shepherd-a-pull-request/SKILL.md) —
  review, follow up on, or answer a pull request on GitHub with `gh`.
- [`ask-the-human`](./skills/ask-the-human/SKILL.md) — raise an open question or
  decision to the human with options and a recommendation.

### Agents (`agents/`)

Order: documenter → implementer → **human review** → reviewer → commit (on
request). On the pull request, on request: pr-shepherd.

- [`documenter.md`](./agents/documenter.md) — PRD → specs/RFCs/ADRs; keeps
  knowledge in sync.
- [`implementer.md`](./agents/implementer.md) — staff-level TypeScript engineer;
  code + tests; stops for human review.
- [`reviewer.md`](./agents/reviewer.md) — package boundaries, specs,
  key-handling security; the final gate after human approval.
- [`pr-shepherd.md`](./agents/pr-shepherd.md) — works a pull request on GitHub
  under the person's `gh` account; drafts, posts on confirmation, never
  approves.

### Templates (`templates/`)

[`memory.md`](./templates/memory.md),
[`working-memory.md`](./templates/working-memory.md),
[`skill.md`](./templates/skill.md), [`agent.md`](./templates/agent.md),
[`spec.md`](./templates/spec.md), [`adr.md`](./templates/adr.md),
[`rfc.md`](./templates/rfc.md), [`runbook.md`](./templates/runbook.md).
