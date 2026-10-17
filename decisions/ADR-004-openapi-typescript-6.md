# ADR-004 — `openapi-typescript` 6.7.6 for the Play API document's types

- Status: accepted
- Date: 2026-10-17 (decided by the human in the contracts vendoring pull
  request)
- Relates to: [ADR-001](./ADR-001-toolchain-and-signing.md) (decision 7, the
  supply-chain minimum; decision 8 and the dependency table, the allow-list)

## Context

The `contracts` package holds a copy of the Play API `/play/v1` OpenAPI document
and the types generated from it. `tools/generate-contracts.ts` generates them
with `openapi-typescript` into the committed file
`packages/contracts/src/generated/play.ts`, and CI regenerates and fails on a
diff. `openapi-typescript` is a development dependency on the ADR-001
allow-list. The kit's TypeScript is 7.0.2.

The 7.x line of `openapi-typescript` (7.13.0 is the newest) builds its output
with the TypeScript 5 compiler API (`ts.factory`) and declares `typescript` as a
peer dependency. TypeScript 7 has no such API, so 7.x, given the kit's
TypeScript as its peer, cannot run. The 6.x line prints its output as text and
has no TypeScript dependency or peer at all.

## Decision

1. **Pin `openapi-typescript` 6.7.6**, the last release of the last major
   without a TypeScript compiler-API dependency (published 2024-05-19), as an
   exact development dependency. No install hook and no second TypeScript.
2. **The generator stays hermetic.** `tools/generate-contracts.ts` passes the
   document as a `file:` URL and replaces the generator's `fetch` with one that
   throws, so a reference outside the document fails the generation instead of
   reaching the network; `tools/contracts-local-refs.test.ts` checks that every
   `$ref` in the vendored document and schema is local (`#/...`).
3. **What it must produce.** The generated module keeps the roots `paths`,
   `operations` (keyed by `operationId`), and `components`, every object as a
   `type` alias (`exportType`), and an object schema without properties as a
   record of `unknown` values (`emptyObjectsUnknown`); a leftover
   `export interface` fails the generation.

## Alternatives considered

- **`openapi-typescript` 7.13.0 with an install hook.** Rejected. It needs the
  TypeScript 5 compiler API, so it needs a second TypeScript (5.9.3). pnpm
  resolves a peer from the workspace root, so that second TypeScript can only
  reach it through a `.pnpmfile.cjs` `readPackage` hook that turns the peer into
  a dependency: install-time code in a public repository, for one development
  tool. Two pnpm settings were tried first, each with `openapi-typescript`
  removed and added again so the lockfile was resolved afresh, and neither
  works:
  - **the `parent>child` override selector**
    (`overrides: { "openapi-typescript>typescript": "5.9.3" }` in
    `pnpm-workspace.yaml`): pnpm records it but applies it to dependencies, not
    to peer dependencies; `openapi-typescript@7.13.0_typescript@7.0.2` is
    linked, TypeScript 5.9.3 is not installed, and importing the generator fails
    (`ts.factory` is undefined). A plain `typescript` override would move the
    whole workspace's TypeScript instead;
  - **`packageExtensions` adding a regular dependency**
    (`openapi-typescript@7.13.0: { dependencies: { typescript: 5.9.3 } }`): pnpm
    resolves the name as the peer, with the same link and the same failure. An
    extension can add to a manifest but cannot remove the peer.
- **A hand-written generator in `tools/`.** Rejected: more code to own and to
  keep correct against the OpenAPI specification.
- **Downgrade the kit's TypeScript to 5.** Rejected: the whole kit would move
  back for one development tool.

## Consequences / tradeoffs

- **An older major.** 6.x receives no new features. It covers what the document
  uses (OpenAPI 3.0, local `$ref`s, `oneOf`, `additionalProperties: false`,
  `format: byte` and `date-time` as strings); a document change that 6.x cannot
  type fails `check:contracts` on the committed diff.
- **Its own dependencies** (among them `undici` and `js-yaml`) are development
  dependencies only, under the same supply-chain rules (ADR-001 decision 7);
  nothing it brings reaches a bundle, and the generator makes no request (its
  `fetch` is replaced, and every reference is local).
- **The generator's `undici` is overridden to 6.29.0** (decided by the human,
  2026-10-17). `openapi-typescript` 6.7.6 declares `undici` `^5.28.4`, and every
  5.x release has published advisories: on 5.28.4, 15 in `undici` itself (three
  high) and two in the `@fastify/busboy` it brings; 5.29.0, the newest 5.x,
  clears only two of them. Their fixes are in 6.x (the highest one needed is
  6.28.1). So `pnpm-workspace.yaml` overrides it to exactly 6.29.0, **outside
  the declared range**, with the scoped selector
  `"openapi-typescript>undici": "6.29.0"`: it applies to `openapi-typescript`'s
  own `undici` only, and every other package keeps the `undici` it declares
  (`jsdom` keeps its 8.x). `undici` is on the ADR-001 allow-list for that
  override only. After it, the full `pnpm audit` reports only the `braces`
  advisory (GHSA-vfj7-8cjw-p6xm), which `stylelint` and `wireit` already bring
  on main. What proves the override works: the generator regenerates the
  committed `play.ts` without a difference (`check:contracts`), and
  `tools/openapi-generator.test.ts` checks the scoped override, that
  `openapi-typescript` resolves `undici` 6.29.0 and regenerates the types under
  it, and that `jsdom` still resolves its own 8.x. 6.29.1 was refused by
  `minimumReleaseAge` (published two days before; the age is 7 days), so a later
  bump of the override goes through the normal age rule, never through an
  exclusion. **Exit criterion:** drop the override, and `undici` from the
  allow-list, when `openapi-typescript` or the generator no longer pulls
  `undici`, or declares a range whose releases have no advisory.
- **Dependency updates.** Dependabot proposes the 7.x line; such an update fails
  `check:contracts` (the generator cannot run) and is declined until the first
  exit criterion below holds (a later major works with the kit's TypeScript).
- **Exit criteria.** First: when a later major of `openapi-typescript` works
  with the kit's TypeScript (no TypeScript 5 compiler API), move to it,
  regenerate, and mark this ADR superseded by the ADR that records the move.

## References

- [ADR-001](./ADR-001-toolchain-and-signing.md) (decisions 3, 7, and 8; the
  dependency table).
- [specs/client-kit/supply-chain.md](../specs/client-kit/supply-chain.md),
  [specs/client-kit/the-contracts-package.md](../specs/client-kit/the-contracts-package.md).
- `tools/generate-contracts.ts`, `tools/contracts-local-refs.test.ts`.
- [.ai/memories/development-workflow.md](../.ai/memories/development-workflow.md).
