# Decisions (ADRs)

Decisions and their rationale (each ADR's status shows whether it is accepted or
proposed), for choices that are hard to reverse: a
new dependency, the package structure, a protocol, supply-chain tooling, the
agent workflow.

## Conventions

- File name `ADR-NNN-<slug>.md`, numbered in order, from
  [the ADR template](../.ai/templates/adr.md). Status is `proposed` until a
  maintainer accepts it, then `accepted`.
- An ADR is never rewritten. A later decision supersedes it with a new ADR and
  both link each other.
- A disagreement with an accepted ADR goes to an RFC, not a review exception.
- Public: no secrets, internal hostnames, or personal data.

## Index

| ADR                                                  | Status   | Decision                                                 |
| ---------------------------------------------------- | -------- | -------------------------------------------------------- |
| [ADR-001](./ADR-001-toolchain-and-signing.md)        | accepted | toolchain; hand-written EIP-712 over `@noble`            |
| [ADR-002](./ADR-002-spec-driven-development.md)      | accepted | Spec-Driven Development; agent-agnostic knowledge layer  |
| [ADR-003](./ADR-003-agent-workflow-and-approvals.md) | accepted | agent workflow, approvals, adapters, and the pr-shepherd |
