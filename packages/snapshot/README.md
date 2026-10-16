# `@intraverse/se-client-snapshot`

The validator for the SuperEngine Snapshot (`se.snapshot/1`) and pure helpers to
render a validated Snapshot.

**Status:** pre-release: no public API yet. Not published to npm yet.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-snapshot
```

## When to use it

You receive a Snapshot from the Play API and must turn it into a typed value
before using it. A Snapshot is untrusted until this validator accepts it.

Do not use it for: fetching a Snapshot (use `@intraverse/se-client-play-client`,
which returns it as `unknown`) or holding the player's key.

## Entry points

- `@intraverse/se-client-snapshot`: the only entry. The API is not defined yet.

## Guarantees and constraints

- The validator is the only way from an untrusted value to a typed Snapshot, so
  an unvalidated Snapshot cannot reach the render helpers.
- It is hand-written over the schema's small keyword profile and does not
  compile code at run time (no `eval`, no `new Function`), so it works under a
  strict Content Security Policy.
- An amount in a Snapshot (`Amount.value`) is a string of base units; the
  helpers read it as a string or a `bigint`, never as a `number`.

Specified, not implemented yet: no validator ships today; these are the rules
the package is specified to follow.

## More

- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#packages)
  in the kit specification
- [Rendering from the Snapshot](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md#rendering-from-the-snapshot)
  in the Wrapper specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
