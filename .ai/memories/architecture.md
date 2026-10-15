---
description: Package boundaries, key custody, how contracts and vectors flow, and decisions an agent must not "fix". Read before changing structure or adding packages.
last-verified: 2026-10-15 (commit 8630f95, bootstrap; planned structure, nothing built)
---

# Architecture (agent context)

The contract is the kit's [client kit spec](../../specs/client-kit.md) and
[Wrapper spec](../../specs/wrapper.md); this note is the orientation around
them. Until the packages exist, treat the structure below as the plan and flag
any divergence.

## Mental model

- **Packages** under `packages/`, **apps** under `apps/`. A package has one
  public entry point (its `package.json` `exports`); everything else is
  internal.
- **Dependency direction is one way:** `contracts` (data only) ← `snapshot` and
  `play-client` ← `shell` ← `wrapper` (app); `signing` ← `shell`; `signing`'s and
  `snapshot`'s tests read vectors from `contracts`' test-only entry (read only by
  tests; the consumers are listed in `specs/client-kit.md`);
  `reference-game` depends on nothing but the controller protocol's types. No
  cycles; a package never imports an app; `snapshot` and `play-client` never
  import each other. Enforced by lint import rules and CI once the toolchain
  lands.
- **`contracts` is data only.** No validator, client, encoder, or helper in it.
  Two entry points: runtime (schemas, generated types) and test-only (vectors).
  Only tests import the test-only entry; the build fails if a vector reaches any
  bundle; the published tarball excludes it. A function added to `contracts` is a
  defect. If the backend publishes a package, `contracts` is what it replaces.
- **The shell is the only code that touches a credential** (action key, play
  token). The UI gets use cases (`start`, `pick`, `cashOut`) and read-only
  state, never a secret. Do not "simplify" this by letting the UI sign or read
  a token.
- **A Snapshot is untrusted until validated.** `play-client` returns it as
  `unknown`; only `snapshot`'s validator produces a typed value, so an
  unvalidated Snapshot cannot reach the renderer by construction.
- **Signing mirrors the backend's decisions:** a hand-written, fixed-type
  EIP-712 encoder, 65-byte `r ‖ s ‖ v` signatures with `v` in `{27, 28}` and low
  `s`, deterministic (RFC 6979), the zero address rejected on recovery. It is
  checked against the same vectors as the backend's verifier. Do not swap in a
  general EIP-712 library.

## Contracts and vectors

- The kit shares **documents, never code** with the backend. Each contract file
  lives in the `contracts` package (planned) and is pinned in its lock file with
  its source commit and a SHA-256. A contract sync touches that one package.
- CI recomputes the hashes offline and fails on a mismatch. It holds no
  credential for any private repository; drift is detected from the backend
  side, which reads this repository's public lock file.
- Vectors are **append-only**: a released version's vector files are never
  edited; new cases are new files or a new version. A vendored vector file
  records the commit it came from.
- Changes within `/play/v1` and `se.snapshot/1` are additive; clients are
  tolerant readers. A breaking change is a new surface or schema version and a
  new major of the affected packages.

## Things not to "fix"

- No UI framework in the Wrapper (a small UI, and a framework's dependency graph
  would sit in the code that holds the key). Changing it needs an ADR.
- The runtime-dependency allow-list is deliberately tiny (the two noble
  cryptography libraries, in `signing` only). A new runtime dependency needs an
  ADR.
- No git submodules; no importing backend code; no fetching private contracts
  in CI.
- The Wrapper bundle is built identically for every environment; values come
  from one configuration document. Do not add per-environment builds or a test
  build: the e2e tests the unmodified release bundle and stubs
  `crypto.getRandomValues` from outside with Playwright's `addInitScript`.

## Known open items

<!-- TODO: npm scope; hosting and deploy of the released Wrapper (credentials stay outside this repository); CODEOWNERS handles. -->
