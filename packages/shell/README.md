# `@intraverse/se-client-shell`

The headless part of the SuperEngine Wrapper: session and play-token lifecycle,
custody of the player's action key, the transcript, and the boundary to the
game.

**Status:** pre-release: no public API yet. Not published to npm yet.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-shell
```

## When to use it

You are building a Wrapper or another front end for SuperEngine and want the
logic that holds the player's key and signs every action, without a UI. Most
integrators use the Wrapper itself rather than this package.

Do not use it for: writing a game (games talk to the Wrapper through the
controller protocol `se.controller/1`) or any code that should not hold a key.

## Entry points

- `@intraverse/se-client-shell`: the only entry. It is meant to expose use cases
  (`start`, `pick`, `cashOut`) and read-only state. The API is not defined yet.

## Guarantees and constraints

- This is the only code in the kit that holds the player's action key and play
  token. The UI receives use cases and read-only state, never a secret.
- Secrets stay in memory for the session: they are never logged, serialized, or
  written to storage, and the package wraps them in redacting types.
- It depends on `@intraverse/se-client-signing`,
  `@intraverse/se-client-snapshot`, and `@intraverse/se-client-play-client`.
- Amounts are strings or `bigint`, never `number`.

Specified, not implemented yet: no code ships today; these are the rules the
package is specified to follow.

## More

- [The action key and what may be stored](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-action-key-and-what-may-be-stored.md)
  and
  [The Wrapper specification](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md)
- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/packages.md)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
