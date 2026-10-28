# Decisions (ADRs)

Decisions and their rationale (each ADR's status shows whether it is accepted or
proposed), for choices that are hard to reverse: a new dependency, the package
structure, a protocol, supply-chain tooling, the agent workflow.

## Conventions

- File name `ADR-NNN-<slug>.md`, numbered in order, from
  [the ADR template](../.ai/templates/adr.md). Status is `proposed` until a
  maintainer accepts it, then `accepted`.
- An ADR is never rewritten. A later decision supersedes it with a new ADR and
  both link each other.
- A disagreement with an accepted ADR goes to an RFC, not a review exception.
- Public: no secrets, internal hostnames, or personal data.

## Index

| ADR                                                             | Status   | Decision                                                                                                                          |
| --------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-001](./ADR-001-toolchain-and-signing.md)                   | accepted | toolchain; hand-written EIP-712 over `@noble` (decision 9 superseded by ADR-008)                                                  |
| [ADR-002](./ADR-002-spec-driven-development.md)                 | accepted | Spec-Driven Development; agent-agnostic knowledge layer                                                                           |
| [ADR-003](./ADR-003-agent-workflow-and-approvals.md)            | accepted | agent workflow, approvals, adapters, and the pr-shepherd                                                                          |
| [ADR-004](./ADR-004-openapi-typescript-6.md)                    | accepted | `openapi-typescript` 6.7.6, without a TypeScript compiler-API dependency                                                          |
| [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md) | accepted | `actions/attest-build-provenance` and `actions/upload-artifact` in the release                                                    |
| [ADR-006](./ADR-006-the-operator-protocol-se-operator-1.md)     | accepted | the operator protocol `se.operator/1`: separate, operator first, lobby and deposit as navigations                                 |
| [ADR-007](./ADR-007-no-public-suffix-list.md)                   | accepted | W-37's registrable-domain rule by the last two labels, without a public suffix list                                               |
| [ADR-008](./ADR-008-pages-deploy-with-wrangler.md)              | accepted | kit CI deploys the Wrapper and the verifier to Cloudflare Pages from `main`, with a pinned `wrangler` and a same-origin API proxy |
