# @intraverse/se-client-snapshot

## 0.1.0

### Minor Changes

- [#149](https://github.com/IntraverseGame/se-client-kit/pull/149) [`2b1a982`](https://github.com/IntraverseGame/se-client-kit/commit/2b1a982e8827bdbd88749d64340ef33ca934dfa0) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Snapshot vectors and the Snapshot schema `se.snapshot/1` to the
  version with the Cash or Crash cash-out vectors. The test-only entry adds one
  Cash or Crash `[3,3,4]` round played to a cash-out on one signed chain: the
  valid Snapshot vectors `cashorcrash-cash-out-active-step0`,
  `cashorcrash-cash-out-active-step1`, `cashorcrash-cash-out-resolving`, and
  `cashorcrash-cash-out-won` (payout 145), the typed-data vectors
  `cashorcrash-pick` and `cashorcrash-cash-out`, and the signed-action vector
  `cashorcrash-cash-out`, a `PlayerCashOut` signed with the same public test key
  as `coinflip-cancel`. The schema gains an optional `rtp` on a book game's
  `config` (`fraction`, the exact return to player as a reduced fraction of 1,
  and `decimal`, a display value rounded down to 4 places); the generated
  `BookConfig` type carries it, the new `BookRtp` type is exported, and `@intraverse/se-client-snapshot` validates it
  as the schema says. The test-only entry adds the valid vector
  `book-playback-won-rtp` and the invalid ones `book-rtp-decimal-above-one`,
  `book-rtp-decimal-missing`, `book-rtp-decimal-number`,
  `book-rtp-decimal-two-places`, and `book-rtp-fraction-decimal`. No vendored
  vector changed.

- [#77](https://github.com/IntraverseGame/se-client-kit/pull/77) [`da6b4b0`](https://github.com/IntraverseGame/se-client-kit/commit/da6b4b0bc3a88c547ab549376ccc778dd18c8f38) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Snapshot schema `se.snapshot/1` and the Play API document `/play/v1`
  to the version with the Snapshot's top-level `payout`: an optional `Amount`,
  computed by the server, that a `won` or `lost` round carries (0 when nothing is
  credited) and that `idle`, `starting`, `active`, `resolving`, and `canceled`
  never carry. The generated `Snapshot` and `PlayApiComponents` types gain
  `payout`; no public type name is added (the generator's copy of `Amount` for
  `payout`, `Amount1`, is not exported). `@intraverse/se-client-snapshot`
  validates against the synced schema: `payout` is accepted on `won` and `lost`
  and refused on every other status. The test-only entry of `contracts` adds the
  valid Snapshot vectors `coinflip-won-payout`, `coinflip-lost-payout-zero`,
  `cashorcrash-won-cashout-payout`, `cashorcrash-won-expired-payout`,
  `steps-lost-expired-payout`, and `book-playback-won-payout`, and the invalid
  ones `payout-on-idle`, `payout-on-starting`, `payout-on-active`,
  `payout-on-resolving`, `payout-on-canceled`, and `payout-value-number`.

- [#176](https://github.com/IntraverseGame/se-client-kit/pull/176) [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e) Thanks [@mimshins](https://github.com/mimshins)! - `validateSnapshot` and `validatePlayProblem` follow the synced `se.snapshot/1`
  schema: a `playback` (book) Snapshot at `active`, `resolving`, or `canceled`,
  on its own or embedded in a typed error, is now refused, with its first issue
  at `/status` (`/snapshot/status` in a typed error). A `steps` Snapshot at those
  statuses is validated as before. The validator's code is unchanged; the rule is
  the schema's.

- [#36](https://github.com/IntraverseGame/se-client-kit/pull/36) [`1a33fea`](https://github.com/IntraverseGame/se-client-kit/commit/1a33feaea15981a4db587150c7eaca46573f77db) Thanks [@mimshins](https://github.com/mimshins)! - Validate against the synced `se.snapshot/1` schema: `proofs.createRoundAuth`
  and `proofs.fairnessProof.readyHash` are accepted, and a config Snapshot that
  carries `proofs` without a `createRoundAuth` is refused. `RetryableProblem`
  types `UNAVAILABLE` with either `retryable` value. Within a schema object the
  evaluator now evaluates `not` after its siblings, so an issue that names a
  member comes first.

- [#27](https://github.com/IntraverseGame/se-client-kit/pull/27) [`c610fb5`](https://github.com/IntraverseGame/se-client-kit/commit/c610fb5e00c19202e74c047da8624222773b51a2) Thanks [@mimshins](https://github.com/mimshins)! - The first API: `validateSnapshot`, `validatePlayProblem`, and `validateAmountRequest`, a hand-written evaluator over the `se.snapshot/1` keyword profile that never throws and returns location-only issues; `ValidSnapshot` and `ValidPlayProblem`, narrowed by `status` and `code`; `isStepsPresentation` and `isPlaybackPresentation`; and `parseBaseUnits` and `compareAmounts`, which read amounts as `bigint`.

### Patch Changes

- [#177](https://github.com/IntraverseGame/se-client-kit/pull/177) [`f2b3690`](https://github.com/IntraverseGame/se-client-kit/commit/f2b369010acc61ed932c2328ce5056dd356886b0) Thanks [@mimshins](https://github.com/mimshins)! - `validateSnapshot` follows the synced `se.snapshot/1` schema: an idle Snapshot
  with `proofs` now reports its issue at `/proofs` only, no longer also at the
  document. Validity and the first issue are unchanged. The validator's code is
  unchanged; the rule is the schema's.

- [#85](https://github.com/IntraverseGame/se-client-kit/pull/85) [`5640638`](https://github.com/IntraverseGame/se-client-kit/commit/56406380eadf19b5067ec4889e6343010593a0ec) Thanks [@mimshins](https://github.com/mimshins)! - The per-status types of a validated Snapshot now say `payout?: never` on
  `idle`, `starting`, `active`, `resolving`, and `canceled`, as the
  `se.snapshot/1` schema does: `payout` is allowed on `won` and `lost` only. The
  validator is unchanged.
- Updated dependencies [[`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e), [`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1), [`2b1a982`](https://github.com/IntraverseGame/se-client-kit/commit/2b1a982e8827bdbd88749d64340ef33ca934dfa0), [`4826f4a`](https://github.com/IntraverseGame/se-client-kit/commit/4826f4a61959f9f02511f9be339956f3e5259e0f), [`f2b3690`](https://github.com/IntraverseGame/se-client-kit/commit/f2b369010acc61ed932c2328ce5056dd356886b0), [`0d964fa`](https://github.com/IntraverseGame/se-client-kit/commit/0d964fad42c890611989e759f8ecff20bc9fcc42), [`5478f4c`](https://github.com/IntraverseGame/se-client-kit/commit/5478f4c6db5aca9ee8680454e6e591bbbba3c62a), [`c6162ca`](https://github.com/IntraverseGame/se-client-kit/commit/c6162ca4a4c771ae5de67c67d56b810e71ab0fd5), [`1a33fea`](https://github.com/IntraverseGame/se-client-kit/commit/1a33feaea15981a4db587150c7eaca46573f77db), [`c03c309`](https://github.com/IntraverseGame/se-client-kit/commit/c03c309c4f2b20b8b423a86708f5ed2f418ff106), [`c915675`](https://github.com/IntraverseGame/se-client-kit/commit/c915675038470fc5d3519a945f1771d5c9020bb4), [`010c2ff`](https://github.com/IntraverseGame/se-client-kit/commit/010c2ffe69c2ea66c4a947ae9947dca8e6580467), [`da6b4b0`](https://github.com/IntraverseGame/se-client-kit/commit/da6b4b0bc3a88c547ab549376ccc778dd18c8f38), [`0cbc2e4`](https://github.com/IntraverseGame/se-client-kit/commit/0cbc2e4c852c1bfba2cb6719c1aee953af30476a), [`be31360`](https://github.com/IntraverseGame/se-client-kit/commit/be31360a3a2d861972e6dcc91da0782593bca499), [`1b4fb2f`](https://github.com/IntraverseGame/se-client-kit/commit/1b4fb2f1544591b287b00214b7387c8a4cfe0a13), [`1fc8e5f`](https://github.com/IntraverseGame/se-client-kit/commit/1fc8e5f1f26c9596b088227205f02c6a492c75e9), [`02012a7`](https://github.com/IntraverseGame/se-client-kit/commit/02012a7f8a02e813d90ce1b6503f6575ed470da8)]:
  - @intraverse/se-client-contracts@0.1.0
