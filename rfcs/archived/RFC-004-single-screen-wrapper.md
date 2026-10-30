# RFC-004 — A single-screen Wrapper

- Status: archived
- Archived: 2026-10-30 (accepted by the human and folded into the specs below)
- Author: the documenter agent, for human review
- Created: 2026-10-29
- Relates to: W-24, W-25, W-26, W-31, W-33, W-37, W-38, W-40, W-44, W-46, W-49b,
  W-49d, W-49f, W-55 of [the Wrapper spec](../../specs/wrapper.md), T-6, T-9a,
  T-10 to T-12, T-14, T-14a, T-15, T-16, T-18, T-23, T-24 of its
  [test plan](../../specs/wrapper.md#test-plan), and
  [ADR-006](../../decisions/ADR-006-the-operator-protocol-se-operator-1.md)
  (only for the optional section on lifecycle events)

The human accepted this RFC on 2026-10-30, after every question was decided (see
[Decisions](#decisions-2026-10-29-and-2026-10-30)): Q1, Q2, Q5, Q6, and Q10 to
Q14 on 2026-10-29 (Q2, Q6, and Q12 against this RFC's recommendation), and Q3,
Q4, Q7, Q8, and Q9 on 2026-10-30, with the reviewer's findings and the human's
answer to them folded in on 2026-10-30. Its content is now in the specs, to be
built: [the single screen](../../specs/wrapper/the-single-screen.md) (W-57,
W-58), W-46 in [the Wrapper spec](../../specs/wrapper.md#accessibility), W-31
and W-33 in [rendering](../../specs/wrapper/rendering-from-the-snapshot.md),
W-37 and W-38's hold in
[the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md),
W-55 in [book playback](../../specs/wrapper/book-playback.md), W-49d in
[operator embedding](../../specs/wrapper/operator-embedding.md), and
[ADR-010](../../decisions/ADR-010-resize-height-is-a-minimum.md) (accepted).
This file is the reasoning, not canonical: where it and the specs differ, the
specs hold. The wording marked **proposed** below is what the specs now carry.
The lifecycle events to the operator page are a follow-up (Q7).

## Problem

The Wrapper reads as three pages today. At `idle` it shows the bet selector and
the start button, and the game frame is hidden (W-37: the frame is "hidden
unless the round is shown ready"). From `active` (after W-26 passed) to
`resolving` it shows a status panel above the frame and the frame below it. At
`won`, `lost`, and `canceled` the frame is hidden again (except a book round's,
W-55) and the result, the round id, the verify link, and the next bet take its
place. Each change of status replaces most of the page, and the height the
Wrapper reports to the operator page (W-49d) changes with it.

Players know a different shape. Embedded game pages commonly hold one iframe in
a fixed 16:9 box; the game is visible for the whole session, and one control bar
under it changes in place: the bet and "start" when idle, "cash out" while the
round runs, the result and "play again" after it. The embedding page commonly
keeps its own controls around the box (fullscreen, theater mode, a real or fun
toggle, a list of recent bets with a "verify bet" link), and the game posts the
common lifecycle events to it (loaded, ready, round start with the total bet,
round started with the balance before it, round ended).

This RFC proposes that shape for the Wrapper without moving any money control or
signature out of the shell.

## Motivation

- A single, stable screen is what players and operators expect from embedded
  games. A frame that appears and disappears, and a box whose height jumps, read
  as a broken embed.
- An operator that gives the Wrapper a fixed 16:9 box today gets either a scroll
  bar or empty space, depending on the state.
- The trust model does not need the frame hidden: the frame is sandboxed on its
  own origin (W-37), its messages are origin-checked and schema-checked (W-38),
  and the shell refuses every pick until W-26 passes. What hiding did, and what
  this RFC must keep by other means, is that **a round never reads as ready
  before the shell's checks pass**.

## Proposed solution

### Scope, non-goals, acceptance criteria

In scope: the layout of the Wrapper's own page (the stage and the control bar),
the place of every status and blocking state in it, when the game frame is shown
and when it takes input, one change to when the controller bridge forwards a
Snapshot to the game, the focus and announcement rules of the new layout, and
how the Wrapper fills the box the operator page gives it, with what `resize`
then says.

Not in scope:

- moving any bet, cash-out, or signing control into the game. The Wrapper's
  shell keeps all of them (W-20 to W-27); the game still sends only picks
  (W-38). Native in-game bet controls stay a later increment (the spec's Out of
  scope);
- the operator page's own controls (fullscreen, theater mode, a real or fun
  toggle, a recent-bets list). The Wrapper offers none of them; an operator page
  may build them around the Wrapper's iframe;
- a player-initiated cancel control. W-25 allows one "if the game offers it",
  and `se.controller/1` has no verb for it; that is unchanged;
- a live cash-out **amount** before the backend serves one (below,
  [The cash-out value](#the-cash-out-value));
- the lifecycle events to the operator page, which need `se.operator/2`. They
  are a separate, optional proposal
  ([below](#optional-lifecycle-events-to-the-operator-page-seoperator2)).

Acceptance criteria:

1. From the first validated Snapshot to the session's end, the game frame is in
   the same place at the same size in every status (`idle`, `starting`,
   `active`, `resolving`, `won`, `lost`, `canceled`), and every typed error,
   connection problem, and degraded state of W-44 shows without moving it.
2. For the round in progress, no pick or cash-out control is usable, and the
   game is never shown that round's `active` Snapshot, before the shell's
   verdict for that round is `ready` (W-26). The start control at `idle` and on
   a result is for a new round and is not affected.
3. The Wrapper fills the height of the box (its iframe's viewport) the operator
   page gives it in every state; the bar's height does not change with the
   state, so the stage does not move. `resize` (W-49d) reports the least height
   the Wrapper needs, which changes only with the width and the player's text
   size or zoom.
4. W-45 to W-48 hold in the new layout: keyboard order, focus only after the
   player's own action (with the exceptions below), the polite live region and
   `role="alert"`, text with every icon, 200 % zoom.

### The layout

**Proposed W-57. The screen.** The Wrapper's page is one screen of two parts, in
this order in the document and on screen:

1. **The stage**, on top: the game frame (W-37) and, over it when a state calls
   for one, the Wrapper's **overlay** (below). The frame is mounted once per
   session, as today (`mountGame` in `apps/wrapper/src/session-wiring.ts` runs
   when the session is wired, before any round), and is never removed or resized
   by a status change.
2. **The control bar**, under the stage. It changes in place and holds, in fixed
   slots:
   - the **status line**: the state's heading (the status heading of today, a
     heading element, announced politely) and at most one line of detail;
   - the **alert line**: the `role="alert"` region for an error that does not
     stop the round (a typed error, the generic error, a connection problem);
   - the **primary controls**: the bet selector and the start control, or the
     cash-out control, or "check again", as the state gives them;
   - the **round line**: the payout and balance on a result, and the round id
     with its copy control and the verify link (W-39) when shown;
   - the **operator links**: the lobby and deposit controls (W-49e, W-49f).

   A slot with nothing to show stays empty; the bar never shows a disabled
   placeholder for a control the state does not offer, so no control reads as
   usable while it is not.

**The overlay** is a panel the Wrapper draws over the stage, at the stage's
size, for a state in which the round cannot be played or the game cannot be
shown. It holds a heading and its detail, and, for an error, the `role="alert"`
content. It is not a dialog and traps no focus: the bar stays operable under it.
It comes in two forms:

- **scrim**: translucent, so the game stays visible behind it, for a round being
  checked (see
  [The frame before a round is ready](#the-frame-before-a-round-is-ready));
- **cover**: opaque, for a state in which the game's view must not be read as
  the round's (failed verification, out of sync, a rejected Snapshot, a game not
  compatible, a `playback` copy that failed closed) and for the final states
  (the session ended, another tab, a changed session).

Before a session exists (loading, the configuration error, a browser without Web
Locks), there is no frame; the stage shows the cover at the same size.

### The frame before a round is ready

The question the change has to answer: the frame is now visible before and
during the shell's checks. Grounded in the current code and specs:

- **The game already has an idle state.** The bridge sends the game every
  validated Snapshot, `idle` included (W-38): `mountGame` in
  `packages/shell/src/session-play.ts` gives a new bridge the latest Snapshot at
  mount, `show` in `session-reads.ts` gives it every later one, and the bridge
  (`packages/shell/src/controller-bridge.ts`) answers the game's first valid
  `hello` by forwarding the latest copy it holds (`onHello`, then `forward`).
  The game declares all seven statuses (W-30, W-38), and the reference game
  renders `idle` as "place a bet in the Wrapper"
  ([the reference game](../../specs/client-kit/the-reference-game.md)). The
  frame is mounted before the first round today (T-18 mounts its malicious game
  at an idle round). So showing the frame at `idle` needs **no protocol
  change**: no new message, field, or status.
- **But the game sees `active` before the shell's verdict.** Today every
  validated Snapshot is forwarded (`sendSnapshot` on every accepted change),
  whatever W-26's verdict. A game shown an `active` copy renders its picks as
  playable (the reference game shows "the two calls"). The shell refuses those
  picks (`not_active`, W-38's pick rules), so nothing is signed; but with the
  frame visible, the round would **read as ready** while the shell is still
  checking, or after a check failed. Hiding the frame is what prevented that
  today.

Two measures replace the hidden frame; the human decided on both (Q1, A,
2026-10-29):

- **(a) The bridge holds back an `active` Snapshot with no `ready` verdict**
  (proposed, a rule of W-38). The bridge forwards a Snapshot whose `status` is
  `active` only while the shell's verdict for that Snapshot's round is `ready`
  (W-26). Every other `active` Snapshot is held, at every point where a Snapshot
  reaches the bridge (the latest at mount, the answer to `hello`, and every
  later one):
  - **a round being checked**: until the verdict is `ready` the game keeps the
    last copy it was sent (in practice the round's `starting`); when the verdict
    becomes `ready`, the round's latest Snapshot is forwarded;
  - **a round whose verdict left `ready`** (failed, re-issued, or out of sync,
    W-19, W-26): from then on no further `active` Snapshot of that round is
    forwarded; its Snapshots that are not `active` (`resolving` under the
    required cancel, and its result) still are;
  - **a round the shell does not hold**, which has no verdict at all: one
    resumed from a `ROUND_ACTIVE` problem (W-42), or a round an earlier page
    left open when a reload ended its session (W-11). Its `active` Snapshots are
    never forwarded; its later non-`active` ones are.

  The `hello` is answered with the last copy forwarded, never a held one. The
  message set and the copy's fields are unchanged, so this is a **behavior
  change of the bridge, not a protocol change**: a game written to
  `se.controller/1` keeps working, and sees a round go from `starting` to
  `active` later than it does today. The `version` rule (W-29) is unchanged: a
  held Snapshot is skipped, never sent out of order. A book round has no
  `active` and is unaffected.

- **(b) The frame takes input only while a pick can be signed** (proposed W-58;
  Q2 decided B, 2026-10-29). The Wrapper sets the `inert` attribute on the
  game's iframe element in every state but one: the round is `active`, the shell
  holds it and its verdict is `ready`, and none of these holds:
  - a blocking state of the UI (`WrapperState.blocking`): `loading`,
    `configuration-error`, `session-ended`, `other-tab`, `unsupported-browser`,
    `verification-failed`, `chain-unverified`, `out-of-sync`,
    `snapshot-rejected`, or `session-changed`;
  - the round's verdict `failed`, or a re-issue (W-26);
  - the round out of sync (W-19);
  - a move or cash-out not confirmed (`RoundState.unconfirmed`, W-16);
  - a cash-out call in flight;
  - the shell's cancel in any state but `none` (W-25);
  - "game not compatible" (W-38).

  These do **not** make it inert: a connection problem (W-43), a typed error,
  the generic error, the slow notice (W-35), the "chain check not independent
  (development)" indicator (W-26a), a move in flight, and `RoundState.pending`.
  So the frame is inert at `idle`, while preparing and checking, while
  `resolving`, on every result, and in every blocked state. A move in flight
  does not make it inert: the bridge answers a second pick `busy` and the game
  shows its own wait, so the frame does not flicker and the focus is not thrown
  out on every pick. **A typed error, the generic error, or a connection problem
  shown during a playable round does not make it inert either** (Q12, decided B,
  2026-10-29): the shell's own gate decides each pick then, as
  [A pick during an error or offline](#a-pick-during-an-error-or-offline) says.
  `inert` takes the frame out of the tab order and the accessibility tree, and
  the browser applies it to the frame's document (to be confirmed in the three
  browser projects, T-14a and T-27). The scrim is drawn over the inert frame
  while the round is checked, and the cover in the states the table names.

(a) is the trust measure: the untrusted game is never told a round is live
before the shell is. (b) is defense in depth for a game that renders something
playable anyway, and keeps keyboard focus out of a frame that cannot act.
Neither replaces the shell's own gate: the pick use case still re-checks W-26
and W-23 (W-38).

### What an inert frame costs

`inert` blocks the player's input to the frame and hides it from assistive
technology. It does not stop the game: its scripts, timers, animation, audio,
`postMessage`, and rendering run as before, and the bridge keeps sending it
Snapshots. With Q2 decided B:

- **What keeps working.**
  - **A book round's playback.** W-50 gives a book round no player input other
    than the start, which is the Wrapper's. The game receives the `won` or
    `lost` `playback` copy with `config.draw` and plays it back on its own; the
    reference game shows the draw at once with no timed animation and takes no
    input on a book round
    ([the reference game](../../specs/client-kit/the-reference-game.md)). An
    animated playback runs too: animation needs no input.
  - **A steps round's reveal** on `won`, `lost`, or `canceled`: the copy carries
    `selectedIndex` and `losingIndex`, and the game draws the reveal without
    input.
  - **The game's idle view**, shown and animated, at `idle`.
  - **Every message**: the game's `hello`, the Snapshots, and the `reject`s.
    `se.controller/1` has no message a game sends outside `active` other than a
    pick, which the bridge refuses there anyway.
- **What is lost**, in every state but `active` with the verdict `ready`:
  - **Any input the game takes for itself**: a sound or mute toggle, settings, a
    paytable or help panel, a "skip", "replay", or "faster" control on a
    playback, a "click to continue" between reveal steps, a hover effect, and
    scrolling inside the game. None of these is part of the protocol, and the
    first release defines none, but a third-party game that needs one (a
    playback that waits for a click to advance, in particular) would stall until
    the next round. **Requirement for games (proposed, for the reference game
    spec and the game developers' guidance):** a game MUST play its reveal and a
    book round's playback to the end with no player input, and MUST NOT need
    input outside an `active` round.
  - **The game's content for assistive technology** at `idle` and on results: a
    screen reader does not read the game's idle text, its reveal, or a book
    round's draw list, since `inert` removes them from the accessibility tree.
    The Wrapper's bar carries the state and the result as text (the outcome, the
    payout as `formatted`, the round id, W-31, W-39), so no information the
    player needs is lost; the game's own narration of the draw is. W-45 to W-48
    target the Wrapper's UI, not the game's contents, so no requirement breaks,
    but it is a real loss for a screen-reader user.
  - **Accepted for the first release** (Q13, decided A, 2026-10-29), with the
    rule for games above. Wrapper-side controls for what a game cannot offer
    while inert (sound, skip) are a later controller increment.
    <!-- TODO(later controller increment): Wrapper-side sound and skip controls for a game whose frame is inert outside a playable round (RFC-004 Q13). -->
- **The focus.** An inert frame cannot hold the focus, and the frame becomes
  inert at the end of almost every round played in it (on `resolving` or the
  result), so the inert-frame rule of [W-46](#w-46-in-the-new-layout) runs
  often.

### A pick during an error or offline

With Q12 decided B, the frame stays interactive at `active` with the verdict
`ready` while a typed error, the generic error, or a connection problem shows,
so the player can pick then. Nothing new is needed in the shell: its gate
already decides every pick (`gate` in `packages/shell/src/round-actions.ts`,
W-15 to W-19, W-23, W-38). What happens, by case:

| Case                                                                                                                                                                                          | What the shell does with the pick                                                                                                                                                                                                                                                                                                                            | What the game is told                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| A move or cash-out is signed and not seen applied (pending): its send was lost (offline), or answered a 500 `INTERNAL` or a 503 marked `retryable: false`, or the transport is still retrying | refuses it, signs nothing (W-15: one action per sequence); the pending action is resent at most once, with the same bytes and key, only after a read shows it not applied (W-16, W-43); a resend that is lost too gives the unconfirmed state, which makes the frame inert                                                                                   | `reject: busy`                                                 |
| The last move or cash-out was refused (400 `INVALID_ARGUMENT`; a 409 `STALE_ACTION` is the out-of-sync blocking state)                                                                        | refuses it: signing is held until a read shows its own action applied, else the round is out of sync (W-19)                                                                                                                                                                                                                                                  | `reject: not_active`                                           |
| A pick for a row the shell already signed                                                                                                                                                     | refuses it (W-15)                                                                                                                                                                                                                                                                                                                                            | `reject: not_legal`                                            |
| Nothing pending, the error came from something else (a read, a refused "check again"), or the browser is offline with nothing pending                                                         | signs the move, records it, then sends it (W-16). Online, the answer is the round's next Snapshot, which is shown as the player's action and clears the alert line (a newer accepted Snapshot drops the typed error, the generic error, and the connection problem, `wrapper-state.ts`). Offline, the send is lost: the move is pending, as in the first row | nothing on acceptance (W-38); the next Snapshot shows the move |

So a pick made during an error or offline is either refused with a reason the
game shows, or signed once and confirmed only by a Snapshot. The Wrapper never
reports success for an action whose outcome it has not read (W-43), and no
second action is signed at the sequence.

**How the bar says it.** The game's own text is the game's (the reference game
shows "your call is in" for a pick it sent and the reject's reason for a
refusal), so the bar MUST NOT let a pick read as taken before a Snapshot shows
it:

- When a connection problem, a typed error, or the generic error is shown while
  a move or cash-out is pending, the status line's detail reads **new** "Waiting
  for your move to be confirmed." (or "... your cash-out ..."), beside the alert
  line, until a Snapshot shows it applied, the alert clears, or the unconfirmed
  state replaces it. With no error shown it never appears, so normal play, where
  a move is pending only between its send and its answer, never flashes it. The
  status heading stays "Your round is in play"; the multiplier stays that of the
  last Snapshot, never one the pick would give.
- The cash-out control is not offered while an action is pending or a call is in
  flight (W-24, `cashOutOffered`), so the bar cannot offer a second money action
  beside an unconfirmed one.
- To show the detail, the session gives the UI a read-only flag of the round,
  `RoundState.pending` (`move` or `cash-out`), beside `unconfirmed`; it carries
  no signature, key, or bytes (W-41). This is a change to the `shell` package's
  public type (a changeset). The two flags:
  - `pending` is derived and read only: the round signer's pending move or
    cash-out (`RoundSigner.pending()`, never a cancel) while the signer's phase
    (`phase()`) is `open` or `adopted`, and absent otherwise. It is set from the
    signature (recorded before its send, W-16) until a Snapshot shows the action
    applied, and absent once a final answer has held signing (a 400 or 409 puts
    the signer in `stale`, W-19, where the action stays pending inside the
    signer until a read shows it applied, `adopted`, or not, out of sync), once
    the round is out of sync, re-issued, failed, or over, and once the session
    has ended (corrected after the re-review, 2026-10-30, to match
    `round-signer.ts`).
  - `unconfirmed` is set only once the action's one W-16 resend was lost too;
    `pending` stays set beside it, since the phase is still `open` or `adopted`.
    While `unconfirmed` is set, the Wrapper shows the unconfirmed view (W-16),
    which replaces the waiting detail.
- Focus: a pick refused by the shell moves nothing (the game shows the reject);
  the pick's answer, when it ends the round, takes the focus as W-46 says.

### The cash-out value

The request asks for "Cash out" with the live amount, as the Snapshot's
`formatted`, never computed. `se.snapshot/1` as vendored has **no such field**
on an `active` round: `currentMultiplier` is a display multiplier ("never used
for money math"), `payout` is allowed on `won` and `lost` only, and
`bankedAmount` is reserved for partial cash-out and not served (W-31). W-34
forbids computing an amount from a multiplier. So, proposed: the cash-out
control reads "Cash out" with the current multiplier beside it as a display
value (`×1.94`), as the `active` row shows the multiplier today, and shows an
amount only once the backend serves one as an `Amount` on `active` and the kit
vendors that schema. That is a request to the backend's Snapshot contract, not
something this repository can add (Q3, decided A, 2026-10-30: the multiplier
now; a backend issue asks for the amount).

<!-- TODO(backend Snapshot contract): a server-computed cash-out value (an `Amount`) on an `active` steps round, if the backend agrees; until then the control shows the multiplier only. -->

### State by state

What the stage and the bar show in each state, which controls are enabled, where
the focus goes, and what is announced. "Player" means the change came from the
player's own action (a start, a pick, a cash-out, "try again", "check again");
"poll" means any read the player did not ask for (W-35, W-46). "Announced" is
the polite live region unless it says alert. The texts are today's labels
(`apps/wrapper/src/messages.ts`) unless marked **new**; every label follows
W-48's language rule.

| State                                                                                                           | Stage (frame, overlay)                                                                                                                                                                | Bar                                                                                                                                                                                                                                    | Enabled controls                                                                                                                  | Focus                                                                                                                                     | Announced                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Loading, or framed before `welcome` (W-49c)                                                                     | no frame yet; cover: "Loading the game"                                                                                                                                               | empty                                                                                                                                                                                                                                  | none                                                                                                                              | not moved                                                                                                                                 | the heading                         |
| Configuration error; the browser has no Web Locks (W-14)                                                        | no frame; cover: the state's heading and detail                                                                                                                                       | empty (W-49f: no link)                                                                                                                                                                                                                 | none                                                                                                                              | not moved                                                                                                                                 | the heading                         |
| `idle`                                                                                                          | frame shown, inert (view only); the game shows its own idle view                                                                                                                      | status "Place your bet"; the balance; the bet selector (W-31) and the start control, **new** label "Place bet"; on a book round the RTP line (W-56); lobby and deposit (W-49f)                                                         | bet selector, start, lobby, deposit                                                                                               | not moved                                                                                                                                 | the status line                     |
| `idle` with a typed error or the generic error (a void, `INSUFFICIENT_FUNDS`, ...)                              | as `idle`                                                                                                                                                                             | as `idle`, and the alert line: the code's message, the `requestId`, and its control ("Back to start" for the four voided-start codes, "Try again" when retryable, the deposit for funds, W-42)                                         | as `idle`, and the alert's control                                                                                                | the alert's heading, after the player's start                                                                                             | alert                               |
| A start or cash-out call in flight                                                                              | unchanged; inert for a cash-out (W-58)                                                                                                                                                | unchanged; the pressed control is busy (`aria-disabled`) until the answer; no lobby or deposit (W-49f)                                                                                                                                 | none                                                                                                                              | stays on the pressed control; when the control goes, the status heading (W-46)                                                            | nothing new                         |
| `starting` (config or book)                                                                                     | frame shown, inert; the game shows its own `starting` view                                                                                                                            | status "Preparing the round", detail "The round is being prepared and checked."                                                                                                                                                        | none                                                                                                                              | not moved                                                                                                                                 | the status line                     |
| `active`, verdict not yet `ready` (W-26 checking)                                                               | frame shown, inert, the game held at its last copy (measure (a)); scrim with "The round is being checked before you play."                                                            | status "Preparing the round"                                                                                                                                                                                                           | none                                                                                                                              | not moved                                                                                                                                 | the status line                     |
| `active`, verdict `ready`                                                                                       | frame shown, interactive (the only such row); no overlay                                                                                                                              | status "Your round is in play"; the multiplier; "Cash out" with the multiplier when the shell offers it (W-24); no lobby or deposit                                                                                                    | game picks; cash-out when offered                                                                                                 | the iframe element, once, when the round the player started becomes ready (Q10, decided A); a pick keeps the focus in the frame           | the status line                     |
| `active`, a round the shell does not hold (a `ROUND_ACTIVE` resume, W-42; a round left open by an earlier page) | frame shown, inert, the game held at its last copy (measure (a)); cover: **new** "This round can't be played here" and **new** "Nothing is signed for it. It ends by its time limit." | empty; no lobby or deposit (W-49f)                                                                                                                                                                                                     | none                                                                                                                              | the cover's heading, after the player's start that led to it; otherwise not moved                                                         | the cover's heading                 |
| `active`, a move or cash-out not confirmed (W-16)                                                               | frame shown, inert; the game waiting                                                                                                                                                  | status "Your move hasn't been confirmed" (or the cash-out's), detail "If it never arrives, the round ends by its time limit."; the round id; "Check again"                                                                             | "Check again"                                                                                                                     | the status heading, after the player's own action only                                                                                    | the status line                     |
| `resolving`                                                                                                     | frame shown, inert; the game shows its own `resolving` view                                                                                                                           | status "Resolving", detail "The result is being settled."                                                                                                                                                                              | none                                                                                                                              | not moved                                                                                                                                 | the status line                     |
| Slow (W-35's "taking longer than expected")                                                                     | unchanged                                                                                                                                                                             | the status line's detail becomes "This is taking longer than expected."                                                                                                                                                                | unchanged                                                                                                                         | not moved                                                                                                                                 | the notice                          |
| `won`                                                                                                           | frame shown, inert (view only); the game shows the reveal (a book round plays the draw back, W-55)                                                                                    | status "You won" with its icon; "Payout" and the `formatted` amount, the balance; the round id, its copy control, the verify link; the next bet: the bet selector and **new** "Play again"; lobby, deposit                             | bet selector, "Play again", copy, verify link, lobby, deposit                                                                     | the status heading, after the player's own action (W-46, and its book exception)                                                          | the status line                     |
| `lost`                                                                                                          | as `won`                                                                                                                                                                              | as `won`, "You lost", the payout only when `payout.value` is above 0 (W-34)                                                                                                                                                            | as `won`                                                                                                                          | as `won`                                                                                                                                  | the status line                     |
| `canceled` (also with `closeReason: "expired"`)                                                                 | as `won`                                                                                                                                                                              | as `won`, "Round canceled" with its detail, and "The time limit ended this round." on `expired` (W-33)                                                                                                                                 | as `won`                                                                                                                          | as `won`                                                                                                                                  | the status line                     |
| A book round's result whose `playback` copy failed closed (W-38, W-55)                                          | cover: "The game can't show this round."                                                                                                                                              | as `won` or `lost`                                                                                                                                                                                                                     | as `won`                                                                                                                          | as `won`                                                                                                                                  | the status line                     |
| Connection problem (W-43)                                                                                       | as the round's state (at `active` and `ready` the frame stays interactive, Q12)                                                                                                       | as the round's state, and the alert line: "Connection problem", its detail, "Your device is offline." when it is; while a move or cash-out is pending, the status detail "Waiting for your move to be confirmed."; no lobby or deposit | as the round's state; game picks go to the shell's gate ([A pick during an error or offline](#a-pick-during-an-error-or-offline)) | after a control of the bar: the alert's heading; after a poll or a pick in the frame: not moved (a pick's focus stays in the frame, W-46) | alert                               |
| A typed error or the generic error during a round                                                               | as the round's state (at `active` and `ready` the frame stays interactive, Q12)                                                                                                       | as the round's state, and the alert line with its control (W-42); while a move or cash-out is pending, the status detail "Waiting for your move to be confirmed."                                                                      | as the round's state, game picks through the shell's gate, and the alert's control                                                | after the player's action in the bar: the alert's heading; after a pick in the frame: stays in the frame (W-46)                           | alert                               |
| Round failed verification (W-26), a re-issue, a changed round in play (W-52)                                    | frame inert; cover: "This round failed verification" and its detail, as the alert                                                                                                     | empty but the lobby (W-49f)                                                                                                                                                                                                            | lobby                                                                                                                             | the cover's heading, after the player's action; see the inert-frame rule below                                                            | alert                               |
| Could not verify the chain (W-26a)                                                                              | frame inert; cover: "Could not verify the chain" and its detail, as the alert                                                                                                         | empty (W-49f: no link)                                                                                                                                                                                                                 | none                                                                                                                              | as above                                                                                                                                  | alert                               |
| Out of sync (W-19)                                                                                              | frame inert; cover: "This round is out of sync" and its detail, as the alert                                                                                                          | the round id and the verify link; the lobby                                                                                                                                                                                            | copy, verify link, lobby                                                                                                          | as above                                                                                                                                  | alert                               |
| Snapshot rejected (W-28)                                                                                        | frame inert; cover: "The game state could not be read" and its detail, as the alert                                                                                                   | the lobby (no retry, as today)                                                                                                                                                                                                         | lobby                                                                                                                             | as above                                                                                                                                  | alert                               |
| "Game not compatible" (W-38)                                                                                    | frame inert; cover: "This game is not compatible with the player."                                                                                                                    | empty (W-49f: no link); **no start control** (Q5, decided A)                                                                                                                                                                           | none                                                                                                                              | not moved (it follows the game's `hello`, not the player)                                                                                 | alert                               |
| The shell's cancel `in-flight` or `settling` (W-25, W-33)                                                       | frame inert; cover: "This round failed verification", as the alert                                                                                                                    | status "Resolving" while a `resolving` read shows; nothing else                                                                                                                                                                        | none                                                                                                                              | not moved                                                                                                                                 | the status line; the cover as alert |
| The shell's cancel `check-later`                                                                                | frame inert; cover: "This round failed verification", as the alert                                                                                                                    | status "Still resolving — contact support"; the round id and the verify link; "Check again"                                                                                                                                            | "Check again", copy, verify link                                                                                                  | the result it settles on, after "check again"                                                                                             | the status line                     |
| The shell's cancel `ended`                                                                                      | frame shown, inert (view only); no overlay                                                                                                                                            | status "Round ended"; the round id and the verify link; the next bet; the balance of the one read after it (W-33)                                                                                                                      | as `won`                                                                                                                          | as `won`                                                                                                                                  | the status line                     |
| The shell's cancel `not-taken`                                                                                  | as round failed verification                                                                                                                                                          | as round failed verification                                                                                                                                                                                                           | lobby                                                                                                                             | as above                                                                                                                                  | alert                               |
| The shell's cancel `sent`, with `canceled`, `won`, or `lost`                                                    | as the result                                                                                                                                                                         | as the result, with W-33's line ("This round failed verification and was canceled.", or "...; it closed before the cancel arrived.")                                                                                                   | as `won`                                                                                                                          | as `won`                                                                                                                                  | the status line                     |
| Session ended (W-7, W-42)                                                                                       | frame hidden; cover: "Your session has ended" and its detail                                                                                                                          | the lobby, labelled "Relaunch from the lobby" (W-49f)                                                                                                                                                                                  | lobby                                                                                                                             | the cover's heading only when the player's own call ended it (W-46); otherwise not moved                                                  | alert                               |
| Open in another tab (W-14)                                                                                      | frame hidden; cover: "This session is open in another tab" and its detail                                                                                                             | the lobby                                                                                                                                                                                                                              | lobby                                                                                                                             | not moved                                                                                                                                 | alert                               |
| A changed session (W-53)                                                                                        | frame hidden; cover: "This round failed verification", "The game changed during this session. Reload to continue."                                                                    | the lobby                                                                                                                                                                                                                              | lobby                                                                                                                             | not moved                                                                                                                                 | alert                               |
| "Chain check not independent (development)" (W-26a)                                                             | unchanged                                                                                                                                                                             | a badge in the bar, for the whole session; it hides no control                                                                                                                                                                         | unchanged                                                                                                                         | not moved                                                                                                                                 | once, with the first status         |

Notes on the table:

- "Inert" is W-58: the frame is shown and its game runs, but it takes no input
  and is out of the tab order and the accessibility tree. Only the row of
  `active` with the verdict `ready` has an interactive frame.
- "Frame hidden" in the three final states keeps today's rule that nothing more
  is shown or forwarded to the game (W-53, and the session's end). The stage
  keeps its size, so the height does not change.
- The overlay's heading is the alert's heading where the table says "as the
  alert", so there is still one `role="alert"` region on the page at a time: the
  bar's alert line or the cover, never both. When a round-stopping state and an
  error that does not stop the round come together, the cover holds the first
  and the bar's alert line the second, as the alert panel and the status section
  are two places today.
- Who announces "chain check not independent" and the slow notice is unchanged
  from today; only their place moves.

### Changed requirements, old and new

Short forms; the full proposed text goes into the section files on acceptance.

| ID    | Today                                                                                                                                                                                                                              | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-26  | "The shell MUST NOT show the game as ready ... until the Snapshot is `active` **and** every check below passes."                                                                                                                   | Unchanged in wording. "Shown as ready" is defined for the new layout: the game is sent the round's `active` copy (W-38's hold) and the frame takes input (W-58) only after the verdict is `ready`; the frame being visible is not "shown as ready".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| W-31  | The status table: `idle` shows the bet selector and start; `starting` "preparing the round"; `active` "the game, ready, only after W-26 passed"; `won`, `lost`, `canceled` the result with the next bet; the game hidden otherwise | The same states and inputs, placed by W-57's table: the game frame is shown in every row; the status is the bar's status line; the next bet stays "beside" the result in the bar. "In place of the round" (the unconfirmed state, failed verification, out of sync) means the bar's status line or the stage's cover, never a removed frame. The start control reads "Place bet" at `idle` and "Play again" on a result (Q4, decided A, 2026-10-30). The cash-out control carries the multiplier as a display value.                                                                                                                                                                                                                                                                                                                                                       |
| W-33  | The cancel states each show their heading "in place of the round"; `check-later` beside the alert panel                                                                                                                            | The same states and texts; "this round failed verification" is the stage's cover (frame inert) and the cancel's own status ("Resolving", "Still resolving — contact support", "Round ended") is the bar's status line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W-37  | "the frame is kept for the session's life and hidden unless the round is shown ready (`active` after W-26 passed, or `resolving`, W-31). A book round's frame is also shown at `won` and `lost`"                                   | "the frame is kept for the session's life, at one place and size (W-57), and is shown from its mount until the session ends, except in the final states (the session ended, another tab, a changed session), where the stage's cover replaces it. When it takes input is W-58's."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| W-38  | "`snapshot`: a Snapshot that passed W-28, sent on every accepted change"                                                                                                                                                           | "... sent on every accepted change, except that a config round's `active` Snapshot is held until the shell's verdict for the round is `ready` (W-26); a round that never becomes `ready` is never forwarded as `active`. The `hello` is answered with the last copy forwarded." No message, field, or reason changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| W-40  | "The round id and the link MUST stay visible until the player starts another round"                                                                                                                                                | Unchanged; they stay in the bar's round line. The game frame showing the next round does not remove them before the Snapshot of the round the player started is shown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W-46  | Focus moves to "the result or error heading" only after the player's own action, never after a poll, except the book round's one poll; the frame is blurred first                                                                  | See [W-46 in the new layout](#w-46-in-the-new-layout).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W-49d | `height` is the `<body>`'s box, sent after `welcome` and whenever it changes                                                                                                                                                       | The message and its fields are unchanged; `height` becomes the least height the Wrapper needs (the bar's reserved height plus the stage's minimum), never the viewport or the `<body>`'s box. See [The height](#the-height-w-49d).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| W-49f | The table of which states offer the lobby and deposit                                                                                                                                                                              | Unchanged in substance; the controls sit in the bar's operator links slot. "Game not compatible" stays a "no" row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| W-55  | "On a book round the frame is shown in `won` and `lost` ... and is hidden in every other status and in every blocking state"                                                                                                       | "On a book round the frame is shown as on any round (W-37, W-57); in `won` and `lost` the game plays the draw back beside the Wrapper's result. A changed round (W-52) and a `playback` copy that failed closed show the stage's cover in its place." The focus rule is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| W-57  | (new)                                                                                                                                                                                                                              | The screen: the stage over the control bar, the overlay's two forms, and the state-by-state table above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| W-58  | (new)                                                                                                                                                                                                                              | The frame takes input (no `inert`) only at `active`, in a round the shell holds, with the verdict `ready`, and none of: a `WrapperState.blocking` state (`loading`, `configuration-error`, `session-ended`, `other-tab`, `unsupported-browser`, `verification-failed`, `chain-unverified`, `out-of-sync`, `snapshot-rejected`, `session-changed`), a failed or re-issued verdict, out of sync, `RoundState.unconfirmed`, a cash-out call in flight, the shell's cancel past `none`, or "game not compatible" (Q2, decided B); a connection problem, a typed error, the generic error, the slow notice, and the "chain check not independent (development)" indicator do not make it inert (Q12, decided B); in every other state, `idle` and the results included, the Wrapper sets `inert` on the iframe element. A game MUST play its reveal and playback with no input. |

W-44's list of distinct states is unchanged: each still has its own heading and
text, now on the cover or the status line.

### W-46 in the new layout

Proposed text:

- **W-46.** A status change MUST be announced to assistive technology through
  the one polite live region (`aria-live="polite"`), which reads the bar's
  status line (or, for a state on the stage's cover, the cover's heading), and
  an error through `role="alert"`: the bar's alert line, or the cover when the
  state is on it. Focus moves to the result or error heading (the bar's status
  heading for a result or an unconfirmed action, the alert line's or the cover's
  heading for an error) only when the player's own action caused the change,
  never when a poll did, with the book round's exception (W-55) unchanged: the
  poll that brings the result of the book round the player just started moves
  focus to the result heading, once. When the game's iframe element has the
  focus, the Wrapper blurs it before focusing the heading, as today.
  - **The inert-frame rule** (new). An inert frame cannot hold the focus (W-58).
    When the frame becomes inert while it, or its document, holds the focus, the
    Wrapper MUST move the focus, blurring the frame element first, to the
    heading the change calls for under the rule above when there is one (the
    result heading after a pick that ended the round, the alert's heading), and
    otherwise to the bar's status heading (or the cover's heading when the state
    is on it), **whatever caused the change**, a poll included: the browser
    would otherwise drop the focus to the document's body. With Q2 decided B
    this runs at the end of almost every round played in the frame: a pick
    answered `resolving` moves the focus to the status heading, a pick answered
    with the result to the result heading. It never takes the focus from a
    control of the bar the player is using.
  - **A pick's error keeps the focus in the frame** (new; decided by the human,
    2026-10-30). When the player's own pick, made in the frame during a playable
    round, is answered by a typed error, the generic error, or a connection
    problem (the frame stays interactive, W-58), the focus is not moved: it
    stays in the frame. The error is announced through `role="alert"` (the bar's
    alert line), and a status change through the live region. This is the one
    case where the player's own action does not move the focus to the error
    heading. A pick whose answer ends the round, or makes the frame inert,
    follows the inert-frame rule.
  - **The removed-control rule** (new). When the bar's control that holds the
    focus goes away because the state changed (the start control once the start
    is answered, the cash-out control once the cash-out is), the focus moves to
    the bar's status heading, so it is never dropped to the body.
  - **Into the game** (Q10, decided A, 2026-10-29). The frame becomes
    interactive by a poll (the read that brings the verdict `ready`), and W-46
    lets no poll move the focus. So a second exception, like the book round's:
    when the round the player just started becomes ready, the Wrapper focuses
    the iframe element, once, for that round only, and only if the focus is on
    the bar's status heading or the body (never if the player moved it
    elsewhere). Without it, a keyboard player who started the round must find
    the frame with Shift+Tab.
  - **Order.** The stage comes first in the tab order, then the bar: its status
    heading (focusable only by script, `tabindex="-1"`), the alert's control,
    the primary controls, the round line, and the operator links. An inert frame
    has no tab stop, so outside a playable round the tab order is the bar's
    alone. After the result heading takes the focus, the next tab stop is the
    next bet's selector and "Play again", as W-31 says today.

T-14a keeps its assertions and adds the inert-frame and removed-control rules
and the focus into the frame (Q10).

### The height (W-49d)

Decided by the human, 2026-10-29 (Q6, B): **the Wrapper fills its iframe's
viewport**, and the stage takes the height the bar leaves. The ratio of the box
is the operator page's (16:9 is the common one), so the stage's ratio follows
it.

**Proposed rule (W-57, layout).**

- The Wrapper's document is exactly the height of its viewport: `html` and
  `body` take `height: 100%`, with no margin. The bar sits at the bottom at a
  height `B` that depends only on the width and the player's text size or zoom:
  it reserves the height of its tallest state at that width (the status line
  with one line of detail, the alert line, one row of controls, and the round
  line), so no state makes it grow and the stage never moves. The stage takes
  the rest, `viewport height − B`. Text that does not fit in its slot (a long
  error's detail) scrolls within that slot: the alert line becomes a scrollable
  region, reachable by keyboard (`tabindex="0"` while it overflows), inside the
  bar's reserved height. It never spills onto the stage, so it never covers a
  playable frame; the cover holds only the states the table puts on it. `B`
  scales with the text size, so at 200 % zoom the slots hold the same lines
  (W-47).
- **The minimum the Wrapper supports.** Width: 320 CSS pixels (the reflow width
  of WCAG 2.2, 1.4.10); narrower is not supported, and the bar's slots stack.
  Height: `H_min = B + S`, where `S` is the stage's minimum, PROVISIONAL at 270
  CSS pixels until this spec gives a number (Q14, decided A, 2026-10-29: 320
  pixels wide, a 270-pixel stage, both provisional, with the sticky bar below
  the minimum).
- **Below the minimum height**, the stage keeps `S` and the Wrapper's own
  document scrolls vertically inside the iframe. The bar is sticky at the bottom
  of the viewport, so the status line and the money controls (start, cash-out,
  "check again") stay in view while the stage scrolls under it. When the bar is
  taller than half the viewport (at a high zoom, for example) it is not sticky,
  and the page scrolls as a whole with nothing hidden (W-47: 200 % zoom without
  loss of function). Nothing scrolls horizontally from 320 pixels up.
- **Standalone** (not framed, W-49a), the viewport is the browser window and the
  same rule holds.
- **No `vh` for the page's height.** In an iframe, `vh` and `dvh` resolve
  against the iframe's viewport, which the operator page sets, so they cannot
  loop inside the Wrapper; `height: 100%` is used for `html` and `body` anyway,
  so the standalone page on a phone does not jump with the browser's toolbar
  (`100vh` is the toolbar-hidden height there). The stage's height comes from
  the layout (a flex or grid column), never from a measured value written back
  into a style.

**What `resize` says (W-49d).** Measuring the `<body>`'s box, as today, would
now report the viewport's height: the height the operator page already gave.
That is meaningless as a hint, and it is a **loop risk**: an operator page that
sets the iframe's height from `resize` (as the embedding guide's sample does
today) and whose iframe has a border or padding with `box-sizing: border-box`
gives the Wrapper a viewport smaller than the value it set, which the Wrapper
reports, which the page sets: the box shrinks by the border on every frame until
it reaches its floor (or grows, with the opposite mismatch). So (Q11, decided A,
2026-10-29):

- `height` becomes **the least height the Wrapper's content needs at its current
  width and text size, `H_min = ceil(B) + S`**, an integer from 1 to 16384 as
  today. It is computed from the bar's reserved height (its box measured with
  `getBoundingClientRect`, rounded up, so an operator's `min-height` never falls
  a fraction short) and the stage's minimum, never from the viewport's height or
  the `<body>`'s box. The root element sets `scrollbar-gutter: stable`, so the
  vertical scroll bar that appears below the minimum height never changes the
  content's width, and so never changes `B` or `H_min`. It does not change with
  the round's state or with the iframe's height, so no operator page can drive
  it into a loop.
- It is sent as today: once right after `welcome`, then whenever `H_min` changes
  (a width or text-size change; the height observer watches the bar and the
  width, not the body), at most once per animation frame, never the same value
  twice in a row, only to the fixed operator origin, with no reply.
- An operator page uses it as a **minimum**: it gives the iframe its box (16:9,
  theater, or fullscreen) and keeps the box at least `height` tall
  (`min-height`); it never sets the iframe's height to it. The Wrapper fills
  whatever box it gets.

**Is this a protocol change?** Decided by the human (Q11, A, 2026-10-29): **not
`se.operator/2`, and ADR-006 stands unchanged.** ADR-006 freezes the message set
and each message's fields, and makes "a change to the message set or a message's
fields" `se.operator/2`; it does not define how `height` is computed, which
W-49d does. The message, its fields, their type, and their bound are unchanged,
and so is the field's stated meaning in W-49b, "the height the Wrapper's content
needs": under a layout that fills any box, the content needs exactly `H_min`,
and uses more when it is given more. The operator page was told it "MAY ignore"
`resize` (W-49d), so no operator can depend on it for correctness. What changes
is the value an operator page sees and the advice for using it, which is spec
(W-49d and the embedding guide), not protocol.

It is still a **breaking change for an operator page that sizes the iframe from
`resize`**, as the guide's sample does: that page's iframe would shrink to the
Wrapper's minimum. Nothing is released and no operator integrates yet, so the
change is made in the spec and the guide on acceptance, and the Wrapper's
release notes (a changeset) name it. If the human reads a changed value as a
changed field, the alternative is a new ADR that supersedes ADR-006 and either
records this meaning within `/1` or moves the new `resize` to `/2` (Q11, C).

**The embedding guide's change** (`specs/wrapper/operator-embedding.md`), on
acceptance:

- W-49d's `height` row: "the least height the Wrapper's content needs at its
  current width and text size: the bar's reserved height plus the stage's
  minimum (W-57), never the viewport's height or the `<body>`'s box; an integer
  from 1 to 16384 ...", and its bullets: sent when that minimum changes, never
  when only the iframe's height does.
- The guidance "Size the iframe (optional)" becomes: "Give the iframe its box:
  the width you lay out and the height you want (16:9 is recommended; theater
  and fullscreen work too). The Wrapper fills it. Its `resize` carries `height`,
  the least height it needs: keep your box at least that tall with `min-height`;
  never set the iframe's `height` from it."
- In the guide's sample, the line that sets `frame.style.height` from
  `event.data.height` sets `frame.style.minHeight` instead.
- T-9a's test plan, item 8 (`resize`): the value is `H_min`, the same in every
  state and for every iframe height at one width; a change of the iframe's
  height alone sends nothing; a width or text-size change sends the new minimum.
- The W-49b table's meaning column stays "the height the Wrapper's content needs
  (W-49d)".

### Tests expected

Changed rows:

| Row          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-6          | every `valid/` Snapshot renders in the state of W-57's table: the frame shown (and `inert` or not, by W-58), the overlay's form, the bar's slots and the enabled controls, instead of "the game hidden"; the rest unchanged                                                                                                                                                                                                                                                                                             |
| T-9a         | `resize` sends `H_min` (W-49d as proposed): at one width, every state of a round played to a win and to a typed error, and every iframe height the fake operator page sets, gives the same `height` (no second value); a width change sends a new one; the fake operator page that sets `min-height` from it settles with no further message (no loop); an iframe below `H_min`, where the Wrapper's scroll bar shows, sends no new value; the value is a whole number at or above the bar's fractional height plus `S` |
| T-10 to T-12 | the readiness signal: the e2e harness (`e2e/tests/harness/round-play.ts`) and the preview helpers (`e2e/tests/preview-support/preview-rounds.ts`) wait for the iframe to be visible as "the round is ready"; they wait instead for the frame to take input (no `inert`) and the status "Your round is in play". The preview run is the backend's job at a pinned commit (see Migration)                                                                                                                                 |
| T-14         | the axe scan covers every row of W-57's table, cover and scrim included; keyboard-only play: the start in the bar, the focus on the status heading, then into the frame once ready (Q10) or by Shift+Tab, the picks in the game, the result heading; no tab stop in an inert frame and no keyboard trap around it                                                                                                                                                                                                       |
| T-14a        | adds the inert-frame rule (a focused frame that becomes inert hands the focus to the result, alert, status, or cover heading, on a poll too, never to the body), the removed-control rule, and the tab order of W-46                                                                                                                                                                                                                                                                                                    |
| T-18         | unchanged in what it proves; the malicious game is now visible and inert at `idle` (`inert` does not stop its scripts, so its reads and forged messages are tried as today), and its forged pick is still answered `not_active` with no round call                                                                                                                                                                                                                                                                      |
| T-23         | "the frame shown at `won` and `lost` until the next start and hidden otherwise" becomes "shown in every status, the cover for a changed round and for a copy that failed closed"                                                                                                                                                                                                                                                                                                                                        |
| T-15         | offline at `active` and `ready`: the frame stays interactive; a pick made offline is signed once and pending, the bar shows "Connection problem" and "Waiting for your move to be confirmed.", a second pick is answered `busy` and nothing more is signed, the cash-out control is not offered, and once the connection returns the W-16 rules decide (applied: the Snapshot shown and the alert cleared; lost again: the unconfirmed state, frame inert)                                                              |
| T-16         | each typed error at `active` and `ready` leaves the frame interactive: with a move pending, a pick is answered `busy`; after a refused move (400), `not_active`; with nothing pending, a pick is signed and its Snapshot clears the alert line; the status detail never says a pick was taken before a Snapshot shows it                                                                                                                                                                                                |
| T-24         | the book round plays back to the end in the frame that was shown from `idle`, inert on the result (the test reads the draw from the frame's document; no input is sent to it)                                                                                                                                                                                                                                                                                                                                           |

Tests that assert today's hidden frame and change with it:
`e2e/tests/game-mount.spec.ts` ("hidden at idle"),
`e2e/tests/focus-from-frame.spec.ts`, `apps/wrapper/src/book-round.test.ts`, and
the visibility checks of the round specs (`t10-win`, `t11-loss`, `t12-cash-out`,
`t16-*`, `t19-cancel-paths`, `t9a-operator-round`, `t14-every-state`).

New rows (proposed):

| ID   | Level                   | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-25 | unit/component, Wrapper | the screen (W-57, W-58): for each row of the table, the frame's visibility and `inert`, the overlay's form and heading, the bar's slots, and the enabled controls, as pure functions of the UI's state (as `game-visibility.ts` is today); the frame is interactive only at `active` in a round the shell holds with the verdict `ready` and none of W-58's listed conditions, also while a connection problem, a typed error, the generic error, the slow notice, or the "chain check not independent" indicator shows, and inert in every other state, `idle`, the results, each `WrapperState.blocking` state, and a round the shell does not hold included; no state shows an enabled cash-out, start, or interactive frame while the verdict of an `active` round is not `ready` |
| T-26 | unit, `shell`           | the bridge's hold (W-38): a config round's `active` Snapshot is not forwarded before the verdict is `ready`, then the latest is; a failed check, a re-issue, or out of sync never forwards `active`, and a round whose verdict goes from `ready` to failed, re-issued, or out of sync forwards no `active` Snapshot after that transition while still forwarding its later `resolving` and result; a round the shell does not hold (a `ROUND_ACTIVE` resume) never forwards `active`; the hold applies at mount, at `hello`, and to every later Snapshot; the `hello` is answered with the last forwarded copy; a book round is unaffected; `version` order holds                                                                                                                     |
| T-27 | e2e, browser            | filling the box: in operator boxes of 1280 by 720, 800 by 600, and 400 by 900 CSS pixels the Wrapper fills the box exactly, with no scroll bar, in every state of a round to a win, a loss, and a typed error, and the stage's box does not move between states; in a box below `H_min` the Wrapper's document scrolls with the bar sticky, and the scroll bar does not change the content's width (`scrollbar-gutter: stable`); a long alert scrolls inside the bar and never covers the stage; at 200 % zoom every control stays usable; in all three browser projects                                                                                                                                                                                                              |
| T-28 | unit, `shell`           | `RoundState.pending` (W-16): absent before any action; `move` (or `cash-out`) from the signature, before the send, while the signer's phase is `open` or `adopted`; absent once a Snapshot shows the action applied; absent once a 400 `INVALID_ARGUMENT` or 409 `STALE_ACTION` puts the signer in `stale`, and still absent when a later read shows the action applied (`adopted`) or not (out of sync); absent once the round is re-issued, failed, or closed, or the session has ended; never for a cancel; kept, beside `unconfirmed`, after the lost resend; never a signature, key, or bytes; in the Wrapper, "Waiting for your move to be confirmed." only while `pending` is set and a connection problem, a typed error, or the generic error is shown, never in normal play |

### Optional: lifecycle events to the operator page (`se.operator/2`)

**A follow-up, not part of this RFC's implementation** (Q7, decided A,
2026-10-30): a separate change, `se.operator/2`, and a new ADR that supersedes
ADR-006. This section records what that change starts from. It is **not possible
within `se.operator/1`**: ADR-006 freezes `/1`'s message set and fields, and
`/1` carries "no secret, round id, session id, or amount" (W-49b). Events need
**`se.operator/2`**, through a new ADR that supersedes ADR-006 (its exit
criterion), and the Wrapper MAY accept both versions during a transition
(W-49b). The `hello` would say which version the operator page speaks; how is
part of that ADR.

Proposed messages, Wrapper to operator, after `welcome` only, to the fixed
operator origin only, with no reply; the operator page MAY ignore any of them.
Each is a plain object with exactly its fields. Money is the Snapshot's own
`Amount.value` copied as a base-unit decimal string, with its `unit` and
`decimals`, never a JS `number` and never computed (W-34). Nothing carries a
key, token, launch code, signature, proof, session id, or header.

| `type`         | When                                                                             | Fields (besides `schema`, `type`)                                                                                             |
| -------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `loaded`       | the first Snapshot of the session is validated and shown                         | none                                                                                                                          |
| `ready`        | the game's `hello` was accepted, and the session can take a bet                  | none                                                                                                                          |
| `roundStart`   | the player's start was sent (W-22)                                               | `bet`: `{ value, unit, decimals }` from the start's `AmountRequest`                                                           |
| `roundStarted` | the round is shown ready (W-26 passed; on a book round, its `starting` answer)   | `balance`: `{ value, unit, decimals }` from that Snapshot's `bet.balance`                                                     |
| `roundEnded`   | the round's result is shown (`won`, `lost`, `canceled`, or the cancel's `ended`) | `outcome` (`won`, `lost`, `canceled`, `ended`); `payout` when the Snapshot carries it; `balance`; `roundId` (Q8, decided yes) |

Notes:

- The events are informational. The operator's ledger is the backend's wallet
  contract, never these messages: an operator page MUST NOT credit, debit, or
  settle from them, and a page that disguises the Wrapper gains no control from
  them (RFC-001 Q10's residual risk is unchanged, though the timing of
  `roundStarted` tells such a page when a round becomes playable).
- `roundId` would let the operator page list recent bets with a "verify bet"
  link to the kit's verify page (W-39). The round id is not a secret (it is in
  the verify link already), but `/1` excludes it on purpose; including it in
  `/2` was decided on 2026-10-30 (Q8) and is recorded for the follow-up.
- The names follow the common lifecycle events of embedded games (loaded, ready,
  round start, round started, round ended), so an operator page that already
  listens for such events can map them; this RFC adopts no other message format.
- Tests, if accepted: a T-9a extension (each event's exact fields, sent only
  after `welcome` and only to the operator origin, no event before `welcome`, no
  `number` for money, no secret, never to the game) and an e2e case on the fake
  operator page.

## Alternatives

- **Keep the three pages.** Simplest and safe today; it is what the request
  wants to replace.
- **Show the frame and rely on the shell's refusal alone** (no hold, no
  `inert`). The shell signs nothing either way, but the game would show an
  unverified round as playable. Rejected: it breaks "never reads as ready".
- **A protocol change for readiness**: a `ready` flag in the `snapshot` copy or
  a new Wrapper-to-game message. It would let a game show "checking" in its own
  way, but it changes `se.controller/1` (a closed schema: today's games, the
  reference game included, ignore a copy with an extra field), so it is
  `se.controller/2`. Measure (a) gets the same safety with no protocol change. A
  later increment may still add it.
- **A 16:9 height from the width** (`H = max(round(w × 9 / 16), B + S)`, the
  first draft's rule), reported in `resize` as the content's height. Exact in a
  16:9 box and stable for `resize`, but a scroll bar or empty space in a box of
  any other ratio, theater and fullscreen included. Not chosen (Q6, decided B,
  2026-10-29).
- **An interactive frame at `idle` and on results** (the first draft's Q2, A).
  It keeps the game's own controls and narration there. Not chosen (Q2, decided
  B), for one rule: the game takes input only while a pick can be signed.
- **An inert frame during an error or a connection problem** (Q12, A). Simpler
  to reason about, but it would take the game away during a passing network
  fault; not chosen (Q12, decided B): the shell's gate already refuses or
  serializes every pick then.
- **Stop sending `resize`** once the Wrapper fills its box (Q11, B). Simple, but
  an operator page then cannot learn the least height the Wrapper needs.
- **The result as an overlay on the stage** rather than in the bar. Closer to
  some games, but it covers the game's own reveal and the request puts it in the
  bar.

## Tradeoffs

- The game sees `active` later (after the tip check), so a slow chain check
  shows the game's `starting` view longer. It is the honest state.
- `inert` blocks the game's own controls and hides its content from assistive
  technology everywhere but a playable round, `idle` and the results included
  ([What an inert frame costs](#what-an-inert-frame-costs)).
- The stage's ratio is the operator's box less the bar, not a fixed 16:9, so a
  game must lay out for any stage at least `S` tall and 320 pixels wide
  (guidance for game developers; the reference game's layout already reflows).
- A fixed bar height leaves unused space in states with little to say.
- The bar is dense at narrow widths (the result, the round id, the verify link,
  and the next bet). The round id may be visually truncated with its full text
  kept in the element and its copy control (W-39); how is the implementation's.

## Impact

On acceptance:

- `specs/wrapper.md`: Scope (the single screen), the traceability rows of R2,
  R3, AC5, and the new rows; W-46 restated; the test plan rows above and T-25 to
  T-28; Errors and edge cases (a pick on a visible, unready game).
- `specs/wrapper/rendering-from-the-snapshot.md`: W-31 and W-33 as above, and
  `RoundState.pending` beside `RoundState.unconfirmed`.
- A new section file `specs/wrapper/the-single-screen.md` (Q9, decided A,
  2026-10-30) holds W-57 (the screen, the state-by-state table, the height rule)
  and W-58 (when the frame takes input, and the no-input rule for games), linked
  from the Wrapper spec's Contract section.
- `specs/wrapper/the-game-iframe-and-the-controller-boundary.md`: W-37's frame
  rule and W-38's hold.
- `specs/wrapper/book-playback.md`: W-55.
- `specs/wrapper/operator-embedding.md`: W-49d's new `height`, the guide's
  sizing advice and sample, and T-9a's item 8, as listed in
  [The height](#the-height-w-49d); W-49f unchanged in substance. ADR-006
  unchanged (Q11).
- `specs/client-kit/the-reference-game.md`: the game is visible from `idle` and
  inert outside a playable round; it already plays its reveal and a book round's
  draw with no input, which becomes a stated rule for games (W-58).
- A changeset for the Wrapper app that names the `resize` change for operator
  pages.
- `apps/wrapper`: `render.ts` (the stage and the bar), `game-visibility.ts`
  (shown and `inert`), `state-views.ts`, `round-view.ts`, `styles.css`,
  `messages.ts` (the new labels, "Waiting for your move to be confirmed." and
  its cash-out form included), `height-observer.ts` (it reports `H_min` from the
  bar and the width, no longer the `<body>`'s box).
- `packages/shell`: the hold (measure (a)) in `controller-bridge.ts` (its
  `forward`, also on `hello`), `session-play.ts` (`mountGame` gives a new bridge
  the latest Snapshot at mount, which the hold applies to), `session-reads.ts`
  (`show`, which gives the bridge every later Snapshot), and `round-tracking.ts`
  (the round's verdict the hold reads); the read-only `RoundState.pending` flag
  in `session-types.ts` (a public type, so a changeset); no change to signing,
  the transcript, or the checks.
- `specs/client-kit/the-shell-package.md`: `RoundState.pending` beside
  `unconfirmed`, and the bridge's hold.
- The Wrapper's size budget (`pnpm check:size-budget`) is to be watched; no new
  dependency.
- No change to the Play API, the Snapshot schema, or `se.controller/1`. The
  optional events change `se.operator` (a new ADR).
- `.ai/memories/architecture.md`: the single screen, the bridge's hold, and
  `RoundState.pending`.

## Migration considerations

- Nothing is released to players yet; no deployed operator page depends on
  today's heights. An operator page that copied the guide's sample (the iframe's
  `height` from `resize`) would see its iframe shrink to the Wrapper's minimum,
  and must switch to `min-height` and a box of its own; the e2e suite's fake
  operator page changes with the guide.
- The preview-stack run (T-10 to T-12) is the backend's job at a pinned commit
  of this repository. The helpers that wait for a visible iframe change in the
  same change as the layout, so the backend's next pin bump takes both; an old
  pin keeps working against the old layout.
- A game that renders `idle` as a blank page shows a blank stage, and a game
  that waits for a click during its reveal or playback stalls, since the frame
  is inert then. The reference game does neither; third-party game developers
  are told that the frame is visible from `idle` on, inert outside a playable
  round, and sized by the operator's box.

## Decisions (2026-10-29 and 2026-10-30)

Decided by the human on the dates given; the RFC was approved as a whole on
2026-10-30. The spec or ADR that will hold each is named.

| Q   | Decision                                                                                                                                                                                                                                                                                                                          | Where it goes on acceptance                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Q1  | **A.** The bridge holds back a config round's `active` Snapshot until the shell's verdict is `ready`, and the frame is inert under the see-through checking scrim. No protocol change                                                                                                                                             | W-38 (the hold), W-58, W-57's table                                                                |
| Q2  | **B** (against the first recommendation). The frame takes input only at `active` with the verdict `ready`; it is inert at `idle`, on results, while checking, and in every blocked state. Consequences: [What an inert frame costs](#what-an-inert-frame-costs), the inert-frame and removed-control rules of W-46, Q10, Q12, Q13 | W-58, W-46, W-55, the reference game spec                                                          |
| Q5  | **A.** "Game not compatible" shows the cover, and no start control                                                                                                                                                                                                                                                                | W-57's table, W-38                                                                                 |
| Q6  | **B** (against the first recommendation). The Wrapper fills its iframe's viewport; the stage takes the height the bar leaves. Consequences: [The height](#the-height-w-49d), the new meaning of `resize`'s value (Q11), the minimum viewport (Q14)                                                                                | W-57, W-49d, the embedding guide in `specs/wrapper/operator-embedding.md`; ADR-006 unchanged (Q11) |
| Q10 | **A.** When the round the player started becomes ready, the iframe element takes the focus once, for that round, if the focus is on the bar's status heading or the body: a second poll exception, like the book round's                                                                                                          | W-46                                                                                               |
| Q11 | **A.** `resize` sends the least height the Wrapper needs (the bar's reserved height plus the stage's minimum), the same `se.operator/1` message; ADR-006 unchanged; the embedding guide's advice and sample change to `min-height`                                                                                                | W-49d, the embedding guide in `specs/wrapper/operator-embedding.md`                                |
| Q12 | **B** (against the recommendation). During a playable round (`active` and `ready`), a typed error, the generic error, or a connection problem does not make the frame inert; only the blocking states and W-58's other conditions do. Consequences: [A pick during an error or offline](#a-pick-during-an-error-or-offline)       | W-58, W-57's table, `RoundState.pending`                                                           |
| Q13 | **A.** The game's own controls and narration outside a playable round are lost for the first release; a game MUST play its reveal and playback with no input; Wrapper-side sound and skip controls are a later controller increment                                                                                               | W-58, the reference game spec                                                                      |
| Q14 | **A.** 320 CSS pixels wide and a 270-pixel stage minimum, both provisional; below the minimum height the Wrapper's document scrolls under a sticky bar                                                                                                                                                                            | W-57                                                                                               |
| Q3  | **A** (2026-10-30). "Cash out" with the multiplier as a display value now; a server-computed cash-out `Amount` on `active` is asked of the backend (an issue to be filed), and the `TODO(backend Snapshot contract)` stays until it is vendored                                                                                   | W-31, W-57's table, the TODO                                                                       |
| Q4  | **A** (2026-10-30). "Place bet" at `idle`, "Play again" on a result, the bet selector preset to `defaultBet` as today                                                                                                                                                                                                             | W-31, `messages.ts`                                                                                |
| Q7  | **A** (2026-10-30). The lifecycle events are a follow-up: a separate change, `se.operator/2`, and a new ADR superseding ADR-006; not part of this RFC's implementation                                                                                                                                                            | the follow-up's ADR and the operator-embedding spec                                                |
| Q8  | **Yes** (2026-10-30). `roundEnded` carries the round id; recorded for the follow-up                                                                                                                                                                                                                                               | the follow-up's ADR                                                                                |
| Q9  | **A** (2026-10-30). W-57 and W-58 live in a new section file, `specs/wrapper/the-single-screen.md`                                                                                                                                                                                                                                | `specs/wrapper/the-single-screen.md`                                                               |

Also decided by the human on 2026-10-30, after the reviewer's findings: the RFC
is folded into the specs and archived in the docs change, before the code (as
RFC-003 was), and a typed error or connection problem that answers the player's
own pick in a playable round keeps the focus in the frame, announced through the
alert (W-46).

## Unresolved questions

None. Every question is decided (above).
