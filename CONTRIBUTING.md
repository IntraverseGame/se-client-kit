# Contributing to se-client-kit

## Welcome and scope

This is the onboarding guide for `se-client-kit`, the public TypeScript monorepo
for everything the player's browser runs in SuperEngine. It is written for
engineers (and AI agents) who change this repository. It covers the development
flow, the role agents, branching and pull requests, and how knowledge is
organized.

- Product orientation: [`README.md`](./README.md).
- Binding rules for agents (and a good checklist for humans):
  [`AGENTS.md`](./AGENTS.md).

This guide links to canonical sources instead of repeating them. When the two
disagree, the linked source wins; please fix this file.

**This repository is public.** Everything you write here, including issues, pull
requests, and commit messages, is world-readable. Read
[Public repository](./AGENTS.md#public-repository) before your first change.

## Prerequisites and quickstart

You need the Node version in [`.node-version`](./.node-version) and pnpm at the
version of `packageManager` in [`package.json`](./package.json). pnpm (10 or
later) switches to the pinned version by itself; otherwise `corepack enable`
does. Dependency lifecycle scripts are off, and pnpm refuses a version published
less than seven days ago (`pnpm-workspace.yaml`).

```sh
pnpm install --frozen-lockfile   # install exactly what the lockfile says
pnpm check                       # format check, lint, typecheck, unit tests, allow-list, contracts check, build, build-output and package files checks
pnpm test                        # unit and component tests
pnpm test:e2e                    # Playwright, against the in-repo fake Play API
pnpm lint                        # oxlint (with the dependency-direction rules) and stylelint (CSS)
pnpm format                      # writes: oxfmt formats everything it supports
pnpm format:check                # the same, read-only
pnpm typecheck
pnpm build                       # packages: tsdown (bundled ESM with .js.map, and .d.ts); the apps: Vite
pnpm changeset                   # add release notes for a change to a published package
pnpm release:dry-run             # the release dry run: versions, tarballs, Wrapper digest; publishes nothing
```

**Tasks and the cache.** Every script above is a
[wireit](https://github.com/google/wireit) script: its `command`, input `files`,
`output`, and `dependencies` are declared in the `wireit` section of the
`package.json` that owns it, so `pnpm check` runs only what changed. Skipped
tasks are restored from the cache in `.wireit/` (not committed). In CI the cache
is the GitHub Actions cache; there is no remote cache and no secret.
`node_modules` and `.wireit` are per worktree (run
`pnpm install --frozen-lockfile` once in each). `pnpm clean:cache` forgets every
cached result (also if you suspect a stale entry). When you add a file a script
reads, add it to that script's `files`; a task that reads another package's
output depends on that package's task.

Every package under `packages/` and app under `apps/` has its own `README.md`,
and it is **public documentation**: npm renders it on the package page, so it is
written for a consumer who has never seen this repository (what it is, when to
use it, the install line, entry points, the guarantees that matter to a user),
says only what is true and tested today, and links only into this repository
with absolute `https://github.com/IntraverseGame/se-client-kit/blob/main/...`
URLs (any other host fails). Build, CI, lint, review, and agent material stays
out of it and lives here and in the specification. Update it in the same change
when the package's public API or role changes. `pnpm check` (its
`pnpm check:readmes` step) fails if one is missing, has a relative, external,
ignored, or broken link, or mentions a contributor-only term (the list is in
`tools/readme-rules.ts`).

**Working on a single package** (kept out of the package READMEs): from the
repository root, `pnpm --filter @intraverse/se-client-<name> build` builds its
`dist/` with tsdown, `... typecheck` runs `tsc --noEmit`, and `... test` runs
its Vitest tests (a package has a `test` script only once it has a real test).
`pnpm check` runs everything CI runs. The source layout of `contracts`, the
build-output check, and the Vite guard of the Wrapper are described in
[`specs/client-kit/the-contracts-package.md`](./specs/client-kit/the-contracts-package.md).

Playwright browsers are not installed by `pnpm install` (lifecycle scripts are
off). Run
`pnpm --filter @intraverse/se-client-e2e exec playwright install chromium` once
before `pnpm test:e2e`. Where Playwright's browser download is not available,
`SE_E2E_BROWSER_CHANNEL=chrome pnpm test:e2e` runs the suite on an installed
Chrome instead. That variable is for local development only: CI does not use it
and always runs Playwright's own Chromium.

To repeat the suite (to catch a flaky test), pass Playwright's flag through the
e2e workspace's own script:
`pnpm --filter @intraverse/se-client-e2e test -- --repeat-each=3`. Through the
root script it does not reach Playwright: `pnpm test:e2e --repeat-each=3` and
`pnpm test:e2e -- --repeat-each=3` both silently run the suite once.

## Repository at a glance

```text
packages/    contracts (data only), signing, snapshot, play-client, shell (empty skeletons)
apps/        wrapper (the UI) and the Coin Flip reference game            (first slices)
e2e/         Playwright suite and the fake Play API                       (harness; T-rows pending)
tools/       repository checks and their tests (allow-list, contracts entry, lint rules)
specs/       current behavior and contracts (source of truth)
decisions/   accepted decisions (ADRs)
rfcs/        proposals: active/, archived/
runbook/     how to develop, release, and operate
.ai/         agent knowledge layer (memories, skills, agents, templates)
.github/     PR template, issue templates, CODEOWNERS, dependabot
```

Dependency direction between packages is one way: `contracts` (data only) is a
leaf; `snapshot` and `play-client` depend on it; `signing` has no kit dependency
at run time; `shell` depends on `signing`, `snapshot`, and `play-client`; the
`wrapper` app depends on `shell`. See
[`.ai/memories/architecture.md`](./.ai/memories/architecture.md).

## Development flow

The canonical lifecycle for turning a rough product requirement into shipped,
verified code. `AGENTS.md`, `.ai/memories/`, and the role agents link here
rather than restating it.

A **rough PRD is an input, not a repo artifact.** It lives where the product
team keeps it. Distill it into this repository; never paste it in wholesale, and
never copy private material into this public repository.

```text
rough PRD / raw requirement          external: issue tracker / product docs
        │  frame problem, scope, non-goals, acceptance criteria
        ▼
  SPEC   specs/<contract>.md          accepted contract = source of truth
        │
        │  significant, cross-cutting, or contested?
        ├── yes ──▶ RFC  rfcs/active/RFC-NNN-<slug>.md
        │                 │ accepted: fold into a spec (+ ADR), move to rfcs/archived/
        ▼                 ▼
  DECIDE  decisions/ADR-NNN-<slug>.md only for hard-to-reverse choices
        │
        ▼
  IMPLEMENT  code + tests (unit, vector replay, component, e2e)
        │
        ▼
  SYNCHRONIZE  drift-sync code ↔ specs; memories, runbooks, telemetry docs
        │
        ▼
  REVIEW  human review → reviewer agent gate; resolve working memories
        │
        ▼
  COMMIT & MERGE  only after both approvals, when a human asks
        │
        ▼
  OPERATE  runbook/; feedback becomes the next PRD
```

**Route.**

- Small, well-understood change → update the relevant spec, then implement.
- Significant, cross-cutting, or uncertain change → write an **RFC** first.
- A choice that is hard to reverse (new dependency, package structure, protocol,
  supply-chain tooling) → record an **ADR**.
- Accepted RFCs never stay canonical: their durable content moves into `specs/`
  and `decisions/`, and the RFC is archived.

**Stages and where their artifacts live.**

| Stage       | Artifact                                          | Home                                    |
| ----------- | ------------------------------------------------- | --------------------------------------- |
| Frame       | rough PRD                                         | external (issue tracker / product docs) |
| Specify     | spec                                              | `specs/`                                |
| Propose     | RFC (when needed)                                 | `rfcs/active/` → `rfcs/archived/`       |
| Decide      | ADR (when needed)                                 | `decisions/`                            |
| Implement   | code + tests                                      | `packages/**`, `apps/**`, `e2e/**`      |
| Synchronize | updated specs, memories, runbooks, telemetry docs | `specs/`, `.ai/memories/`, `runbook/`   |
| Review      | pull request                                      | GitHub                                  |
| Operate     | procedures                                        | `runbook/`                              |

**Gates.**

- _Definition of ready_ (before implementation): the problem is framed; the spec
  is agreed or the RFC accepted; acceptance criteria are written down, including
  anything the component logs or emits.
- _Definition of done_ (before merge): code matches the spec (Spec Drift
  Synchronization); tests pass, including vector replay; memories and runbooks
  are updated; no secrets, and no key or token can reach a log, URL, or storage;
  a human approved and then the reviewer agent approved.

**Roles.**

| Role                                               | Responsibility                                                 |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Product / PRD author                               | Owns the rough PRD and acceptance criteria.                    |
| [`documenter`](./.ai/agents/documenter.md) agent   | PRD → specs, RFCs, ADRs; keeps knowledge in sync.              |
| [`implementer`](./.ai/agents/implementer.md) agent | Code and tests written to the spec.                            |
| [`reviewer`](./.ai/agents/reviewer.md) agent       | The gate: package boundaries, spec drift, tests, key handling. |
| [`pr-shepherd`](./.ai/agents/pr-shepherd.md) agent | Pull request reviews, follow-ups, and replies on GitHub.       |

Humans can play any role; the agent definitions describe the expected behavior.

### Using the role agents

The agents are defined once in [`.ai/agents/`](./.ai/agents/) and exposed to
each tool through pointer-only adapters (ADR-003):

| Tool           | Where it finds the agents         | How to invoke                                                      |
| -------------- | --------------------------------- | ------------------------------------------------------------------ |
| Claude Code    | `.claude/agents` → `.ai/agents`   | Ask for it by name ("use the reviewer agent") or `@agent-reviewer` |
| OpenCode       | `.opencode/agents` → `.ai/agents` | `@reviewer` (or switch to the agent)                               |
| Codex / others | — (no agent folder)               | "Act as the reviewer defined in `.ai/agents/reviewer.md`"          |

Skills are found through `.claude/skills`, `.opencode/skills`, and
`.agents/skills`, all pointing to `.ai/skills`.

A typical change:

1. **documenter** — frame the PRD, update the spec (or open an RFC/ADR). A human
   agrees the spec (definition of ready).
2. **implementer** — implement to the spec with tests; `pnpm check` green; stop
   and hand the diff to a human.
3. **Human review** — approve or request changes.
4. **reviewer** — run on the human-approved diff; approve or request changes
   (changes go back to step 2).
5. **Stage and commit** — only after steps 3 and 4 approve, and only when a
   human asks. **No agent stages or commits on its own**, and none opens a pull
   request (`gh pr create`) before a human confirms it.

Once the change is a pull request, the **pr-shepherd** works the conversation on
GitHub when asked: it reviews another person's pull request with inline comments
and follows up after new pushes, or answers the review comments on your own. It
posts under the account your `gh` CLI is logged in as, only after you confirm
the exact draft, and it never approves. A fix it makes for a review comment goes
through steps 3 to 5 again. Its review is not the step 4 gate.

**Where knowledge lives.**

| Artifact  | Home                                    | Answers                                         |
| --------- | --------------------------------------- | ----------------------------------------------- |
| rough PRD | external (issue tracker / product docs) | What does the product want?                     |
| spec      | `specs/`                                | What must the system do?                        |
| RFC       | `rfcs/active/`                          | What are we proposing, and why?                 |
| ADR       | `decisions/`                            | Why did we choose this (as a lasting decision)? |
| tests     | beside the code, and `e2e/`             | Does the behavior hold?                         |
| runbook   | `runbook/`                              | How do we develop, release, and operate it?     |
| memory    | `.ai/memories/`                         | How does an agent orient quickly?               |

### Asking the human

At any step of the flow, an agent that hits an open question, a remaining item
to decide, or a spec gap asks the human instead of guessing. The binding rule is
in [`AGENTS.md`](./AGENTS.md#asking-the-human) and the procedure in the
[ask-the-human](./.ai/skills/ask-the-human/SKILL.md) skill. An answer is not an
approval: it does not replace the human review, the reviewer agent, or a human's
request to commit.

## Branching, commits, and pull requests

**Parallel work.** Several people and agents work in one clone at the same time.
Each task has its own branch in its own git worktree beside the clone
(`git worktree add -b feat/<slug> ../se-client-kit-worktrees/feat-<slug> origin/main`);
the main checkout stays on `main`. Procedure:
[`runbook/development/parallel-work.md`](./runbook/development/parallel-work.md).

1. Branch from `main`, in a worktree of its own: `feat/<slug>`, `fix/<slug>`,
   `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(signing): recover the signer`, `fix(shell): clear the token on expiry`.
3. One logical change per PR. Keep generated code in its own commit where
   practical.
4. Run `pnpm check` before opening a PR; CI runs the same gates once it lands.
5. **Approval gate before staging/committing:** a human reviews and approves,
   then the reviewer agent approves. Agents never `git add`/`commit`/`push`
   without both approvals (see [Using the role agents](#using-the-role-agents)),
   and open a pull request (`gh pr create`) only after a human confirms it.
   **Interim control:** `.github/CODEOWNERS` stays comment-only until the org
   owners give their handles, so the control on `main` is branch protection: a
   pull request is required and nobody approves their own change.
6. Fill in the [PR template](./.github/PULL_REQUEST_TEMPLATE.md) and complete
   the **mandatory Spec-Driven Development actions** listed in
   [`AGENTS.md`](./AGENTS.md).
7. Reviews focus on the spec, the package boundaries, tests, and key handling.
   Address or explicitly answer every comment before merging.
8. Outside contributors: fork, branch, and open a pull request. Do not include
   secrets or private material; see [SECURITY.md](./SECURITY.md) to report a
   vulnerability instead of opening an issue.

## Code style

Formatting and lint are automated: **oxfmt** formats TypeScript, JSON, Markdown,
YAML, and HTML, and **oxlint** lints (`pnpm format`, `pnpm lint`; `pnpm check`
verifies both). Do not format by hand or with another tool. The lint
configuration (`.oxlintrc.json`) also enforces the package dependency direction,
the public-entry-point rule, and the code rules of `AGENTS.md` that a linter can
express (no `any`, no default exports in libraries, no side-effect imports, a
reason on every `@ts-expect-error`). Every such rule has a fixture case in
`tools/fixtures/` (`import-direction-cases.ts`, `lint-rule-cases.ts`, and
`style-rule-cases.ts`, merged by `tools/import-direction.test.ts`); add one with
a new rule. A lint-disable comment that suppresses nothing is itself an error.
**stylelint** (`stylelint.config.mjs`, explicit rules, no shared config) lints
CSS for correctness and the Wrapper's constraints: no unknown properties,
at-rules, or values, no duplicates, no `!important`, no `@import`, no remote
`url()` (the CSP and the SuperEngine origin), no vendor prefixes; it has no
stylistic rule, because oxfmt formats. The repository's own TypeScript scripts
in `tools/` run with `tsx` (`pnpm check:deps`, `pnpm check:contracts`). The
reason on a disable comment or a `@ts-expect-error` is enforced by review (the
human reviewer and the reviewer agent), not by a rule.

Conventions: [`.ai/memories/conventions.md`](./.ai/memories/conventions.md). In
short: strict TypeScript, no `any`, money as strings or `bigint`, secrets in
memory only, typed errors, injected time and randomness.

## Testing

Levels and rules: [`.ai/memories/testing.md`](./.ai/memories/testing.md); the
authoritative testing sections are
[`specs/client-kit/testing-and-ci.md`](./specs/client-kit/testing-and-ci.md) and
[`specs/wrapper.md`](./specs/wrapper.md#test-plan). New behavior needs tests;
tests are deterministic and hermetic. The one exception is the preview-stack
end-to-end run (T-10 to T-12), which the backend repository's job owns and which
is never part of `pnpm check`.

## Generated code and contract copies

Never edit generated files; regenerate and commit the output. Contract files in
the `contracts` package are copies with a lock entry (source commit and hash);
they change only in a reviewed pull request that shows the diff. Vector files of
a released version are never edited.

## Knowledge architecture

| Location        | Holds                                                             | Update it when...                                 |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `specs/`        | Current behavior and contracts (source of truth)                  | behavior or a contract changes                    |
| `decisions/`    | Decisions (ADRs) and rationale; status shows accepted or proposed | you make a hard-to-reverse choice                 |
| `rfcs/`         | Proposals before acceptance                                       | a change is significant, cross-cutting, contested |
| `runbook/`      | How to develop, release, operate                                  | operations or developer workflow change           |
| `.ai/memories/` | Durable orientation for agents                                    | architecture, conventions, testing, ops change    |
| `.ai/skills/`   | Reusable agent workflows                                          | a repeatable task's procedure changes             |
| `.ai/agents/`   | Role definitions                                                  | a role's responsibilities change                  |
| `AGENTS.md`     | Binding rules for agents                                          | a non-negotiable changes                          |

The four role agents (AI role definitions, not people) live in
[`.ai/agents/`](./.ai/agents/): `implementer` (staff-level TypeScript engineer),
`reviewer` (the review gate), `documenter` (PRDs to specs, RFCs, and ADRs), and
`pr-shepherd` (pull requests on GitHub, posted only on confirmation).

If you change behavior, update the spec in the same change. If you change
operations, update the runbook. If you make a non-obvious choice, add an ADR.

## Non-Negotiables

See [`AGENTS.md`](./AGENTS.md#non-negotiables) — the list is kept there only.

## Getting help

- File bugs and proposals as GitHub issues in this repository; significant
  proposals become RFCs in `rfcs/active/`.
- Security issues: see [`SECURITY.md`](./SECURITY.md).
