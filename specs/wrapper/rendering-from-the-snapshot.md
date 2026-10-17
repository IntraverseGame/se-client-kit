# Rendering from the Snapshot

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-28.** The Wrapper MUST render only from a Snapshot that passed the
  `snapshot` package's validation against `se.snapshot/1` (the schema's keyword
  profile, with the golden vectors). A response that fails validation MUST NOT
  be rendered or forwarded to the game: the Wrapper shows the generic error
  state and logs the schema path of the first failure, never the document.
- **W-29.** The Snapshot is the only source of round state. The Wrapper MUST NOT
  infer hidden state from an absent field, and MUST ignore a Snapshot whose
  `version` is lower than the last one it accepted for the session (a stale
  response). It is a tolerant reader only within what the schema allows: an
  optional field the schema lists may be absent, and a field the schema leaves
  open (`context.view`, `theme.colorPalette`, `theme.tileStyles`, a book event's
  `data`) may hold members the Wrapper does not read, which it ignores. A field,
  `status`, or value the schema does not allow fails validation (W-28): every
  object of `se.snapshot/1` is closed (the allow-list), so a new field or status
  reaches the Wrapper only with a kit that has synced the new schema. The
  Wrapper also ignores a Snapshot whose `version` equals the last accepted one
  (it carries nothing new).
- **W-30.** The Wrapper MUST declare its capabilities when the session starts:
  presentations `["steps"]` and every `RoundStatus` it handles (all seven: the
  six of R3 and `canceled`, which the cancel path needs).
  <!-- TODO(Play API): the carrier of the capability declaration. -->
- **W-31.** Statuses. The Wrapper MUST handle each as follows:

  | `status`    | The Wrapper shows                                                                                                                                                                                          | Input                                                      |
  | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
  | `idle`      | the bet selector (`bet.suggestedBets`, defaulting to `bet.defaultBet`, within `minBet` and `maxBet`) and the start button, the balance. A typed error from the call that led here (a void) shows beside it | start enabled                                              |
  | `starting`  | "preparing the round"; the game is not shown as ready; the shell is verifying (W-26)                                                                                                                       | none; cancel is not offered                                |
  | `active`    | the game, ready, only after W-26 passed; the multiplier; cash-out when allowed                                                                                                                             | game picks, cash-out, cancel (if the game offers it, W-25) |
  | `resolving` | the game with inputs disabled, "resolving"                                                                                                                                                                 | none                                                       |
  | `won`       | the result, the payout as `formatted`, the round id and verify link (W-39)                                                                                                                                 | a new round                                                |
  | `lost`      | the result, the round id and verify link                                                                                                                                                                   | a new round                                                |
  | `canceled`  | "round canceled, your bet was returned", the round id and verify link, and with `closeReason: "expired"` the words "the time limit ended this round"                                                       | a new round                                                |
  | typed error | per [error and degraded states](../wrapper.md#error-and-degraded-states)                                                                                                                                   | per code                                                   |

  <!-- TODO(Snapshot contract): `won` shows "the payout as `formatted`", but `se.snapshot/1` has no payout `Amount` on `won` (no golden vector carries `bankedAmount`). The Wrapper shows `bankedAmount.formatted` when present and no payout line otherwise; it never computes one from a multiplier (W-34). -->

- **W-32.** `won` is final. The Wrapper MUST NOT show or wait for the operator
  credit. The balance it shows is the Snapshot's `bet.balance.formatted`.
- **W-33.** `closeReason: "expired"` is shown next to the status and is not a
  status.
- **W-34.** Money: the Wrapper MUST read `Amount.value` as a string and use
  `BigInt` for any comparison (for example the bet against the balance), and
  MUST display `Amount.formatted`. It MUST NOT compute money from `normalized`
  or from a multiplier, and MUST NOT use a floating-point number for an amount.
- **W-35.** While the status is `starting` or `resolving`, the Wrapper MUST poll
  the Snapshot read (no WebSocket in the first release) with bounded backoff
  (SHOULD: 500 ms rising to 2 s, Wrapper configuration) until the status
  changes, and MUST keep polling at the slow rate after a longer wait, with a
  "taking longer than expected" notice. It MUST stop polling when the status is
  terminal or the session ended. The Wrapper doubles the wait after each read
  (500 ms, 1 s, 2 s, then 2 s); the slow rate is that 2 s maximum, also used
  after a read with no response (W-43). PROVISIONAL: the "longer wait" before
  the notice is 15 s (W-43's request timeout) until this spec gives a number. A
  poll stops in every status but `starting` and `resolving`, on a typed error
  (until the player asks to try again), and in any blocking state (W-44).
- **W-36.** Idempotency. Each player intent (start, a move, cash-out, cancel)
  gets one `idempotencyKey` (`crypto.randomUUID()`), reused for every retry of
  that intent and never for another.
