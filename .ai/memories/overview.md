---
description: What se-client-kit is, why it is public, the package map, and its boundary to the backend. Read first on any task.
last-verified: 2026-10-15 (commit 8630f95, bootstrap; no product code yet)
---

# Overview

`se-client-kit` is the public TypeScript monorepo for **everything the player's
browser runs** in SuperEngine, a trustless real-money game engine: the Wrapper
(whose headless `shell` package holds the player's action key and play token and
signs every action, and which renders the Snapshot) and the libraries it is built
from. Human
orientation is in [README.md](../../README.md); do not restate it here.

## Why it is public

The Wrapper holds the key that can cash out the player's round. A player, an
operator, or an auditor must be able to read exactly what holds that key, build
it, and compare it with what is served. The cost: everything committed here is
world-readable and cannot be taken back, so what may be committed is limited
(see [AGENTS.md](../../AGENTS.md#public-repository)).

## Package map (planned; none exists yet)

| Project          | Kind           | Role                                                                    |
| ---------------- | -------------- | ----------------------------------------------------------------------- |
| `contracts`      | package (leaf) | data only: vendored backend contracts, generated types, the lock file   |
| `signing`        | package        | EIP-712 and secp256k1 signing and recovery for a fixed set of types     |
| `snapshot`       | package        | validator and render helpers for the Snapshot (`se.snapshot/1`)         |
| `play-client`    | package        | typed client for the Play API (`/play/v1`), types from `contracts`      |
| `shell`          | package        | headless part of the Wrapper: sessions, key custody, transcript, checks |
| `wrapper`        | app            | the UI, built into a release bundle                                     |
| `reference-game` | app            | a minimal sandboxed game for tests and as a sample                      |

Dependency direction: `contracts` ← `snapshot` and `play-client` ← `shell` ←
`wrapper`; `signing` ← `shell`; tests read vectors from `contracts`' test-only
entry. The npm scope is undecided
<!-- TODO: npm scope -->

Details: [architecture.md](./architecture.md).

## Boundary to the backend

The player-facing contracts are defined by a separate, private backend
repository and are **copied** here as documents: the Play API document, the
Snapshot schema and vectors, the signed-action specification, and the signing
vectors. Neither side imports the other's code. Refer to those contracts by
name only; never paste private text or link to private repositories.

## Current state

Bootstrapping: the repository holds the license, the agent-agnostic knowledge
layer (this directory), and the first specs (`specs/client-kit.md`,
`specs/wrapper.md`) and decisions (`ADR-001` to `ADR-003`, accepted 2026-10-16). The toolchain (pnpm
workspace, TypeScript, Vite, Vitest, Playwright, oxlint, oxfmt, CI) is the next
pull request; packages follow.

## Where things are

- Contracts and behavior: `specs/`; decisions: `decisions/`; proposals: `rfcs/`;
  procedures: `runbook/`; agent layer: `.ai/`.
- Planned: `packages/` (including `packages/contracts`, the copies plus the lock
  file), `apps/`, `e2e/`, `.changeset/`.
