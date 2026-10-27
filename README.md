# se-client-kit

The public TypeScript monorepo for **everything the player's browser runs** in
**SuperEngine**, a trustless real-money game engine: the Wrapper, and the
libraries it is built from.

> **Status: bootstrapping.** The repository holds the license, the contribution
> and agent-workflow documents, and the first specs and decisions (the client
> kit, the Wrapper, as drafts; and the first three ADRs, accepted). There is no
> product code yet: the toolchain (pnpm workspace, TypeScript, oxc, Vitest,
> Playwright, wireit, CI) is in place and the packages are empty skeletons.
> Nothing here is released.

## Why this repository is public

The Wrapper's headless `shell` package holds the player's key and signs every
action the player takes, including the one that cashes out a round. Whoever
holds that key can move the player's money, so a player, an operator, or an
auditor should be able to read exactly what holds it, build it, and compare it
with what is served. Closed code asks you to trust; open code lets you check.

Because everything here is world-readable, there are rules about what may be
committed: no secrets, no internal hostnames, no unpublished backend internals.
See [`AGENTS.md`](./AGENTS.md#public-repository). To report a vulnerability, see
[`SECURITY.md`](./SECURITY.md).

## Planned packages

The intended npm names are `@intraverse/se-client-<name>` (scope `@intraverse`);
claiming them on npm is part of the publishing work (#12).

| Project          | Kind    | Role                                                                        |
| ---------------- | ------- | --------------------------------------------------------------------------- |
| `contracts`      | package | data only: the vendored backend contracts, generated types, lock file       |
| `signing`        | package | EIP-712 and secp256k1 signing and recovery for a fixed set of types         |
| `snapshot`       | package | validator and render helpers for the Snapshot (`se.snapshot/1`)             |
| `play-client`    | package | typed client for the Play API (`/play/v1`), types from `contracts`          |
| `shell`          | package | the headless part of the Wrapper: sessions, key custody, transcript, checks |
| `wrapper`        | app     | the UI, built into a release bundle                                         |
| `reference-game` | app     | a minimal sandboxed game for tests and as a sample                          |
| `verify`         | app     | the verify page; today the fairness kernel's derivations only               |
| `pages-proxy`    | app     | the Pages sites' same-origin API proxy (a worker; imports nothing)          |

Dependencies point one way: `contracts` (data only) ← `snapshot` and
`play-client` ← `shell` ← `wrapper`; `signing` ← `shell`; `signing` ← `verify`,
which never takes `shell`; `signing`'s tests read the vectors from `contracts`'
test-only entry (read only by tests; the consumers are listed in the
[client kit spec](./specs/client-kit/the-contracts-package.md)). No cycles. The
design lives in `specs/` ([client kit](./specs/client-kit.md) and
[Wrapper](./specs/wrapper.md)) and `decisions/`.

## Where to go next

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to contribute: the development
  flow, the role agents, branching and pull requests.
- [`AGENTS.md`](./AGENTS.md) — binding rules for AI agents (and a useful
  checklist for humans).
- [`.ai/README.md`](./.ai/README.md) — the agent knowledge layer.
- [`specs/`](./specs/), [`decisions/`](./decisions/), [`rfcs/`](./rfcs/),
  [`runbook/`](./runbook/) — behavior, decisions, proposals, procedures.
- [`SECURITY.md`](./SECURITY.md) — reporting a vulnerability.

## How to contribute

Open an issue to discuss a change, then a pull request from a fork or a branch.
New behavior starts as a spec (or an RFC for something significant). Every
change updates its spec in the same pull request. Read
[`CONTRIBUTING.md`](./CONTRIBUTING.md) first.

## License

MIT, see [`LICENSE`](./LICENSE).
<!-- TODO: the license is confirmed by the maintainers. -->

## AI tool adapters and symlinks

`AGENTS.md` is the single instruction source. Tool adapters are pointers only:
`CLAUDE.md` imports `@AGENTS.md`; `.opencode/skills`, `.claude/skills`, and
`.agents/skills` are symlinks to `.ai/skills`; `.claude/agents` and
`.opencode/agents` are symlinks to `.ai/agents` (the implementer, reviewer,
documenter, and pr-shepherd role agents).

On Windows, clone with symlink support
(`git config --global core.symlinks true`, Developer Mode enabled). Without it
the symlinks check out as small text files containing the target path; read
`.ai/skills/` and `.ai/agents/` directly.
