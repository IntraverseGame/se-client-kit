# Runbook

How to develop, release, and operate the kit: procedures a human can follow with
no AI tooling. Each file follows
[the runbook template](../.ai/templates/runbook.md): when to use, prerequisites,
steps, verification, troubleshooting, escalation, references.

## Conventions

- Procedures, not contracts: behavior belongs in [`specs/`](../specs/).
- Commands are real and tested; unknowns are `<!-- TODO -->` markers.
- Public: never a credential, token, key, internal hostname, dashboard link, or
  account identifier. Name the secret and where it lives, never its value.

## Index

- [`development/parallel-work.md`](./development/parallel-work.md) — worktrees:
  one task, one branch, one worktree.
- [`development/ci-failures.md`](./development/ci-failures.md) — a CI job cannot
  find a kit package's `dist/` (a wireit cache restore that failed, #53).
- [`client-kit-release.md`](./client-kit-release.md) — releasing the packages
  and the Wrapper bundle.
- [`preview-e2e.md`](./preview-e2e.md) — running the e2e suite's preview mode
  against a stack: the variables, the launch hook, the pin and bump recipe, and
  troubleshooting (the backend's job runs it; never part of `pnpm check`).
- Planned: the response to a compromised dependency or publishing credential.
