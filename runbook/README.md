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
- [`client-kit-release.md`](./client-kit-release.md) — releasing the packages
  and the Wrapper bundle.
- Planned: the response to a compromised dependency or publishing credential.
