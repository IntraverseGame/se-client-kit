# AGENTS.md

`se-client-kit` is the public TypeScript monorepo for everything the player's
browser runs in SuperEngine, a trustless real-money game engine: the Wrapper
(whose headless `shell` package holds the player's key and signs every action)
and the libraries it is built from. See [README.md](./README.md).

AI knowledge layer: [.ai/README.md](./.ai/README.md).

**This repository is public.** Everything committed here, including issues, pull
requests, and agent output, is world-readable. See
[Public repository](#public-repository).

## Approvals — never stage or commit on your own

**Do not run `git add`, `git commit`, or `git push` without approvals.** A
change is eligible to be staged and committed only after:

1. a **human** has reviewed and approved it, and then
2. the **reviewer agent** ([`.ai/agents/reviewer.md`](./.ai/agents/reviewer.md))
   has approved it.

Even then, stage and commit only when a human asks, and open a pull request
(`gh pr create`) only after a human confirms it. An approval covers the reviewed
diff only; any further edit needs review again (ADR-003).

Merging into `main` is a separate control: `.github/CODEOWNERS` names the two
org owners, and the `main` ruleset requires a pull request with a code owner's
approval and every review thread resolved, dismisses stale approvals on a push,
and blocks force-pushes and deletion. It sets no extra approval count and no
required status check, and organization admins may bypass it. It does not
replace the two approvals above.

## Parallel work — worktrees

Several agents and people work in this clone at the same time.

- **Look first.** Before starting, run `git worktree list`. If a worktree
  already holds your task's branch, continue there. Changes you did not make
  belong to someone else: leave them and ask.
- **One task, one branch, one worktree**, beside the clone:
  `git worktree add -b <type>/<slug> ../se-client-kit-worktrees/<type>-<slug> origin/main`.
  Work only there; the main checkout stays on `main`. Never edit, reset, or
  clean another worktree.
- **Clean up only when a human asks** (worktree and branch), after the task is
  merged or abandoned. Never delete a branch that has unmerged work on your own.

Procedure:
[`runbook/development/parallel-work.md`](./runbook/development/parallel-work.md).

## Agent workflow

Role agents live in [`.ai/agents/`](./.ai/agents/); how to invoke them per tool:
[`CONTRIBUTING.md`](./CONTRIBUTING.md#using-the-role-agents).

1. **documenter** — PRD → spec/RFC/ADR when behavior is new or changes.
2. **implementer** — code + tests to the spec; `pnpm check`; then **stops**.
3. **Human review** of the diff.
4. **reviewer** — package-boundary, spec, security, and definition-of-done gate
   on the approved diff.
5. Stage/commit — only on a human's request after steps 3 and 4.

On the pull request, on request: **pr-shepherd** — reviews, follows up, and
answers review comments on GitHub under the person's `gh` account. It drafts
first, posts (review, comment, reply, thread resolution) only after a human has
confirmed the exact text, and never submits an approval (ADR-003). Its fixes go
through steps 3 to 5.

## Asking the human

When you are blocked on an open question, a decision still to make, or a gap in
a spec: **ask, do not guess.** Ask through your host's structured-question tool
(Claude Code: `AskUserQuestion`), with concrete options and a recommended one
when a spec, ADR, or the code favors it. With no such tool, or as a subagent
that cannot prompt, put the same questions in chat or in your final report and
stop at the blocker. An answer is not an approval: it never replaces the gates
above. Procedure:
[`.ai/skills/ask-the-human`](./.ai/skills/ask-the-human/SKILL.md).

## Commands

The toolchain is pnpm workspaces, TypeScript, Vite, Vitest, Playwright, oxlint,
oxfmt, stylelint (CSS), tsdown (the packages' `dist/`), tsx (the `tools/`
scripts), changesets (with the GitHub changelog generator), and wireit for task
orchestration and caching (ADR-001). Use these scripts and never an ad-hoc
equivalent; Node and pnpm are pinned in `.node-version` and `packageManager`.

- `pnpm install --frozen-lockfile` · `pnpm check` (format check, lint,
  typecheck, unit tests, the dependency allow-list, the contracts check, then a
  build, the build-output check, and the Wrapper's size budget)
- `pnpm test` (unit and component) · `pnpm test:e2e` (Playwright, against the
  in-repo fake Play API) · `pnpm test:e2e:preview` (the `preview` project
  against a real stack, for the backend's job; needs the variables of
  [`runbook/preview-e2e.md`](./runbook/preview-e2e.md); never part of
  `pnpm check`)
- `pnpm lint` (oxlint and stylelint; also `pnpm lint:ts` and `pnpm lint:css`) ·
  `pnpm format` (writes) · `pnpm format:check` · `pnpm typecheck` · `pnpm build`
  (tsdown for packages, Vite for the Wrapper and the reference game) ·
  `pnpm check:build-output` (inspect every `dist/`) · `pnpm check:size-budget`
  (the Wrapper's release output within its size budget)
- `pnpm check:deps` (every `package.json` dependency is on the ADR-001
  allow-list) · `pnpm check:readmes` (every package and app README follows the
  public-README rules) · `pnpm check:contracts` (only tests import the
  `contracts` test-only entry) · `pnpm changeset` (add release notes) ·
  `pnpm release:dry-run` (the release dry run: changesets on a scratch copy, the
  five tarballs packed and checked, the Wrapper artifact built twice with one
  digest; publishes nothing; not part of `pnpm check`) · `pnpm clean:cache`
  (forget cached task results)

The scripts are wireit scripts: each declares its inputs and outputs, and a
script whose inputs did not change is skipped from the cache in `.wireit/`.
`pnpm clean:cache && pnpm check` runs everything. See
[CONTRIBUTING.md](./CONTRIBUTING.md#prerequisites-and-quickstart).

## Architecture rules

Enforced by lint import-direction rules (`.oxlintrc.json`, proven by
`tools/import-direction.test.ts`) and CI, and by review.

- **Packages** live under `packages/`, apps under `apps/`. Dependency direction
  is one way: `contracts` (data only, no logic) is a leaf; `snapshot` and
  `play-client` depend on it; `signing` has no kit dependency at run time and
  reads vectors from `contracts` in tests only; `shell` depends on `signing`,
  `snapshot`, and `play-client`; the `wrapper` app depends on `shell`;
  `reference-game` depends on nothing but the controller protocol's types; the
  `verify` app depends on `signing` (and may take `snapshot`, `play-client`, and
  `contracts`' runtime entry), never on `shell`; the `pages-proxy` app (the
  Pages sites' API proxy) imports nothing. No cycles; a package never imports an
  app. `contracts` has a runtime entry (schemas and generated types) and a
  test-only entry (vectors): only tests may import the test-only entry (the
  consumers are the tests of `signing`, `snapshot`, and `shell`, the Wrapper's
  component tests, the verify page's unit tests, and the e2e fake Play API; all
  development dependencies), and no vector may reach a bundle or a published
  tarball. A new package must pass the checks in
  [`add-a-package`](./.ai/skills/add-a-package/SKILL.md).
- **The shell is the only code that touches a credential** (the action key and
  the play token). The UI receives use cases and read-only state, never a
  secret.
- **A Snapshot is untrusted until validated.** `play-client` returns it as
  `unknown`; only the `snapshot` validator turns it into a typed value.
- Strict TypeScript (`strict`, no implicit `any`); no `any` and no `@ts-ignore`
  / `@ts-expect-error` without a reason on the same line.
- Prefer `type` over `interface`: `interface` only when a class `implements` it,
  or for declaration merging (global or module augmentation), with a
  lint-disable comment that names the rule and gives the reason on the same
  line; extension is an intersection (`type B = A & { ... }`).
- Prefer arrow functions over `function`, exported ones included: write
  `export const f = (a: number): number => { ... };`, not
  `export function f(a: number): number { ... }`. `function` stays only where an
  arrow cannot do the job: a generator (written as
  `const g = function* (): Generator<T> { ... }`), a function that needs its own
  `this` or `arguments`, and overloads. oxlint (`func-style`,
  `prefer-arrow-callback`) enforces it; a reason goes on any disable comment.
- Named exports only in libraries; no default exports (ADR-001).
- `index.ts` is only a package's or an app's entry point (`src/index.ts`) and
  holds only re-exports (`export { ... } from "...";`): no import, declaration,
  or logic. Internal directories have no `index.ts`; name the module after what
  it holds. `tools/index-files.test.ts` enforces it.
- Imports of another package go through its public entry point (`package.json`
  `exports`), never its internals (ADR-001).
- Public packages are tree-shakeable ESM with no import-time side effects
  (ADR-001).
- Standard platform APIs first (`fetch`, Web Crypto where it fits, Web Locks).
- Never edit generated files (typed clients, generated types); regenerate.

## Non-Negotiables

**Code**

- **Secrets stay in memory.** Never log, serialize, or persist the action key,
  the play token, or anything derived from them beyond the session. The
  redacting types and logger of the shell are the only way to log near them. No
  secrets, keys, tokens, or connection strings in code, tests, fixtures, issues,
  or comments. The public development keys the vectors were signed with are
  public by design and are the only exception: they may appear only in
  `packages/signing/src/fixtures/keys.ts` and in the vendored `signed-action/`
  vectors in `packages/contracts` (`src/vectors/snapshot/signed-action/`), which
  embed the same public test key (anvil account 3, test-only, never funded) and
  cannot be edited. The e2e suite may pass the signed-action vector's test key
  to its seeded random stub, read from `contracts`' test-only entry at run time,
  and never copies it into a file.
- **Money amounts are strings or `bigint`, never JS `number`**, at every
  boundary and in every type. Arithmetic on amounts uses `bigint` in base units.
  A decimal value (a rate, a fee) is never a ledger amount; converting one to
  base units uses an explicit, specified rounding mode.
- **No new runtime dependency without an ADR.** The runtime dependencies of
  published packages are an allow-list kept in the kit's ADRs; a new development
  tool needs a recorded decision too. Dependency lifecycle scripts are off by
  default; only an explicit allow-list may run one.
- **Contracts are documents, never code.** The Play API document, the Snapshot
  schema and vectors, the signing vectors, and the public vector bundle of the
  SuperEngine fairness kernel, kernelVersion 1 (its sets `kernel/public/v1/*`)
  are copied into the `contracts` package, not imported from another repository.
  Each copy is pinned in a lock file with its source commit and a content hash.
  No git submodules.
- **Vectors are append-only.** A released version's vector files are never
  edited; a vendored vector file records the source commit it came from.
- Never write to `localStorage`, cookies, or any persistent storage from the
  Wrapper unless a spec says so (a key never persists past the session).
- Never edit generated files; regenerate.

**Tests and specs**

- New behavior needs tests; tests are deterministic and hermetic (no real
  network, no real clock, no secrets). Inject time and randomness. The one
  exception is the preview-stack end-to-end run (T-10 to T-12), which is owned
  by the backend repository's job and is never part of `pnpm check`.
- Spec-Driven Development: implement to `specs/`; update the spec in the same
  change.
- Never weaken a test, a vector assertion, or a lint rule to go green.

**Process**

- The mandatory actions below run in every non-trivial PR.
- No staging or committing without human + reviewer-agent approval (above).
- One logical change per PR; no secrets; no new dependency without an ADR.

## Public repository

The kit is public so that anyone can read exactly what holds the player's key.
What is published cannot be taken back once cloned, forked, or cached. Never
add, in any file, commit, issue, pull request, log, or agent output:

- credentials, tokens, private keys (other than the public development keys the
  vectors were signed with, in `packages/signing/src/fixtures/keys.ts` and in
  the vendored `signed-action/` vectors of `packages/contracts`, which embed the
  same public test key and cannot be edited; the e2e suite may pass that test
  key to its seeded random stub, read from `contracts`' test-only entry at run
  time, and never copies it into a file), connection strings, npm or deploy
  credentials;
- internal hostnames or URLs, dashboard links, cloud account or resource
  identifiers;
- unpublished backend internals: only the player-facing contracts (the Play API
  document at `/play/v1`, the Snapshot schema bundle, the signed-action
  specification, the signing vectors, and the public vector bundle of the
  SuperEngine fairness kernel, kernelVersion 1, its sets `kernel/public/v1/*`)
  are shared, and only as copies;
- personal data, or the names, emails, or handles of people unless they are
  already public as maintainers or authors;
- unreleased security findings (use [SECURITY.md](./SECURITY.md)).

When unsure, leave it out and ask. Every file copied from a private source is
reviewed before it is merged. Reference backend-owned contracts by name only.

## Spec-Driven Development (mandatory)

Specs in `specs/` are the source of truth for behavior and contracts.
Implementation must follow the specs, and specs must be updated in the same
change when behavior changes. The process (rough PRD → spec/RFC → ADR →
implementation → drift sync → review) is canonical in
[`CONTRIBUTING.md`](./CONTRIBUTING.md#development-flow). Mandatory actions for
every non-trivial change:

1. **Spec Drift Synchronization** — reconcile code ↔ specs before merge (skill:
   `.ai/skills/spec-drift-sync`).
2. **Create/Update memories** in `.ai/memories/` when architecture, conventions,
   testing, or operations change; resolve `.ai/memories/working/` entries tied
   to the branch (promote durable parts, delete the file).
3. **Create/Update specs/RFCs** — new behavior updates a spec; proposals go to
   `rfcs/active/`; accepted decisions become ADRs in `decisions/`.
4. **Create/Update and sync runbooks** in `runbook/`.
5. **Telemetry docs, where applicable** — the Wrapper emits no telemetry unless
   a spec says so; anything that emits logs, metrics, or events is documented in
   its spec, with what is and is not allowed in them (never a secret).

## Knowledge maintenance

| If you change...                            | Review...                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| a new feature / PRD                         | `CONTRIBUTING.md` flow, `specs/`, `rfcs/`, `decisions/`                                                  |
| package structure or dependency direction   | `.ai/memories/architecture.md`, the packages' spec, lint import rules                                    |
| a package's public API                      | its spec, its tests, changesets, `.ai/memories/architecture.md`                                          |
| a contract copy (the `contracts` package)   | the lock file, vectors and tests that use it, the spec that names it                                     |
| signing or key handling                     | the signing spec, vectors, `.ai/memories/conventions.md`, `SECURITY.md` if the reporting surface changes |
| tests / test tooling                        | `.ai/memories/testing.md`, the testing section of the kit spec                                           |
| build, CI, release, or supply-chain tooling | `runbook/`, `.github/`, `.ai/memories/development-workflow.md`, a new ADR if a dependency changes        |
| telemetry or logging                        | its spec; confirm nothing secret can reach a log                                                         |
| agent workflow or adapters                  | `AGENTS.md`, `CONTRIBUTING.md#using-the-role-agents`, `.ai/README.md`, ADR-003                           |

## Precedence and secrets

Explicit developer instructions > code/config > specs > decisions > runbook >
memories > working memories > assumptions. Trust the higher source, fix or flag
the lower one. An unaccepted RFC never overrides accepted knowledge. Never write
credentials, tokens, keys, connection strings, internal hostnames, or dashboard
links; use `<!-- TODO -->` markers.
