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
  referred to by name. The Play API document, the Snapshot schema bundle, the
  signing vectors, and the public vector bundle of the SuperEngine fairness
  kernel are used as copies pinned in a lock file; the signed-action
  specification is not copied, and its vectors are. They are not redefined here,
  and no private source is linked.
- Public: no secrets, internal hostnames, or personal data.

## Index

- [`client-kit.md`](./client-kit.md) — the repository, its packages, contract
  copies, supply chain, tests and CI.
- [`wrapper.md`](./wrapper.md) — the Wrapper's behavior: sessions, key custody,
  the transcript, checks, the UI.
- [`verify-page.md`](./verify-page.md) — the verify page: a round id in, the
  round recomputed in the browser (specified, not built).

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
    — request options, errors, retry classes, the token schedule, and
    [the operations](./client-kit/the-play-client-request-layer.md#operations)
  - [The `shell` package](./client-kit/the-shell-package.md) — redaction, the
    logger, key custody, the signer lock, the transcript state, the chain
    configuration, the tip check
  - [The cryptography](./client-kit/the-cryptography.md) — EIP-712 types, keys,
    `SigningError`, the transcript helper, the vectors
  - [How the kit gets its contracts](./client-kit/how-the-kit-gets-its-contracts.md)
    — vendoring, the lock file, verification, drift
  - [Versioning and compatibility](./client-kit.md#versioning-and-compatibility)
  - [Supply chain](./client-kit/supply-chain.md) — install policy, the
    dependency allow-list, provenance, the reproducible build
  - [How the Wrapper reaches the SuperEngine origin](./client-kit.md#how-the-wrapper-reaches-the-superengine-origin)
  - [Never in the public repository](./client-kit.md#never-in-the-public-repository)
  - [The reference game](./client-kit/the-reference-game.md) — the type-only
    controller subpath, the game's message checks, Coin Flip
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
  - [Operator embedding](./wrapper/operator-embedding.md) — W-49 to W-49f: the
    framing check, the `se.operator/1` handshake, `resize`, the lobby and
    deposit navigations, and T-9a's test plan
  - [Configuration](./wrapper.md#configuration)
- [Errors and edge cases](./wrapper.md#errors-and-edge-cases) ·
  [Security](./wrapper.md#security) ·
  [Observability](./wrapper.md#observability) ·
  [Test plan](./wrapper.md#test-plan) (T-1 to T-20) ·
  [What this spec does not own](./wrapper.md#what-this-spec-does-not-own) ·
  [Decided questions](./wrapper.md#decided-questions) (OQ-1 to OQ-8) ·
  [References](./wrapper.md#references)

### [Verify page](./verify-page.md)

- [Purpose](./verify-page.md#purpose) · [Scope](./verify-page.md#scope) ·
  [Boundary](./verify-page.md#boundary)
- [Contract](./verify-page.md#contract)
  - [Vocabulary](./verify-page.md#vocabulary)
  - [The URL and where the page is served](./verify-page.md#the-url-and-where-the-page-is-served-v-1-v-2)
    — V-1, V-2
  - [Configuration](./verify-page.md#configuration-v-3) — V-3
  - [The page's states](./verify-page.md#the-pages-states-v-4-to-v-11) — V-4 to
    V-11
  - [What the page recomputes](./verify-page.md#what-the-page-recomputes-v-12-v-13)
    — V-12, V-12a, V-13
  - [Accessibility](./verify-page.md#accessibility-v-14) — V-14
  - [Build and release](./verify-page.md#build-and-release-v-15-to-v-17) — V-15
    to V-17
- [Errors and edge cases](./verify-page.md#errors-and-edge-cases) ·
  [Security](./verify-page.md#security) ·
  [Observability](./verify-page.md#observability) ·
  [Test plan](./verify-page.md#test-plan) (VT-1 to VT-10) ·
  [Decisions](./verify-page.md#decisions) (D-1 to D-4) ·
  [References](./verify-page.md#references)
