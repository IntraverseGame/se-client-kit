## What and why

<!-- One logical change. Link the spec / RFC / ADR / issue this implements. -->

## How it was verified

<!-- Commands run (e.g. `pnpm check`, `pnpm test:e2e`) and results. -->

## Checklist

- [ ] `pnpm check` passes locally (format, lint, typecheck, unit tests, contracts
      check). <!-- TODO(toolchain PR): scripts land with the toolchain -->
- [ ] Generated code regenerated and committed; no generated file edited by hand.
- [ ] **Spec Drift Synchronization:** code and `specs/` agree; any behavior
      change updates the spec in this PR.
- [ ] Memories in `.ai/memories/` updated if architecture, conventions, testing,
      or operations changed; linked working memories resolved.
- [ ] Specs/RFCs created or updated; hard-to-reverse decisions recorded as ADRs
      in `decisions/`.
- [ ] Runbooks in `runbook/` match reality.
- [ ] Anything the change logs or emits is documented in its spec and holds no
      key, token, or personal data.
- [ ] Tests added: unit, vector replay for wire or signing changes, e2e for
      user-visible behavior.
- [ ] Package boundaries hold: dependency direction respected, other packages
      imported through their public entry point only.
- [ ] Money amounts are strings or `bigint`; no key or token is logged,
      serialized, or stored.
- [ ] **Public repository:** no secrets, tokens, keys (other than the public
      test keys of the vectors), internal hostnames, dashboard links, account
      identifiers, personal data, or unpublished backend internals.
- [ ] Contract copies in the `contracts` package changed only with their lock
      entry (source commit and hash); no released vector file edited; the
      `contracts` package still has no logic, and only tests import its
      test-only entry.
- [ ] No new third-party dependency, or an ADR justifies it; no lifecycle script
      enabled; any new GitHub Action is pinned by full commit SHA.
- [ ] Approved by a human reviewer, then by the reviewer agent, before it was
      committed (ADR-003).

See [`AGENTS.md`](../AGENTS.md) for the mandatory actions and
[`CONTRIBUTING.md`](../CONTRIBUTING.md#development-flow) for the development flow.
