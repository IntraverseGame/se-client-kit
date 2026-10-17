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
  <!-- TODO(Play API): the carrier of the capability declaration. See rfcs/active/RFC-001-operator-launch-contract.md (draft), Q9: the Snapshot's variant negotiation, backend-owned and pending. -->
- **W-31.** Statuses. The Wrapper MUST handle each as follows:

  | `status`    | The Wrapper shows                                                                                                                                                                                                                                                                                                           | Input                                                      |
  | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
  | `idle`      | the bet selector (`bet.suggestedBets`, defaulting to `bet.defaultBet`, within `minBet` and `maxBet`) and the start button, the balance. A typed error from the call that led here (a void) shows beside it                                                                                                                  | start enabled                                              |
  | `starting`  | "preparing the round"; the game is not shown as ready; the shell is verifying (W-26)                                                                                                                                                                                                                                        | none; cancel is not offered                                |
  | `active`    | the game, ready, only after W-26 passed; the multiplier; cash-out when allowed                                                                                                                                                                                                                                              | game picks, cash-out, cancel (if the game offers it, W-25) |
  | `resolving` | the game with inputs disabled, "resolving"                                                                                                                                                                                                                                                                                  | none                                                       |
  | `won`       | the result, the payout as `formatted`, the round id and verify link (W-39)                                                                                                                                                                                                                                                  | a new round                                                |
  | `lost`      | the result, the round id and verify link                                                                                                                                                                                                                                                                                    | a new round                                                |
  | `canceled`  | "round canceled, your bet was returned", the round id and verify link, and with `closeReason: "expired"` the words "the time limit ended this round". `canceled` is final, also after the shell's own cancel; until the cancel is answered the round is `resolving` and the cancel `settling` or `check-later` (W-25, W-33) | a new round                                                |
  | typed error | per [error and degraded states](../wrapper.md#error-and-degraded-states)                                                                                                                                                                                                                                                    | per code                                                   |

  <!-- TODO(Snapshot contract): `won` shows "the payout as `formatted`", but `se.snapshot/1` carries no payout today. The backend will add an optional, server-computed `payout` `Amount` (with `formatted`) on terminal statuses in a later re-vendor; `bankedAmount` is reserved for partial cash-out, is not served, and is not used. Until then the Wrapper shows no amount on `won`, and it never computes one from `currentMultiplier` or anything else (W-34). -->

  How the Wrapper reads the shell's checks for this table (the round the shell
  holds, W-26): an `active` round is shown as "preparing the round", with the
  note that it is being checked, until the shell's verdict is `ready`; then it
  is shown ready, with the game. A failed verdict shows "this round failed
  verification" or "could not verify the chain" (W-26a), and an out-of-sync
  round its state (W-44), in place of the round until it is over. A round the
  shell does not hold (one resumed from `ROUND_ACTIVE`, W-42) is shown as its
  status gives it, with no game and no control. The cash-out control is shown
  only when the shell offers it (W-24: `active`, `ready`, at least one step
  survived and one left, nothing in flight).

- **W-32.** `won` is final. The Wrapper MUST NOT show or wait for the operator
  credit. The balance it shows is the Snapshot's `bet.balance.formatted`.
- **W-33.** `closeReason: "expired"` is shown next to the status and is not a
  status. A `canceled` Snapshot is final, with or without `closeReason`, also
  when it answers the shell's own cancel or settles it (W-25, the Snapshot
  contract `se.snapshot/1` as vendored from b27afc5); with
  `closeReason: "expired"` the time limit had closed the round first, and it is
  shown as the round's result with no error. After the shell's own cancel, the
  Wrapper shows the cancel state (W-25):
  - `in-flight` and `settling`: the round as it was before the cancel (for the
    required cancel, "this round failed verification", W-26), with inputs
    disabled while a `resolving` read shows it, and no result, no "your bet was
    returned", and no new-round control;
  - `check-later`: "still resolving — contact support", with the round id and
    the verify link (W-39) and a "check again" control, and still no result, no
    "your bet was returned", and no new-round control (the message copy comes
    with the Wrapper's wiring);
  - `ended`: a neutral "round ended" with the round id and the verify link, no
    win, loss, refund, or bet-returned amount, and no result claim; the balance
    is the Snapshot's as usual (W-32), and a new round may start;
    <!-- TODO(Snapshot contract): the planned read of the last round shows its real result; show it then instead of "round ended". -->
  - `not-taken`: "this round failed verification" (W-26), the round open until
    its expiry rule closes it, whether the answer or a read showed `active`.
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
  Whether a round is over is decided in one place, the shell's `isRoundOver`,
  which the Wrapper's polling and rendering read; the Wrapper keeps no status
  list of its own. From a Snapshot alone, `canceled` is final, with or without a
  `closeReason` (W-25); while the shell's own cancel is not settled, the round
  flow's cancel state decides instead (below). While the shell's cancel is
  `settling` (W-25), the Wrapper also polls, through the round flow's `refresh`,
  with the same backoff and slow rate, whatever the status of the round's last
  Snapshot; a read with no response, another round's Snapshot, or `resolving`
  does not stop it; a final read (`canceled`, `won`, `lost`), `active`, or
  `idle` settles the cancel. The shell counts these reads; after 30 it reports
  `check-later`, and the Wrapper stops the fast poll and shows "still resolving
  — contact support" (W-33). In `check-later` the Wrapper reads once when the
  player asks to check again (the flow's `checkAgain`), and once every 30 s in
  the background until the session ends (Wrapper configuration; time comes from
  the Wrapper's injected timers, never the shell). Either read may settle the
  cancel, after which polling follows the round's status as usual.
- **W-36.** Idempotency. Each player intent (start, a move, cash-out, cancel)
  gets one `idempotencyKey` (`crypto.randomUUID()`), reused for every retry of
  that intent and never for another.
