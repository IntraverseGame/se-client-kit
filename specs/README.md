# Specs

Current behavior and contracts: the source of truth. Implementation follows a
spec, and a behavior change updates its spec in the same pull request
([ADR-002](../decisions/ADR-002-spec-driven-development.md)).

## Conventions

- One file per contract, named for the concern (`wrapper.md`, not `notes.md`).
  Start from [the spec template](../.ai/templates/spec.md): purpose, scope,
  boundary, contract, errors, security, observability, references.
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
