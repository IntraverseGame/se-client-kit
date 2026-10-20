---
description: What se-client-kit is, why it is public, the package map, and its boundary to the backend. Read first on any task.
last-verified: 2026-10-20 (verify page states pull request: `verify` takes `contracts`' runtime entry and holds its checks, states, and view; verify kernel pull request: the `verify` app; the signed-action specification is used by name, not copied; fairness kernel vectors pull request: the public kernel vector bundle joins the shared contracts; play-client operations pull request: current state, with the Play API operations, and the decisions to ADR-004)
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

## Package map (empty skeletons; no product code yet)

| Project          | Kind           | Role                                                                    |
| ---------------- | -------------- | ----------------------------------------------------------------------- |
| `contracts`      | package (leaf) | data only: vendored backend contracts, generated types, the lock file   |
| `signing`        | package        | EIP-712 and secp256k1 signing and recovery for a fixed set of types     |
| `snapshot`       | package        | validator and render helpers for the Snapshot (`se.snapshot/1`)         |
| `play-client`    | package        | typed client for the Play API (`/play/v1`), types from `contracts`      |
| `shell`          | package        | headless part of the Wrapper: sessions, key custody, transcript, checks |
| `wrapper`        | app            | the UI, built into a release bundle                                     |
| `reference-game` | app            | a minimal sandboxed game for tests and as a sample                      |
| `verify`         | app            | the verify page: its checks, states, and view; no HTML or build yet    |

Dependency direction: `contracts` ← `snapshot` and `play-client` ← `shell` ←
`wrapper`; `signing` ← `shell`; `signing` and `contracts`' runtime entry ← `verify` (never `shell`); tests
read vectors from `contracts`' test-only entry. The intended npm names are `@intraverse/se-client-<name>` (not claimed on
npm yet; that is part of the publishing work, #12).

Details: [architecture.md](./architecture.md).

## Boundary to the backend

The player-facing contracts are defined by a separate, private backend
repository and are **copied** here as documents: the Play API document, the
Snapshot schema and vectors, the signing vectors, and the public vector bundle
of the SuperEngine fairness kernel, kernelVersion 1 (its sets
`kernel/public/v1/*`). The signed-action specification is not copied: the kit
refers to it by name and implements it, and its vectors are copied (the signing
vectors and the `signed-action/` Snapshot vector). Neither side imports the
other's code. Refer to those contracts by name only; never paste private text or
link to private repositories.

## Current state

Pre-release, nothing published yet. The repository holds the license, the
agent-agnostic knowledge layer (this directory), the specs (`specs/`), the
decisions (`ADR-001` to `ADR-004`), and the toolchain (pnpm workspace,
TypeScript, Vite, Vitest, Playwright, oxlint, oxfmt, changesets, wireit, CI).
Built so far: `contracts` (the vendored Play API document, the Snapshot schema
and vectors, the signing vectors, generated types), `signing`, `snapshot`,
`play-client` (the request layer and the Play API operations), and `shell` (key custody, the transcript,
the tip check, the W-26 `CreateRoundAuth` and `T_0` checks and the round's
verdict). Not built yet: the start, move, and cash-out flows, the Wrapper UI,
and the reference game.

## Where things are

- Contracts and behavior: `specs/`; decisions: `decisions/`; proposals: `rfcs/`;
  procedures: `runbook/`; agent layer: `.ai/`.
- `packages/` (including `packages/contracts`, later the copies plus the lock
  file), `apps/`, `e2e/`, `tools/` (repository checks), `.changeset/`,
  `.github/` (workflows, the setup action, dependabot).
