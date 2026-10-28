# Book playback

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

Status: **decided by the human, 2026-10-28 (issue #146)**, to be built. The
controller-protocol part was decided in
[RFC-003](../../rfcs/archived/RFC-003-book-playback-over-the-controller-protocol.md)
(archived). The backend answered on 2026-10-28 which statuses a book round shows
(W-54) and that a session's presentation never changes (W-53); the Snapshot
contract is to state both, and the marker in W-54 names the sync that brings it.
Until that sync lands, the implementation pull requests say "Refs #146", not
"Closes #146".

A **book round** is a round of a book game: its Snapshot has
`presentation: "playback"`, `model: "book"`, and a `BookConfig` as `config`
(`se.snapshot/1`). The player places a bet; the round draws one row (a "book")
of the game's math package, and the Snapshot of the ended round carries that
draw: its `index`, its display `payoutMultiplier`, and its `events`, which the
game plays back. The player makes no move during the round.

- **W-50. Scope of the first version.** The Wrapper plays a book round in the
  game's one mode, the one its version names in `config.model` (the base mode):
  a bet, the start, the draw, and the result. Out of scope until a later change
  of this spec:
  - any player input to a book round other than the start: the first version has
    none, and one is added only later, once the vendored contract defines it;
  - a book round on the verify page ([verify-page.md](../verify-page.md), out of
    scope there). The verify link (W-39) is still shown after a book round ends
    (decided by the human, 2026-10-28); what the page shows for it is that
    issue's
    <!-- TODO(#156): book rounds on the verify page, once the vendored verify API document covers book rounds. -->.

- **W-51. Start, and nothing signed.** A book round starts as any round does
  (W-22): the Play API's `start` verb with a fresh `idempotencyKey`, the bet as
  an `AmountRequest` copied from the Snapshot's own `Amount` fields, and the
  action key's address in `actionKey`, which the Play API document requires on
  every start. W-22's single resend applies unchanged. The key is generated and
  held as for any round (W-9 to W-13), and the start is serialized behind the
  signer lock (W-14). Nothing is ever signed for a book round: no
  `PlayerAction`, no `PlayerCashOut`, and no `PlayerCancel`. The transcript
  (W-15 to W-19) is not used, and the shell refuses a pick, a cash-out, or a
  cancel of a book round with no request sent: a pick and a cash-out are
  answered `not_legal` (decided by the human, 2026-10-28), and a book round has
  no cancel path at all.

- **W-52. What the shell checks on a book round.** A book Snapshot never carries
  `proofs.createRoundAuth` or `proofs.fairnessProof`; the schema rejects one
  that does (`invalid/create-round-auth-on-book`,
  `invalid/allowlist-fairness-proof-on-book`, W-28). A `starting` Snapshot of a
  book round may carry no `proofs` at first, and then `randomnessProof`; `won`
  and `lost` carry `randomnessProof` with `roundSecret` (the schema requires
  it). So:
  - W-26's checks 1 to 5, the tip check (W-26a, W-26b), and the re-issue rule do
    not apply to a book round, and no `T_0` exists. The shell no longer refuses
    a book round as `missing`; this replaces the decision of 2026-10-17 (W-26),
    which held only while the first release shipped config games only.
  - **Consistency of one round** (the kit's own rule). Once a Snapshot of the
    round carries `proofs.randomnessProof`, every later Snapshot of the same
    `roundId` MUST carry the same `source`, `blockNumber`, and
    `roundSecretHash`, and the same `config.packageHash`; a later Snapshot of
    the round with no `randomnessProof` is a change too (clarified with the
    implementation, #146). A change of `config.model` (or of the presentation)
    is W-53's, which wins: it ends the session, not only the round. A Snapshot
    that differs is a **changed round**: the shell keeps the first values and
    the second in the round's evidence (W-27), and the Wrapper shows "this round
    failed verification" in place of the round until it is over, as for a failed
    W-26 check. A changed round that is over (in practice the change is seen on
    the `won` or `lost` read) shows its result with the line "This round failed
    verification." beside it, shown like W-33's closed-before-cancel line, and
    the game frame stays hidden (W-55) (decided by the human, 2026-10-28).
    Nothing is signed either way, so nothing is canceled.
  - The shell does not recompute anything from `roundSecret`: it does not check
    it against `roundSecretHash`, and derives no seed or draw from it (decided
    by the human, 2026-10-28). That is the verify page's, for a book round a
    later issue (W-50).
  - The round's evidence (W-27) for a book round is its Snapshots'
    `randomnessProof` and the start's request (`idempotencyKey`, bet, action
    key's address); it holds no signed action.

- **W-53. One presentation per session** (the kit's own rule). The session's
  `presentation`, `model`, `config.kind`, and `config.model` are those of its
  first validated Snapshot. The backend has stated that `presentation`,
  `config.kind`, and `config.model` never change within a session, and the
  Snapshot contract is to say so. A later Snapshot in which any of the four
  differs is a **changed session**, final for the session like the final states
  of W-44 (decided by the human, 2026-10-28):
  - the Snapshot is not read into the session, and the Wrapper shows "this round
    failed verification", with the detail "The game changed during this session.
    Reload to continue." (a label under W-48's language rule, decided by the
    human, 2026-10-28), in place of the round or, at `idle`, of the bet
    selector;
  - from then until the page is reloaded the session reads nothing more (no
    poll, no re-read, no "check again"), signs nothing, starts nothing, and
    forwards nothing to the game, which is hidden;
  - the shell keeps the first values and the differing ones (the four fields
    above, and nothing else of the Snapshot) with the evidence (W-27), as W-52
    does for a changed round.

  W-53 is checked before W-52, so a Snapshot that changes both the round and the
  session is a changed session. A round never moves between the rules of W-26
  and those of W-52.

- **W-54. What the Wrapper shows.** A book round shows exactly four statuses:
  `idle`, `starting`, `won`, and `lost`. The draw closes the round from
  `starting` to `won` or `lost` in one step, with no state between; a void or a
  refusal shows `idle` (the backend, 2026-10-28; the Snapshot contract is to
  state it). W-31's table applies, with these differences:

  | `status`      | The Wrapper shows on a book round                                                                                                                                                                                                                                                                                                                                                                                                 | Input                                    |
  | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
  | `idle`        | as W-31, and the RTP line (W-56)                                                                                                                                                                                                                                                                                                                                                                                                  | start enabled                            |
  | `starting`    | "preparing the round"; there is no W-26 verdict to wait for                                                                                                                                                                                                                                                                                                                                                                       | none                                     |
  | `won`, `lost` | as W-31: the result, the payout as `formatted` (on `lost` only when `payout.value` is above 0), the round id and the verify link (W-39), and the next bet with the RTP line; the game plays the draw back beside it (W-55), or, when the `playback` copy fails closed, the frame is hidden and "The game can't show this round." shows in its place ([the controller boundary](./the-game-iframe-and-the-controller-boundary.md)) | the next bet, from this Snapshot's `bet` |

  A book Snapshot whose `status` is `active`, `resolving`, or `canceled` fails
  validation (W-28: the generic error state; the shell's validation issue names
  `/status`, and the Wrapper adds no log line for it, decided by the human,
  2026-10-28). The vendored schema still allows the three on a book round, so
  until the sync below the shell applies this rule itself, after the `snapshot`
  validator, which follows the vendored schema exactly; once the schema refuses
  them, the validator does and the shell's rule is removed. The vendored
  `valid/book-playback-resolving-placeholder` then moves to `invalid/` (a
  pre-release change of a vendored vector, rule 1's `--allow-vector-change`),
  and no kit test may rely on it as a valid book Snapshot.
  <!-- TODO(#146): re-vendor the Snapshot schema and vectors at the backend commit that refuses `active`, `resolving`, and `canceled` on a book round and states the one-presentation rule; then move the check from the shell to the validator. -->

  The payout is the Snapshot's `payout`, shown as its `formatted`. The Wrapper
  MUST NOT compute or show an amount from `config.draw.payoutMultiplier`, the
  bet, or the RTP (W-34): the multiplier is the game's display only. A changed
  round (W-52) shows "this round failed verification" in place of the round
  until it is over, and then its result with the line "This round failed
  verification." beside it. W-35 polls a book round while it is `starting`, as
  any round.

- **W-55. The game frame on a book round.** W-37 shows the frame only when the
  round is ready (`active` after W-26, or `resolving`), which a book round never
  is. On a book round the frame is shown in `won` and `lost` beside the
  Wrapper's result, so the game can play the draw back; it stays shown with the
  result until the player starts the next round (W-40), and is hidden in every
  other status and in every blocking state (W-44). A changed round (W-52) hides
  it, and so does a `playback` copy that fails closed: the frame is hidden and
  the notice "The game can't show this round." shows in its place until a
  Snapshot whose copy succeeds
  ([the controller boundary](./the-game-iframe-and-the-controller-boundary.md)).
  The notice is a label like any other: it follows W-48's language rule. Focus
  follows W-46, with its exception for a book round: the Wrapper's result
  heading takes it when the player's own start led to the result, also when the
  result arrives by the poll after that start's `starting` answer (once, for
  that round only; any other poll moves no focus); the game never takes it from
  there. Decided by the human, 2026-10-28.

- **W-56. The RTP.** When a book Snapshot carries `config.rtp`, the Wrapper
  shows the mode's return to player beside the bet selector (W-31's `idle` row
  and the next bet) as "Return to player: <p>%", where `<p>` is `rtp.decimal`
  turned into a percent with two fraction digits by string operations only,
  never through a number. `rtp.decimal` is an integer digit (`0` or `1`), a
  point, and four digits `abcd` (the schema's pattern); `<p>` is the integer
  digit followed by `ab`, with leading zeros removed but at least one digit
  kept, then a point, then `cd`. So `"0.9600"` is `96.00`, `"0.0500"` is `5.00`,
  `"0.0050"` is `0.50`, `"0.0000"` is `0.00`, and `"1.0000"` is `100.00`: the
  percent keeps the decimal's precision, four places of a fraction being two of
  a percent. The Wrapper never shows or computes with `rtp.fraction` (the value
  to verify against, which the verify page owns). An absent `rtp` shows nothing
  and no error. The RTP is not forwarded to the game (W-38).

- **The controller boundary on a book round** (W-38, decided in
  [RFC-003](../../rfcs/archived/RFC-003-book-playback-over-the-controller-protocol.md)).
  The game declares `playback` in its `hello` and receives the `playback` copy
  of each Snapshot that passed W-28: `version`, `presentation`, `status`,
  `closeReason`, `roundId`, `context.language`, `context.device`,
  `context.theme.appearance`, `config.kind`, `config.model`, and `config.draw`
  (`index`, `payoutMultiplier`, and `events[]` with `index`, `type`, and
  `data`). A pick on a book round is answered `reject: not_legal`, and the shell
  refuses it too. The rules are in
  [The game iframe and the controller boundary](./the-game-iframe-and-the-controller-boundary.md).

## Tests

Rows T-22 to T-24 of the [test plan](../wrapper.md#test-plan).
