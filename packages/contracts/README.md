# `@intraverse/se-client-contracts`

The contracts of SuperEngine's player-facing surface as data: the Play API
OpenAPI document (`/play/v1`), the Snapshot JSON Schema (`se.snapshot/1`), and
the types generated from them. It holds documents and generated types and no
functions.

**Status:** pre-release. Not published to npm yet. When it is released it will
carry the contracts it was built against.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-contracts
```

## When to use it

You want the schemas or the generated types of the Play API or of the Snapshot,
for example to type your own code. Most consumers do not import it directly:
`@intraverse/se-client-snapshot` and `@intraverse/se-client-play-client` build
on it.

Do not use it for: validating a Snapshot (use `@intraverse/se-client-snapshot`)
or calling the Play API (use `@intraverse/se-client-play-client`).

## Entry points

- `@intraverse/se-client-contracts`: the runtime entry, with the Snapshot schema
  and the generated types of the Snapshot schema and of the Play API document.
  This is the public API.
- `@intraverse/se-client-contracts/testing`: golden test vectors used by this
  kit's own tests. It is not part of the public API, and the published package
  will not contain it: vectors never ship in a bundle or a tarball.

## Guarantees and constraints

- Data only: no validator, no client, no helper.
- An amount in the contracts (`Amount.value`) is a string of base units. Read it
  with `BigInt`, and never hold an amount as a `number`. `Amount.normalized` and
  `Multiplier` are numbers for display only: never do arithmetic on them.
- The files are copies of the backend's published contracts, referenced by name
  and version, never imported as code.

Today the package holds the Snapshot schema and its types, and the Play API
document's types: `PlayApiPaths` (by path and method), `PlayApiOperations` (by
`operationId`), `PlayApiComponents` (its schemas and responses), and
`PlayApiOperationRoutes` (each operation's path and method). The verify API
document is not here yet.

## More

- [The `contracts` package](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/the-contracts-package.md)
  and
  [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/packages.md)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
