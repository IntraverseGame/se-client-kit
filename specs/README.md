# Specs

Current behavior and contracts: the source of truth. Implementation follows a
spec, and a behavior change updates its spec in the same pull request
([ADR-002](../decisions/ADR-002-spec-driven-development.md)).

## Conventions

- One file per contract, named for the concern (`wrapper.md`, not `notes.md`).
  Start from [the spec template](../.ai/templates/spec.md): purpose, scope,
  boundary, contract, errors, security, observability, references.
- A long section of a spec's contract lives in its own file, in a directory
  named for the spec and named for the section's heading
  (`wrapper/rendering-from-the-snapshot.md`). The spec keeps the section's
  heading, so its anchor still resolves, with a one-paragraph summary and a
  relative link to the file. The file opens with its title and a link back to
  the spec; its text is part of the spec, under the same rules.
- A spec describes accepted behavior, not wishes; proposals live in
  [`rfcs/`](../rfcs/). Unknowns are `<!-- TODO -->` markers, never invented.
- Contracts owned by the backend (the Play API at `/play/v1`, the Snapshot
  schema bundle, the signed-action specification, the signing vectors) are
  referred to by name and used as copies pinned in a lock file. They are not
  redefined here, and no private source is linked.
- Public: no secrets, internal hostnames, or personal data.

## Index

- [`client-kit.md`](./client-kit.md) — the repository, its packages, contract
  copies, supply chain, tests and CI.
- [`wrapper.md`](./wrapper.md) — the Wrapper's behavior: sessions, key custody,
  the transcript, checks, the UI.

## Table of contents

Every section of every spec, in order. A section in its own file links to that
file; the others link to their heading in the spec. Keep this list in step with
the specs' headings.

### [Client kit](./client-kit.md)

- [Purpose](./client-kit.md#purpose) · [Scope](./client-kit.md#scope) ·
  [Boundary](./client-kit.md#boundary)
- [Contract](./client-kit.md#contract)
  - [Repository layout](./client-kit.md#repository-layout) — the directory tree
    and each workspace's scripts
  - [Packages](./client-kit/packages.md) — the package table, the README rules,
    the dependency direction, the lint, code-style, and CSS rules
  - [The `contracts` package](./client-kit/the-contracts-package.md) — data
    only, the two entry points, the source layout, keeping vectors out of
    bundles and tarballs
  - [The `snapshot` package](./client-kit/the-snapshot-package.md) — validators,
    the keyword profile, narrowing, amounts
  - [The `play-client` request layer](./client-kit/the-play-client-request-layer.md)
    — request options, errors, retry classes, the token schedule
  - [The cryptography](./client-kit/the-cryptography.md) — EIP-712 types, keys,
    `SigningError`, the transcript helper, the vectors
  - [How the kit gets its contracts](./client-kit/how-the-kit-gets-its-contracts.md)
    — vendoring, the lock file, verification, drift
  - [Versioning and compatibility](./client-kit.md#versioning-and-compatibility)
  - [Supply chain](./client-kit/supply-chain.md) — install policy, the
    dependency allow-list, provenance, the reproducible build
  - [How the Wrapper reaches the SuperEngine origin](./client-kit.md#how-the-wrapper-reaches-the-superengine-origin)
  - [Never in the public repository](./client-kit.md#never-in-the-public-repository)
  - [Testing and CI](./client-kit/testing-and-ci.md) — test levels, CI jobs, and
    [task orchestration and caching](./client-kit/testing-and-ci.md#task-orchestration-and-caching)
  - [Environment configuration](./client-kit.md#environment-configuration)
  - [Bootstrap](./client-kit.md#bootstrap)
- [Errors and edge cases](./client-kit.md#errors-and-edge-cases) ·
  [Security](./client-kit.md#security) ·
  [Observability](./client-kit.md#observability) ·
  [Open items](./client-kit.md#open-items) ·
  [References](./client-kit.md#references)

### [Wrapper](./wrapper.md)

- [Purpose](./wrapper.md#purpose) · [Scope](./wrapper.md#scope) ·
  [Boundary](./wrapper.md#boundary)
- [Contract](./wrapper.md#contract)
  - [Vocabulary](./wrapper.md#vocabulary)
  - [Requirements and traceability](./wrapper.md#requirements-and-traceability)
    — the product requirements and acceptance criteria, mapped to W- and T-
    numbers
  - [Session open and the play token](./wrapper/session-open-and-the-play-token.md)
    — W-1 to W-8
  - [The action key and what may be stored](./wrapper/the-action-key-and-what-may-be-stored.md)
    — W-9 to W-13
  - [Two tabs](./wrapper.md#two-tabs) — W-14
  - [The transcript](./wrapper.md#the-transcript) — W-15 to W-19
  - [Signing start, move, cash-out, and cancel](./wrapper/signing-start-move-cash-out-and-cancel.md)
    — W-20 to W-27
  - [Rendering from the Snapshot](./wrapper/rendering-from-the-snapshot.md) —
    W-28 to W-36
  - [The game iframe and the controller boundary](./wrapper/the-game-iframe-and-the-controller-boundary.md)
    — W-37 to W-40
  - [Error and degraded states](./wrapper.md#error-and-degraded-states) — W-41
    to W-44
  - [Accessibility](./wrapper.md#accessibility) — W-45 to W-48
  - [Operator embedding](./wrapper.md#operator-embedding) — W-49
  - [Configuration](./wrapper.md#configuration)
- [Errors and edge cases](./wrapper.md#errors-and-edge-cases) ·
  [Security](./wrapper.md#security) ·
  [Observability](./wrapper.md#observability) ·
  [Test plan](./wrapper.md#test-plan) (T-1 to T-18) ·
  [What this spec does not own](./wrapper.md#what-this-spec-does-not-own) ·
  [Decided questions](./wrapper.md#decided-questions) (OQ-1 to OQ-7) ·
  [References](./wrapper.md#references)
