# @intraverse/se-client-play-client

## 0.1.0

### Minor Changes

- [#59](https://github.com/IntraverseGame/se-client-kit/pull/59) [`4826f4a`](https://github.com/IntraverseGame/se-client-kit/commit/4826f4a61959f9f02511f9be339956f3e5259e0f) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document `/play/v1`: the launch-code redeem answer
  (`RedeemResponse`) now has a required `gameOrigin`, the origin to frame the game
  at, of 1 to 267 characters, and the generated `PlayApiComponents` and
  `PlayApiOperations` types carry it. `redeemLaunchCode` returns `gameOrigin` and
  throws a `ProtocolError` for an answer without it, or with one that is empty or
  longer than 267 characters. The test-only entry of `contracts` adds the
  `signed-action` Snapshot vectors (`snapshotVectors.signedAction`): a PlayerCancel
  signed by an independent signer, with its EIP-712 message, hashes, and
  signature.

- [#128](https://github.com/IntraverseGame/se-client-kit/pull/128) [`c03c309`](https://github.com/IntraverseGame/se-client-kit/commit/c03c309c4f2b20b8b423a86708f5ed2f418ff106) Thanks [@mimshins](https://github.com/mimshins)! - Sync the Play API document (`/play/v1`) to the version that adds
  `GET /play/v1/grants` (`listGrants`, with the `GrantList`, `PlayGrant` and
  `GrantId` schemas) and an optional `grantId` on the `rounds:start` request, and
  that answers a move or a cash-out with a wrong `sequence` or `previous` as 409
  `STALE_ACTION` instead of 400 `INVALID_ARGUMENT` (a cancel still answers 400).
  The generated types gain the new operation and schemas, and `PLAY_ROUTES` in
  `play-client` lists the `listGrants` route. The kit adds no client function for
  grants; the shell already resynchronizes after either code. No behavior change for the
  Wrapper.

- [#164](https://github.com/IntraverseGame/se-client-kit/pull/164) [`4d5031a`](https://github.com/IntraverseGame/se-client-kit/commit/4d5031ad817cb372c4548d9a198a95c04ad45b3b) Thanks [@amirosein-union](https://github.com/amirosein-union)! - Frame a game at the path of its page on its origin, so several games can share
  one origin. `redeemLaunchCode` returns the redeem answer's optional `gamePath`
  when it has one, and throws a `ProtocolError` for one that breaks the Play API
  document's rule (1 to 255 characters, starting and ending with `/`, segments of
  unreserved characters, never `.` or `..`). A `PlaySession`'s accepted
  `mountGame` result adds `gamePath` (`/` when the answer has none), and the
  Wrapper frames `gameOrigin` + `gamePath` with its `parentOrigin`. Origin checks
  are unchanged: messages are still matched by the game origin only.

- [#40](https://github.com/IntraverseGame/se-client-kit/pull/40) [`1fc8e5f`](https://github.com/IntraverseGame/se-client-kit/commit/1fc8e5f1f26c9596b088227205f02c6a492c75e9) Thanks [@mimshins](https://github.com/mimshins)! - Add `cancelRound` (`POST /play/v1/rounds:cancel`), which passes a signed
  `PlayerCancel` in a `RoundActionRequest` body and answers the round's Snapshot
  as `unknown`. It is never repeated (retry class `never`): a cancel is not
  answered from a log as a repeated move is, so after a lost response or a `503`
  the caller reads the Snapshot before it sends the cancel again. The vendored
  Play API document now has the `cancelRound` operation, and its generated types
  and `PlayApiOperationRoutes` include it.

- [#37](https://github.com/IntraverseGame/se-client-kit/pull/37) [`aa0cc8d`](https://github.com/IntraverseGame/se-client-kit/commit/aa0cc8ded970e44502b38c339b2bb3ce4b0348a5) Thanks [@mimshins](https://github.com/mimshins)! - Add one function per Play API operation, typed from the vendored document:
  `redeemLaunchCode` (no credential, never repeated), `refreshPlayToken`,
  `startRound`, `continueRound`, `cashOutRound`, and `getSnapshot`. A Snapshot
  answer stays `unknown`; the redeem and refresh answers are checked and typed,
  and hand the new play token to a `seal` the caller passes, returning only the
  sealed value.
  `PLAY_ROUTES` holds each operation's route, checked against the document at
  compile time. The bearer header form, the RFC 3339 deadlines, and the
  idempotency key's limits are now the document's, no longer provisional.

- [#28](https://github.com/IntraverseGame/se-client-kit/pull/28) [`43970e6`](https://github.com/IntraverseGame/se-client-kit/commit/43970e62bc126804d19da478f40f333266d01a37) Thanks [@mimshins](https://github.com/mimshins)! - Add the Play API request layer: `createTransport` (an `https:` base, request
  options with `redirect: "error"`, timeout, a caller abort signal, bounded
  retries by retry class, with a refresh bound to the old token's deadline), the
  `NetworkError`, `ProblemError`, and `ProtocolError` types with problem mapping,
  the token refresh schedule with the `Date` header clock offset, and idempotency
  keys.

- [#110](https://github.com/IntraverseGame/se-client-kit/pull/110) [`be31360`](https://github.com/IntraverseGame/se-client-kit/commit/be31360a3a2d861972e6dcc91da0782593bca499) Thanks [@mimshins](https://github.com/mimshins)! - The verify API read is added: `getRoundVerification(transport, roundId, options?)`
  reads `GET /verify/v1/rounds/{roundId}` with no credential and answers the body
  as `unknown`, with `VERIFY_ROUTES`, `verifyRoute`, `VerifyOperationId`, and
  `VerifyRoute`. Its transport is made with `verifyApiBaseUrl` as the base.

- [#95](https://github.com/IntraverseGame/se-client-kit/pull/95) [`a8c20ca`](https://github.com/IntraverseGame/se-client-kit/commit/a8c20ca78859da4e61cb0c3b00be5212ad74144d) Thanks [@mimshins](https://github.com/mimshins)! - `startRound` is no longer repeated with the same `idempotencyKey` after a start
  voided or refused before any money moved (`FUNDING_UNCONFIRMED`,
  `ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, `ROUND_VOIDED`), whatever the
  problem's `retryable`: the Play API document says to retry such a start with a
  new key. A new retry class, `start`, repeats a lost response and a retryable
  `UNAVAILABLE` only (an allow-list, so a code added later is sent once). Other
  routes' retries are unchanged.

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

- [#176](https://github.com/IntraverseGame/se-client-kit/pull/176) [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e) Thanks [@mimshins](https://github.com/mimshins)! - The Play API types follow the synced Play API document `/play/v1`: they carry
  `BookRtp` and the optional `rtp` of a book game's `config`, an optional
  `gamePath` on `RedeemLaunchCodeResponse` (the path of the game's page on
  `gameOrigin`), and the document's new descriptions. These type changes alone
  change no behavior; reading `gamePath` is its own change.
- Updated dependencies [[`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e), [`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1), [`2b1a982`](https://github.com/IntraverseGame/se-client-kit/commit/2b1a982e8827bdbd88749d64340ef33ca934dfa0), [`4826f4a`](https://github.com/IntraverseGame/se-client-kit/commit/4826f4a61959f9f02511f9be339956f3e5259e0f), [`f2b3690`](https://github.com/IntraverseGame/se-client-kit/commit/f2b369010acc61ed932c2328ce5056dd356886b0), [`0d964fa`](https://github.com/IntraverseGame/se-client-kit/commit/0d964fad42c890611989e759f8ecff20bc9fcc42), [`5478f4c`](https://github.com/IntraverseGame/se-client-kit/commit/5478f4c6db5aca9ee8680454e6e591bbbba3c62a), [`c6162ca`](https://github.com/IntraverseGame/se-client-kit/commit/c6162ca4a4c771ae5de67c67d56b810e71ab0fd5), [`1a33fea`](https://github.com/IntraverseGame/se-client-kit/commit/1a33feaea15981a4db587150c7eaca46573f77db), [`c03c309`](https://github.com/IntraverseGame/se-client-kit/commit/c03c309c4f2b20b8b423a86708f5ed2f418ff106), [`c915675`](https://github.com/IntraverseGame/se-client-kit/commit/c915675038470fc5d3519a945f1771d5c9020bb4), [`010c2ff`](https://github.com/IntraverseGame/se-client-kit/commit/010c2ffe69c2ea66c4a947ae9947dca8e6580467), [`da6b4b0`](https://github.com/IntraverseGame/se-client-kit/commit/da6b4b0bc3a88c547ab549376ccc778dd18c8f38), [`0cbc2e4`](https://github.com/IntraverseGame/se-client-kit/commit/0cbc2e4c852c1bfba2cb6719c1aee953af30476a), [`be31360`](https://github.com/IntraverseGame/se-client-kit/commit/be31360a3a2d861972e6dcc91da0782593bca499), [`1b4fb2f`](https://github.com/IntraverseGame/se-client-kit/commit/1b4fb2f1544591b287b00214b7387c8a4cfe0a13), [`1fc8e5f`](https://github.com/IntraverseGame/se-client-kit/commit/1fc8e5f1f26c9596b088227205f02c6a492c75e9), [`02012a7`](https://github.com/IntraverseGame/se-client-kit/commit/02012a7f8a02e813d90ce1b6503f6575ed470da8)]:
  - @intraverse/se-client-contracts@0.1.0
