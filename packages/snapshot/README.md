# `@intraverse/se-client-snapshot`

The validator for the SuperEngine Snapshot (`se.snapshot/1`), the typed Play API
error, and the request-side amount, with types that narrow a validated Snapshot
by `presentation` and `status`.

**Status:** pre-release. Not published to npm yet.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-snapshot
```

## When to use it

You receive a Snapshot or a Play API error from the Play API and must turn it
into a typed value before using it. A Snapshot is untrusted until this validator
accepts it.

Do not use it for: fetching a Snapshot (use `@intraverse/se-client-play-client`,
which returns it as `unknown`) or holding the player's key.

## Entry points

- `@intraverse/se-client-snapshot`: the only entry.
  - `validateSnapshot(input)`, `validatePlayProblem(input)`, and
    `validateAmountRequest(input)` take an `unknown` value and return
    `{ ok: true, value }` or `{ ok: false, issues }`. They never throw.
  - Each issue names where validation failed (`instancePath` in the document,
    `schemaPath` in the schema) and the failing `keyword`; `issues[0]` is the
    first failure. An issue never contains a value from the document.
  - A validated Snapshot (`ValidSnapshot`) is a union discriminated by `status`
    (`idle`, `starting`, `active`, `resolving`, `won`, `lost`, `canceled`):
    switching on it narrows to the fields that status carries (for example
    `roundId` from `starting` on, the revealed round secret on `won` and
    `lost`). `isStepsPresentation` and `isPlaybackPresentation` narrow it by
    `presentation`.
  - A validated Play API error (`ValidPlayProblem`) is discriminated by `code`:
    `ROUND_ACTIVE` carries the open round's validated Snapshot, and `retryable`
    is typed from the code.
  - `parseBaseUnits(value)` reads an amount's base-units string as a `bigint`,
    and `compareAmounts(a, b)` compares two amounts of the same unit and scale.

## Guarantees and constraints

- The validator is the only way from an untrusted value to a typed Snapshot.
- It is hand-written over the schema's small keyword profile and does not
  compile code at run time (no `eval`, no `new Function`), so it works under a
  strict Content Security Policy. A keyword outside that profile fails the
  validation instead of being skipped.
- It follows the schema exactly: the Snapshot's objects are closed, so a field
  the schema does not list, an unknown `status`, or an unknown error `code` is
  rejected.
- An amount (`Amount.value`) is a string of base units, read as a `bigint`,
  exactly, up to 2^256 - 1; never as a `number`. `Amount.formatted` is for
  display and `Amount.normalized` is never used for a decision.
- No runtime dependency other than `@intraverse/se-client-contracts`, which
  supplies the schema and its types. Importing the package does no work.

## More

- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#packages)
  in the kit specification
- [Rendering from the Snapshot](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md#rendering-from-the-snapshot)
  in the Wrapper specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
