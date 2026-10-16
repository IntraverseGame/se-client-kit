# `@intraverse/se-client-play-client`

A typed `fetch` client for the SuperEngine Play API (`/play/v1`) and the verify
read the Wrapper needs.

**Status:** pre-release: no public API yet. Not published to npm yet.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-play-client
```

## When to use it

You call the Play API from a browser or Node and want typed requests and
responses.

Do not use it for: interpreting a Snapshot: the client returns the Snapshot body
as `unknown`, and only `@intraverse/se-client-snapshot` can turn it into a typed
value.

## Entry points

- `@intraverse/se-client-play-client`: the only entry. The API is not defined
  yet.

## Guarantees and constraints

- It uses the platform `fetch` and has no runtime dependency.
- Its types come from `@intraverse/se-client-contracts`.
- It never interprets the Snapshot it returns.
- Amounts are strings or `bigint`, never `number`.

Specified, not implemented yet: no client ships today; these are the rules the
package is specified to follow.

## More

- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#packages)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
