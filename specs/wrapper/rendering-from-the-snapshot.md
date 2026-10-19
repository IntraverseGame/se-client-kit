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
  (it carries nothing new). **Interim limit.** Until the backend's per-session
  counter lands, `version` is not yet the monotonic counter the Play API
  document and the Snapshot schema describe: a later read can carry a lower
  `version` than the one last shown. The Wrapper drops it as above: it is
  neither an error nor newer state, and a later read shows the current state.
  Where a poll runs, a drop delays a newer balance or status by one read; where
  none runs (an action's answer to an `active` round, or the start's answer from
  an ended round), the Wrapper reads the Snapshot again until a read is taken
  (W-35's re-read after a drop), so the state it shows catches up.
- **W-30.** The Wrapper MUST declare its capabilities when the session starts:
  presentations `["steps"]` and every `RoundStatus` it handles (all seven: the
  six of R3 and `canceled`, which the cancel path needs).
  - **The carrier** (decided 2026-10-18, RFC-001 Q9, agreed by the backend's
    TPO; specified in the backend's documentation at commit b6e1e48). The
    declaration is the backend's Snapshot negotiation, never the operator
    handshake (`se.operator/1` carries no capability): an optional
    `capabilities` object on the `sessions:redeem` request body, beside
    `launchCode`, declared once per session. It is specified, not built. The
    redeem request body is a closed object today, and the vendored Play API
    document (`play/v1`, b27afc5, the same as at b6e1e48) does not list the
    field, so a client that sent it would be refused. The kit sends nothing
    until the vendored Play API document defines the field. The backend adds it
    with the first Snapshot variant (a new `RoundStatus`, or `se.snapshot/2`),
    with no date.
  - **The statuses `se.snapshot/1` defines need no declaration**: a session that
    declares nothing gets `/1` with all of them. Only a status added later waits
    for a declaration (b6e1e48).
  - **Until then the Wrapper fails closed.** A status outside the schema fails
    validation (W-28), and a presentation the Wrapper does not render
    (`playback`) is valid but never forwarded to the game.
  <!-- TODO(Play API): vendor the Play API document once it carries the optional `capabilities` object of the `sessions:redeem` request (specified at b6e1e48, not built), then send W-30's declaration in it. -->
- **W-31.** Statuses. The Wrapper MUST handle each as follows:

  | `status`                                   | The Wrapper shows                                                                                                                                                                                                                                                                                                           | Input                                                                       |
  | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
  | `idle`                                     | the bet selector (`bet.suggestedBets`, defaulting to `bet.defaultBet`, within `minBet` and `maxBet`) and the start button, the balance. A typed error from the call that led here (a void) shows beside it                                                                                                                  | start enabled                                                               |
  | `starting`                                 | "preparing the round"; the game is not shown as ready; the shell is verifying (W-26)                                                                                                                                                                                                                                        | none; cancel is not offered                                                 |
  | `active`                                   | the game, ready, only after W-26 passed; the multiplier; cash-out when allowed                                                                                                                                                                                                                                              | game picks, cash-out, cancel (if the game offers it, W-25)                  |
  | `active`, a move or cash-out not confirmed | "your move hasn't been confirmed" (or "your cash-out hasn't been confirmed"), "if it never arrives, the round ends by its time limit", the round id, and "check again" in place of the round; the game stays shown, waiting (W-16)                                                                                          | "check again" (a read only); no pick, no cash-out                           |
  | `resolving`                                | the game with inputs disabled, "resolving"                                                                                                                                                                                                                                                                                  | none                                                                        |
  | `won`                                      | the result, the payout as `formatted`, the round id and verify link (W-39)                                                                                                                                                                                                                                                  | the next bet: the bet selector and start, from this Snapshot's `bet` (W-40) |
  | `lost`                                     | the result, the round id and verify link                                                                                                                                                                                                                                                                                    | the next bet: the bet selector and start, from this Snapshot's `bet` (W-40) |
  | `canceled`                                 | "round canceled, your bet was returned", the round id and verify link, and with `closeReason: "expired"` the words "the time limit ended this round". `canceled` is final, also after the shell's own cancel; until the cancel is answered the round is `resolving` and the cancel `settling` or `check-later` (W-25, W-33) | the next bet: the bet selector and start, from this Snapshot's `bet` (W-40) |
  | typed error                                | per [error and degraded states](../wrapper.md#error-and-degraded-states)                                                                                                                                                                                                                                                    | per code                                                                    |

  A round that is over (`won`, `lost`, `canceled`, and the shell's cancel
  `ended`, W-33) shows its result, the round id, and the verify link with the
  next bet beside them: the bet selector and the start button of the `idle` row,
  drawn from that Snapshot's own `bet` (`suggestedBets`, `defaultBet`, `minBet`,
  `maxBet`, the balance). There is no separate "new round" step: since
  se-backend `726f0a2` the Snapshot read keeps answering the ended round until
  the next `rounds:start`, so the next bet is offered from it, never from an
  `idle` read the Wrapper waits for and never from a mode of the UI's own. The
  result stays until the player starts (W-40). Focus follows W-46: the result
  heading takes it when the player's own action ended the round, and the bet
  selector and the start button follow it in the tab order.

  <!-- TODO(Snapshot contract): `won` shows "the payout as `formatted`". Since se-backend f8cc92b, `se.snapshot/1` carries a server-computed `payout` (`Amount`, with `formatted`) on `won` and `lost`, and forbids it on every other status. The Wrapper does not show it yet: human review (2026-10-19) put the display in a pull request of its own. `bankedAmount` is reserved for partial cash-out, is not served, and is not used. Until that pull request the Wrapper shows no amount on `won`, and it never computes one from `currentMultiplier` or anything else (W-34). -->

  How the Wrapper reads the shell's checks for this table (the round the shell
  holds, W-26): an `active` round is shown as "preparing the round", with the
  note that it is being checked, until the shell's verdict is `ready`; then it
  is shown ready, with the game. A failed verdict shows "this round failed
  verification" or "could not verify the chain" (W-26a), and an out-of-sync
  round its state (W-44), in place of the round until it is over. A round the
  shell does not hold (one resumed from `ROUND_ACTIVE`, W-42) is shown as its
  status gives it, with no game and no control. The cash-out control is shown
  only when the shell offers it (W-24: `active`, `ready`, at least one step
  survived and one left, nothing in flight). A move or cash-out whose one W-16
  resend was lost too, with the round still `active` and the action neither
  applied nor refused, is the session's `RoundState.unconfirmed` (`move` or
  `cash-out`): the Wrapper shows its own state in place of the round, the
  heading announced politely and taking the focus only after the player's own
  action (W-46), until a read settles the round.

- **W-32.** `won` is final. The Wrapper MUST NOT show or wait for the operator
  credit. The balance it shows is the Snapshot's `bet.balance.formatted`. The
  Snapshot read gets the round and `bet.balance` separately (the Play API
  document since se-backend `b47b286`), so a read's `bet.balance` may be newer
  than its round, and the next read shows both as they are; the Wrapper shows
  each read's balance as it comes and computes none. Every read carries a new
  `version`, never an earlier read's (the backend, 2026-10-19), so a read with a
  newer balance is never dropped as an equal `version` (W-29).
- **W-33.** `closeReason: "expired"` is shown next to the status and is not a
  status. A `canceled` Snapshot is final, with or without `closeReason`, also
  when it answers the shell's own cancel or settles it (W-25, the Snapshot
  contract `se.snapshot/1` as vendored from b27afc5); with
  `closeReason: "expired"` the time limit had closed the round first, and it is
  shown as the round's result with no error. After the shell's own cancel, the
  Wrapper shows the cancel state (W-25), which the session gives with every read
  of the round (`RoundState.cancel`); a read from elsewhere never reaches the UI
  while the cancel is `in-flight`, `settling`, or `check-later` (the session
  gives the round's own latest Snapshot instead):
  - `in-flight` and `settling`: the round as it was before the cancel (for the
    required cancel, "this round failed verification", W-26), with inputs
    disabled while a `resolving` read shows it, and no result, no "your bet was
    returned", and no bet selector;
  - `check-later`: "still resolving — contact support" (the status heading,
    announced politely), with the round id and the verify link (W-39) and a
    "check again" control, beside the round's "this round failed verification"
    (the alert panel, W-26), and still no result, no "your bet was returned",
    and no bet selector;
  - `ended`: a neutral "round ended" (the status heading) with the round id and
    the verify link, no win, loss, refund, or bet-returned amount, and no result
    claim; the next bet is offered beside it (W-31), and the round's failed
    verification lifts, as it does once a round is over. The read that settled
    the cancel `ended` is not read into the round (W-25), so the Wrapper then
    reads the Snapshot once (W-35) and shows that read's balance (W-32), still
    under "round ended" while it shows `idle`, until the player starts the next
    round; the read also gives the game the current Snapshot, so it no longer
    shows the round as live. If that read gets no response, a typed error, or a
    rejected answer, it is dropped: the balance of the round's last Snapshot
    stays, with no error state (decided by human review, 2026-10-18). Since
    `726f0a2` a read after the cancel shows the round's real result (`canceled`,
    `won`, or `lost`, the cancel `sent`), so `ended` comes only from an `idle`
    read, which never follows `active` (W-25): a defensive fallback;
  - `not-taken`: "this round failed verification" (W-26), the round open until
    its expiry rule closes it, whether the answer or a read showed `active`;
  - `sent` with `canceled`: "round canceled" with "this round failed
    verification and was canceled" (W-26) in place of "your bet was returned".
    When the time limit had closed the round before the cancel arrived
    (`closeReason: "expired"`, the cancel never honored; se-backend `b47b286`),
    it reads "this round failed verification" instead, followed by "the time
    limit ended this round", never "and was canceled";
  - `sent` with `won` or `lost` (a round that closed by play although the shell
    had sent the required cancel, which was never honored; se-backend
    `b47b286`): the result, with "this round failed verification; it closed
    before the cancel arrived", the round id and the verify link (W-39), and the
    next bet beside it (W-31). A result with no cancel of the shell's gets no
    such line. (Both decided in human review, 2026-10-19.)

  The copy (English): "Still resolving — contact support", "Check again", "Round
  ended", "This round failed verification and was canceled.", "This round failed
  verification.", and "This round failed verification; it closed before the
  cancel arrived."

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
  (until the player asks to try again), and in any blocking state (W-44), except
  while the shell's cancel is `settling` or `check-later` (below). An `active`
  round whose move or cash-out is not confirmed is read in the background
  (below): that exception is to the status rule only, so a typed error stops
  that read too, until the player asks to try again or to check again. Whether a
  round is over is decided in one place, the shell's `isRoundOver`, which the
  Wrapper's polling and rendering read; the Wrapper keeps no status list of its
  own. From a Snapshot alone, `canceled` is final, with or without a
  `closeReason` (W-25); while the shell's own cancel is not settled, the round
  flow's cancel state decides instead (below). While the shell's cancel is
  `settling` (W-25), the Wrapper also polls, through the round flow's `refresh`
  (the session's `read` is then one of the cancel's counted reads), with the
  same backoff and slow rate, whatever the status of the round's last Snapshot;
  a read with no response, another round's Snapshot, `resolving`, a typed error,
  or a rejected read does not stop it, and neither does the round's failed
  verification (W-26), which the required cancel always comes with and which the
  player could not retry; only a final state (W-44: the session ended, another
  tab, the configuration error) stops it. A final read (`canceled`, `won`,
  `lost`), `active`, or `idle` settles the cancel. The shell counts these reads;
  after 30 it reports `check-later`, and the Wrapper stops the fast poll and
  shows "still resolving — contact support" (W-33). In `check-later` the Wrapper
  reads once when the player asks to check again (the session's `checkAgain`,
  the flow's `checkAgain`), and once every 30 s in the background (the session's
  `read`, which is then the same read) until the session ends, with no "taking
  longer" notice, also after a read with no response (Wrapper configuration;
  time comes from the Wrapper's injected timers, never the shell). Either read
  may settle the cancel. The same background read, once every 30 s with no
  notice, also after a read with no response, runs while an `active` round's
  move or cash-out is not confirmed (W-16, `RoundState.unconfirmed`), beside its
  "check again" (the session's `checkAgain`, which is then `read`); neither
  sends or signs anything, and it stops once a read clears the state, and, as
  every poll outside the cancel's states, on a typed error, until "try again" or
  "check again" (each first clears the typed error shown) reads the round again.
  After a read settles the cancel, polling follows the round's status as usual:
  it stops once the cancel is `ended`, `not-taken`, or `sent`, whatever the
  status of the round's last Snapshot. Once the cancel is `ended`, the Wrapper
  reads the Snapshot exactly once more, through the session's `read` (the normal
  read, which passes `idle` on to the UI and the game), for the current balance
  (W-33); it is never repeated for the round and restarts no poll beyond what
  its answer calls for (an `idle` one calls for none). A final state (W-44: the
  session ended, another tab) is kept: that read's answer never replaces one,
  and the session's end that answers it is shown.

  **Re-read after a drop.** When the Wrapper drops a Snapshot because its
  `version` is lower than the one shown (W-29), from an action's answer, a read
  it made, or a poll, and no poll runs, it reads the Snapshot again through the
  session's `read`: up to 4 reads at the backoff above (500 ms, 1 s, 2 s, 2 s),
  then one every 30 s (the background rate), until a read is not dropped for a
  lower `version`. It stops on the first such read (taken, at an equal
  `version`, a typed error, a rejected answer, or the session's end), and as
  soon as a poll runs, a typed error or a blocking state shows, or the session
  ended. An equal `version` never starts it. It leaves alone the reads of the
  shell's cancel (`settling`, `check-later`) and the one read after `ended`. A
  read with no response waits the slow rate (W-43) and counts. A re-read is a
  read only, never a send or a signature; its answer is applied as a poll's (it
  moves no focus, W-46), and it shows no notice. The game gets the read the
  Wrapper takes, as it gets every Snapshot the session shows.

- **W-36.** Idempotency. Each player intent (start, a move, cash-out, cancel)
  gets one `idempotencyKey` (`crypto.randomUUID()`), reused for every retry of
  that intent and never for another.
