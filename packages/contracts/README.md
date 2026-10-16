# `@intraverse/se-client-contracts`

The contracts of SuperEngine's player-facing surface as data: the Play API
OpenAPI document (`/play/v1`), the Snapshot JSON Schema (`se.snapshot/1`), and
the types generated from them. It holds documents and generated types and no
functions.

**Status:** pre-release: no public API yet. Not published to npm yet. When it is
released it will carry the contracts it was built against.

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

- `@intraverse/se-client-contracts`: the runtime entry, with the schemas and the
  generated types. This is the public API.
- `@intraverse/se-client-contracts/testing`: golden test vectors used by this
  kit's own tests. It is not part of the public API, and the published package
  will not contain it: vectors never ship in a bundle or a tarball.

## Guarantees and constraints

- Data only: no validator, no client, no helper.
- An amount in the contracts (`Amount.value`) is a string of base units. Read it
  with `BigInt`, and never hold an amount as a `number`.
- The files are copies of the backend's published contracts, referenced by name
  and version, never imported as code.

Specified, not implemented yet: the package holds no schemas or types today;
these are the rules it is specified to follow once it does.

## More

- [The `contracts` package](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#the-contracts-package)
  and
  [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#packages)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
