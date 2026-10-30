# @intraverse/se-client-contracts

## 0.1.0

### Minor Changes

- [#176](https://github.com/IntraverseGame/se-client-kit/pull/176) [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Snapshot schema `se.snapshot/1` and the Snapshot vectors to the
  version with a book round's status flow ([#146](https://github.com/IntraverseGame/se-client-kit/issues/146)). The schema refuses a `playback`
  Snapshot whose `status` is `active`, `resolving`, or `canceled`: a book round
  shows `idle`, `starting` (no `proofs`, then `randomnessProof` once bound), then
  `won` or `lost`. Its descriptions also state that a session keeps one
  `presentation`, `config.kind`, and `config.model`; the generated types change
  only in those descriptions. The test-only entry adds one book round of one
  session, the valid vectors `book-lifecycle-idle` (with `config.rtp`),
  `book-lifecycle-starting-funded`, `book-lifecycle-starting-bound`, and
  `book-lifecycle-lost`, and the invalid vectors `book-status-active`,
  `book-status-resolving`, and `book-status-canceled`. The valid vector
  `book-playback-resolving-placeholder`, which the new schema refuses, is
  removed: a pre-release change of a vendored vector, made at its source, which
  replaced it with the `invalid/book-status-*` vectors. The vectors are then
  synced to the backend's follow-up: `book-lifecycle-won`, the same round's
  `won` ending (payout 200), is added; `invalid/blindness-draw-before-resolution`,
  `invalid/blindness-draw-on-canceled`, and `invalid/create-round-auth-on-book`,
  which the status rule made fail first at `/status`, are removed, and
  `invalid/blindness-draw-before-resolution-starting` and
  `invalid/create-round-auth-on-book-starting` replace two of them with one
  failure each.
  
  The Play API document `/play/v1` and the verify API document `/verify/v1` are
  synced too. `PlayApiComponents` gains `BookRtp` and the optional
  `rtp` of `BookConfig`; the Play document's descriptions state the book status
  flow, the one presentation per session, and that `INSUFFICIENT_FUNDS`,
  `LIMIT_EXCEEDED`, and `PLAYER_RESTRICTED` (422) name a book round's refused
  debit. `PlayApiComponents` also gains the optional `gamePath` of
  `RedeemResponse` (the path of the game's page on `gameOrigin`; absent reads as
  `/`). `VerifyApiComponents` gains the optional `book` of `RoundVerification`
  (`BookVerification`) and `draw` of `Recomputation` (`DrawnRow`). No public type
  name is added.

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

- [#59](https://github.com/IntraverseGame/se-client-kit/pull/59) [`4826f4a`](https://github.com/IntraverseGame/se-client-kit/commit/4826f4a61959f9f02511f9be339956f3e5259e0f) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document `/play/v1`: the launch-code redeem answer
  (`RedeemResponse`) now has a required `gameOrigin`, the origin to frame the game
  at, of 1 to 267 characters, and the generated `PlayApiComponents` and
  `PlayApiOperations` types carry it. `redeemLaunchCode` returns `gameOrigin` and
  throws a `ProtocolError` for an answer without it, or with one that is empty or
  longer than 267 characters. The test-only entry of `contracts` adds the
  `signed-action` Snapshot vectors (`snapshotVectors.signedAction`): a PlayerCancel
  signed by an independent signer, with its EIP-712 message, hashes, and
  signature.

- [#36](https://github.com/IntraverseGame/se-client-kit/pull/36) [`1a33fea`](https://github.com/IntraverseGame/se-client-kit/commit/1a33feaea15981a4db587150c7eaca46573f77db) Thanks [@mimshins](https://github.com/mimshins)! - The Play API document (`/play/v1`) is vendored, and its generated types are
  public: `PlayApiPaths`, `PlayApiOperations`, `PlayApiComponents`, and
  `PlayApiOperationRoutes`. The
  Snapshot schema `se.snapshot/1` is synced to the version with
  `proofs.createRoundAuth` (required on a config Snapshot that carries `proofs`,
  a one-time pre-release exception to additive-only) and
  `proofs.fairnessProof.readyHash`, and `UNAVAILABLE` may now carry
  `retryable: false`. New public types: `Address`, `CreateRoundAuth`, `NewRound`,
  `RegistryDomain`, `Signature65`, `Uint128`, and `Uint256`.

- [#128](https://github.com/IntraverseGame/se-client-kit/pull/128) [`c03c309`](https://github.com/IntraverseGame/se-client-kit/commit/c03c309c4f2b20b8b423a86708f5ed2f418ff106) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document (`/play/v1`) to the version that adds
  `GET /play/v1/grants` (`listGrants`, with the `GrantList`, `PlayGrant` and
  `GrantId` schemas) and an optional `grantId` on the `rounds:start` request, and
  that answers a move or a cash-out with a wrong `sequence` or `previous` as 409
  `STALE_ACTION` instead of 400 `INVALID_ARGUMENT` (a cancel still answers 400).
  The generated types gain the new operation and schemas, and `PLAY_ROUTES` in
  `play-client` lists the `listGrants` route. The kit adds no client function for
  grants; the shell already resynchronizes after either code. No behavior change for the
  Wrapper.

- [#89](https://github.com/IntraverseGame/se-client-kit/pull/89) [`010c2ff`](https://github.com/IntraverseGame/se-client-kit/commit/010c2ffe69c2ea66c4a947ae9947dca8e6580467) Thanks [@amirosein-union](https://github.com/amirosein-union)! - Sync the signing vectors of the contracts repository's release `1.0.0`
  (`test/vectors/signing.json`). The test-only entry (`signingVectors`) adds a
  `PlayerCancel` entry in `types`, `payoutTerms` (six named terms with their
  hashes), and `closes` (nine full rounds, one per way a round ends, each ending
  in `closed`, or in `canceled` for the player's cancel). The older fields are
  unchanged.

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

- [#110](https://github.com/IntraverseGame/se-client-kit/pull/110) [`be31360`](https://github.com/IntraverseGame/se-client-kit/commit/be31360a3a2d861972e6dcc91da0782593bca499) Thanks [@mimshins](https://github.com/mimshins)! - The verify API document (`/verify/v1`, `GET /verify/v1/rounds/{roundId}`) is
  vendored, and its generated types are public: `VerifyApiPaths`,
  `VerifyApiOperations`, `VerifyApiComponents`, and `VerifyApiOperationRoutes`.

- [#40](https://github.com/IntraverseGame/se-client-kit/pull/40) [`1fc8e5f`](https://github.com/IntraverseGame/se-client-kit/commit/1fc8e5f1f26c9596b088227205f02c6a492c75e9) Thanks [@mimshins](https://github.com/mimshins)! - Add `cancelRound` (`POST /play/v1/rounds:cancel`), which passes a signed
  `PlayerCancel` in a `RoundActionRequest` body and answers the round's Snapshot
  as `unknown`. It is never repeated (retry class `never`): a cancel is not
  answered from a log as a repeated move is, so after a lost response or a `503`
  the caller reads the Snapshot before it sends the cancel again. The vendored
  Play API document now has the `cancelRound` operation, and its generated types
  and `PlayApiOperationRoutes` include it.

- [#50](https://github.com/IntraverseGame/se-client-kit/pull/50) [`02012a7`](https://github.com/IntraverseGame/se-client-kit/commit/02012a7f8a02e813d90ce1b6503f6575ed470da8) Thanks [@mimshins](https://github.com/mimshins)! - Add `encodeTypedData`, with the types `TypedDataFields` and `TypedDataKind`:
  the canonical bytes of a move's, a cash-out's, or a cancel's typed data
  (`ActionTypedData`), which a signed action sends as `typedData` in base64. The
  fields are written in number order and an empty path is left out; an unknown
  kind, an empty action, an action with a lone surrogate, a path entry outside
  `uint8`, a cancel with a path, a
  sequence of 0 or outside `uint32`, and a `previous` that is not 32 bytes are
  refused with `invalid-input`, whose fixed message is now "a value does not fit
  its field type". The
  backend's `typed-data` Snapshot vectors are vendored in `contracts` (test-only
  entry, `snapshotVectors.typedData`) and replay byte for byte.

### Patch Changes

- [#83](https://github.com/IntraverseGame/se-client-kit/pull/83) [`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document `/play/v1` (from se-backend `b47b286`, then
  `65504f5`): the cancel's description now says that
  when the engine had already closed the round before the cancel arrived (a final
  move whose answer was lost, or the time limit), the round ends as the engine
  closed it and the cancel is never honored. The answer is the round's Snapshot
  with no error: `won` or `lost` with its `payout`, or `canceled` with
  `closeReason: "expired"` (the bet refunded); a read after `resolving` can end on
  those too, that after a lost response, `UNAVAILABLE`, or `INTERNAL` the cancel
  may already have been taken (read the Snapshot before sending it again), and
  that a round the engine cannot settle on its own stays `resolving` until it is
  resolved manually. The Snapshot read's description now says that the round and
  `bet.balance` are read separately, so `bet.balance` may be newer than the
  round, and the next read shows both. No schema, field, or status changed; the
  generated types change only in their doc comments. The doc comments of
  `play-client`'s `cancelRound` and `getSnapshot` follow; their behaviour is
  unchanged.

- [#177](https://github.com/IntraverseGame/se-client-kit/pull/177) [`f2b3690`](https://github.com/IntraverseGame/se-client-kit/commit/f2b369010acc61ed932c2328ce5056dd356886b0) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Snapshot schema `se.snapshot/1` and the Snapshot vectors to the
  version in which every invalid vector breaks only its own rule. The schema's
  `idle` rule rejects `proofs` at `/proofs` only, no longer also at the document
  itself; validity is unchanged, so an idle Snapshot with `proofs` is still
  refused, and a validator that reports every issue now reports one fewer for it.
  In the test-only entry, the invalid vector
  `presentation-playback-with-config-model` (a config round at `resolving`, which
  also failed at `/status` and `/proofs`) is removed and
  `presentation-playback-with-config-model-starting` (the same rule on a
  `starting` round, failing only at `/model`) is added: a pre-release change of a
  vendored vector, made at its source. No other vector changed, and the generated
  types did not change.

- [#180](https://github.com/IntraverseGame/se-client-kit/pull/180) [`0d964fa`](https://github.com/IntraverseGame/se-client-kit/commit/0d964fad42c890611989e759f8ecff20bc9fcc42) Thanks [@mimshins](https://github.com/mimshins)! - Vendor four more public vector sets of the SuperEngine fairness kernel,
  kernelVersion 1, on the test-only entry (`kernelVectors.v1`):
  `round-secret-hash`, `coin-flip-payout`, `weighted-draw`, and `book-draw`. The
  four earlier sets are unchanged. Sync the verify API document (`/verify/v1`) to
  the version whose `kernel.vectorSets` example lists all eight sets; no schema
  change, and the generated types differ only in that doc comment.

- [#81](https://github.com/IntraverseGame/se-client-kit/pull/81) [`5478f4c`](https://github.com/IntraverseGame/se-client-kit/commit/5478f4c6db5aca9ee8680454e6e591bbbba3c62a) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document `/play/v1`: the Snapshot read's description now says
  that it answers the session's most recent round, ended rounds included (a `won`
  or `lost` one with its `payout`), until the next `rounds:start`, and that `idle`
  means no round has ended since that start (no round yet, or the last one voided
  or refused, whose reason the start's own answer carries). The cancel's
  description now says a read after `resolving` shows `canceled` or `active`, and
  that the round stays the session's last round once it has ended. No schema,
  field, or status changed; the generated types change only in their doc comments.
  The doc comments of `play-client`'s `getSnapshot` and `cancelRound` follow; their
  behaviour is unchanged.

- [#152](https://github.com/IntraverseGame/se-client-kit/pull/152) [`c6162ca`](https://github.com/IntraverseGame/se-client-kit/commit/c6162ca4a4c771ae5de67c67d56b810e71ab0fd5) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Snapshot vectors `se.snapshot/1` to the version with a Cash or Crash
  round won on its last row. The test-only entry adds one Cash or Crash `[3,3,4]`
  round played through its last row on one signed chain: the valid Snapshot
  vectors `cashorcrash-last-row-active-step0`, `cashorcrash-last-row-active-step1`,
  `cashorcrash-last-row-active-step2`, and `cashorcrash-last-row-won` (payout
  289), and the typed-data vectors `cashorcrash-last-row-pick-row0`,
  `cashorcrash-last-row-pick-row1`, and `cashorcrash-last-row-pick-row2`, each
  pick's `previous` the struct hash of the one before it. The round ends `won` on
  its last pick, so no cash-out or signed-action vector follows it. The schema,
  the Play API document, and the generated types did not change, and no vendored
  vector changed.

- [#60](https://github.com/IntraverseGame/se-client-kit/pull/60) [`c915675`](https://github.com/IntraverseGame/se-client-kit/commit/c915675038470fc5d3519a945f1771d5c9020bb4) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document `/play/v1`: the cancel's description now says that
  `canceled` is final, that a cancel the engine has not answered yet is answered
  `resolving` (read the Snapshot again), and that a cancel of a round still
  `resolving` is `FAILED_PRECONDITION`. No schema, field, or status changed; the
  generated types change only in their doc comments. The test-only entry of
  `contracts` adds the valid Snapshot vector
  `snapshotVectors.valid["coinflip-resolving-cancel"]`: a Coin Flip round whose
  cancel is waiting for the engine's answer. The doc comment of `play-client`'s
  `cancelRound` now lists these answers; its behaviour is unchanged.

- [#90](https://github.com/IntraverseGame/se-client-kit/pull/90) [`0cbc2e4`](https://github.com/IntraverseGame/se-client-kit/commit/0cbc2e4c852c1bfba2cb6719c1aee953af30476a) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document `/play/v1` (from se-backend `075b850`): the start's
  description now says that after a lost response, `UNAVAILABLE`, or `INTERNAL`
  the round may already have been started, and the same key and body answer it,
  so sending them again is safe; the move's description (which the cash-out
  follows) says the same of the move, and of the same request (key and signed
  action). A resend may fail the same way, and `GET /play/v1/snapshot` shows the
  round either way. No schema, route, field, or status changed; the generated
  types change only in their doc comments. The doc comments of `play-client`'s
  `startRound`, `continueRound`, and `cashOutRound` follow; their behaviour is
  unchanged.

- [#126](https://github.com/IntraverseGame/se-client-kit/pull/126) [`1b4fb2f`](https://github.com/IntraverseGame/se-client-kit/commit/1b4fb2f1544591b287b00214b7387c8a4cfe0a13) Thanks [@mimshins](https://github.com/mimshins)! - Sync the verify API document (`/verify/v1`) to the version with a clearer
  description of the round's `payout` (the game's payout, the value the
  recomputation reproduces) and a fuller `kernel.vectorSets` example that lists
  the `shuffle-draw` set. No schema change: the generated types differ only in a
  doc comment.
