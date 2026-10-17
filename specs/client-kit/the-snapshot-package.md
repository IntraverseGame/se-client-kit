# The `snapshot` package

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

- **Validators.** `validateSnapshot`, `validatePlayProblem`, and
  `validateAmountRequest` take an `unknown` value and evaluate it against the
  vendored `se.snapshot/1` schema (`#`, `#/$defs/PlayProblem`,
  `#/$defs/AmountRequest`). Each returns `{ ok: true, value }`, with the input
  itself as the typed value (no copy), or `{ ok: false, issues }`, with every
  failed keyword in evaluation order. They never throw: an exception on a value
  that is not JSON (a throwing getter, a proxy) becomes one issue with the
  keyword `evaluation`.
- **Issues.** An issue is `{ instancePath, schemaPath, keyword }`: a JSON
  Pointer into the document, a JSON Pointer to the failing keyword in the schema
  document (after `$ref` resolution, for example `/$defs/BaseUnits/pattern`),
  and the keyword. It never holds a value from the document, so `issues[0]` is
  what W-28 logs. `anyOf`, `oneOf`, `not`, `additionalProperties: false`, and
  `required` report one issue at the object or keyword location; within one
  schema object the keywords are evaluated in schema order, except that `not`
  comes last, so a sibling that rejects a member where it sits (such as
  `properties` with `not: {}` for a field the status forbids) reports first;
  `additionalProperties` reports at the object in both forms (with `false`, and
  with a schema, whose issues for an extra member are at the object, since the
  member's name is document content); `allOf` and the `then`/`else` of an `if`
  report their subschemas' own issues; so the first issue of every `invalid/`
  vector is at its `failsAt` pointer (T-5).
- **The keyword profile.** The evaluator interprets the schema as data (no
  generated code, no `eval`, no `new Function`; ADR-001 decision 6) and supports
  exactly the keywords the vendored schema uses: the annotations `$schema`,
  `$id`, `$comment`, `$defs`, `title`, `description`; `$ref` to `#` or a `#/...`
  pointer inside the document; `type`, `const`, `enum`, `minimum`, `maximum`,
  `minLength` and `maxLength` (in code points), `pattern` (ECMA-262 with the `u`
  flag, unanchored as JSON Schema says; the schema's own `^...$` anchors reject
  a trailing newline), `required`, `properties`, `additionalProperties`,
  `dependentRequired`, `items` (one schema), `minItems`, `maxItems`, `allOf`,
  `anyOf`, `oneOf`, `not`, `if`, `then`, `else`. It **fails closed**: any other
  keyword, a malformed keyword value, an invalid pattern, or a `$ref` that does
  not resolve inside the document is the issue `unsupported`, never a silent
  pass. A test keeps the vendored schema inside the profile, so a schema sync
  that adds a keyword fails the tests instead of weakening validation.
- **Strict, as the contract is.** The validator follows the schema exactly: the
  Snapshot's objects are closed (`additionalProperties: false`, the allow-list),
  so an unknown field, an unknown `status`, and an unknown error `code` are
  rejected, as the `invalid/` vectors require. Tolerance (W-29) applies only to
  what the schema allows: absent optional fields and the members of the objects
  the schema leaves open (decided by human review, 2026-10-16).
- **Narrowing.** The generated contract types are flat. The validator checks the
  schema's conditional rules, so an accepted Snapshot is typed `ValidSnapshot`,
  a union discriminated by `status` that carries what each status guarantees:
  `idle` has no round field (no `proofs`); `starting` has `roundId` and no play
  fields, and `proofs` only once bound (a bound config round's `proofs` carry
  `randomnessProof` and `createRoundAuth`; an unbound one has none, so `proofs`
  stays optional there); `active` and `resolving` have `proofs` and no
  `closeReason`; `won` and `lost` have `proofs.randomnessProof.roundSecret`;
  `canceled` has `proofs`. `isStepsPresentation` (a `StepConfig`) and
  `isPlaybackPresentation` (a book round with a `BookConfig`) narrow by
  `presentation`. An accepted Play API error is `ValidPlayProblem`,
  discriminated by `code`: `ROUND_ACTIVE` carries a `ValidSnapshot` and
  `retryable: false`; of the six retryable codes, five have `retryable: true`
  and `UNAVAILABLE` either value (retryable by default, but `false` on a call
  that is never repeated, the launch-code redeem); every other code has
  `retryable: false` and no `snapshot`. The `createRoundAuth` of a config round
  is typed optional, as the generated types are: the schema requires it from the
  bind on for `model: "config"`, which the narrowing by `status` does not
  express.
- **Money.** `parseBaseUnits` is the package's one reader of `Amount.value`: a
  base-10 string without sign or leading zero, at most 2^256 - 1, read as a
  `bigint` (`undefined` otherwise). `compareAmounts` compares two amounts of the
  same `unit` and `decimals` as `bigint` (`undefined` when they differ). No
  helper reads `normalized` or a multiplier.
- **What it emits.** Nothing: no logging, no telemetry, no storage. The issues
  are returned to the caller.
- **Tests.** The vector runner (T-5) replays every `valid/` and `invalid/`
  vector through the validator its `definition` names, and accepts every
  `signature/` vector as a Snapshot (their verdicts are the shell's W-26
  checks'); seeded property tests (a small mulberry32 generator in the package's
  test helpers, no new dependency) check that the validators never throw, never
  modify the input, are deterministic, and never reach the fail-closed paths on
  arbitrary JSON or on mutations of the vectors; T-6a's `snapshot` half covers
  amounts above 2^53 and at 2^256 - 1.
- **Not yet.** The render helpers named in [Packages](./packages.md) follow with
  the Wrapper's rendering work.
