# The single screen

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

Status: **decided by the human, 2026-10-29 and 2026-10-30**
([RFC-004](../../rfcs/archived/RFC-004-single-screen-wrapper.md), archived).
Built: the shell's part, W-38's hold applied by the session
([The hold](./the-game-iframe-and-the-controller-boundary.md)) and
`RoundState.pending` ([below](#a-pick-during-an-error-or-offline)), and the
Wrapper's: the stage and the bar (`apps/wrapper/src/render.ts`, `stage-view.ts`,
`bar-view.ts`), what the stage shows and when the frame takes input
(`stage-plan.ts`), the focus rules (`focus-rules.ts`), and the height
(`styles.css`, `height-observer.ts`).

The Wrapper is one screen: the game frame stays in one place at one size for the
whole session, over one control bar that changes in place. The shell keeps every
money control and every signature (W-20 to W-27); the game still sends only
picks (W-38). What hiding the frame did before, this file keeps by other means:
**a round never reads as ready before the shell's checks pass** (W-26).

Out of scope: the operator page's own controls (fullscreen, theater mode, a real
or fun toggle, a recent-bets list), which an operator page may build around the
Wrapper's iframe; a player-initiated cancel (W-25: `se.controller/1` has no verb
for it); a live cash-out amount before the backend serves one (below); and
lifecycle events to the operator page, a follow-up that needs `se.operator/2`
and a new ADR superseding ADR-006 (RFC-004 Q7, decided 2026-10-30; `roundEnded`
will carry the round id, Q8).

## The screen

- **W-57.** The Wrapper's page is one screen of two parts, in this order in the
  document and on screen:
  1. **The stage**, on top: the game frame (W-37) and, over it when a state
     calls for one, the Wrapper's **overlay**. The frame is mounted once per
     session, when the session is wired and before any round (`mountGame` in
     `apps/wrapper/src/session-wiring.ts`), and is never removed or resized by a
     status change.
  2. **The control bar**, under the stage, which changes in place. Its slots:
     - the **status line**: the state's heading (a heading element, focusable by
       script only, `tabindex="-1"`, announced politely) and at most one line of
       detail;
     - the **alert line**: the `role="alert"` region for an error that does not
       stop the round (a typed error, the generic error, a connection problem),
       except when a cover state owns the region ("One `role="alert"` region at
       a time", below). **The alert overlays the status**: the alert line has no
       slot of its own; it sits in the status line's slot, under the status
       heading, in the place of the status detail. A state that shows a status
       detail with an error (the waiting detail below, the slow notice, the
       state's own detail) keeps it, between the heading and the alert, and the
       slot scrolls. The status line and the alert line together are the
       **status slot**;
     - the **primary controls**: the bet selector and the start control, or the
       cash-out control, or "check again", as the state gives them;
     - the **round line**: the payout and the balance on a result, and the round
       id with its copy control and the verify link (W-39) when shown;
     - the **operator links**: the lobby and deposit controls (W-49e, W-49f).

     A slot with nothing to show stays empty. The bar never shows a disabled
     placeholder for a control the state does not offer, so no control reads as
     usable while it is not.

  **The overlay** is a panel over the stage, at the stage's size, for a state in
  which the round cannot be played or the game cannot be shown. It holds a
  heading and its detail, and, for an error, the `role="alert"` content. It is
  not a dialog and traps no focus; the bar stays operable. Two forms:
  - the **scrim**: translucent, so the game stays visible behind it, while a
    round is being checked;
  - the **cover**: opaque, for a state in which the game's view must not be read
    as the round's, and for the final states.

  Before a session exists (loading, the configuration error, a browser without
  Web Locks) there is no frame, and the stage shows the cover at the same size.

  **Labels** (W-48's language rule applies to each): the start control reads
  "Place bet" at `idle` and "Play again" on a result, with the bet selector
  preset to `defaultBet` as today (RFC-004 Q4). The cash-out control reads "Cash
  out" with the Snapshot's `currentMultiplier` beside it as a display value
  (`×1.94`); it shows no amount, since `se.snapshot/1` carries none on an
  `active` round and W-34 forbids computing one from a multiplier (Q3).
  <!-- TODO(backend Snapshot contract): a server-computed cash-out value (an `Amount`) on an `active` steps round, asked of the backend; until it is vendored the control shows the multiplier only (RFC-004 Q3). -->

### State by state

What the stage and the bar show in each state, which controls are enabled, where
the focus goes, and what is announced. "Inert" is W-58. "Player" means the
change came from the player's own action; "poll" means any read the player did
not ask for (W-35, W-46). "Announced" is the polite live region unless it says
alert. Labels marked **new** are added by this file; the others are the
Wrapper's current labels.

| State                                                                                                           | Stage (frame, overlay)                                                                                                                                                                | Bar                                                                                                                                                                                                                                            | Enabled controls                                                                                      | Focus                                                                                                                 | Announced                                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Loading, or framed before `welcome` (W-49c)                                                                     | no frame yet; cover: "Loading the game"                                                                                                                                               | empty                                                                                                                                                                                                                                          | none                                                                                                  | not moved                                                                                                             | the heading                                          |
| Configuration error; the browser has no Web Locks (W-14)                                                        | no frame; cover: the state's heading and detail                                                                                                                                       | empty (W-49f: no link)                                                                                                                                                                                                                         | none                                                                                                  | not moved                                                                                                             | the heading                                          |
| `idle`                                                                                                          | frame shown, inert (view only); the game shows its own idle view                                                                                                                      | status "Place your bet"; the balance; the bet selector (W-31) and **new** "Place bet"; on a book round the RTP line (W-56); lobby and deposit (W-49f)                                                                                          | bet selector, start, lobby, deposit                                                                   | not moved                                                                                                             | the status line                                      |
| `idle` with a typed error or the generic error (a void, `INSUFFICIENT_FUNDS`, ...)                              | as `idle`                                                                                                                                                                             | as `idle`, and the alert line: the code's message, the `requestId`, and its control ("Back to start" for the four voided-start codes, "Try again" when retryable, the deposit for funds, W-42)                                                 | as `idle`, and the alert's control                                                                    | the alert's heading, after the player's start                                                                         | alert                                                |
| A start or cash-out call in flight                                                                              | unchanged; inert for a cash-out (W-58)                                                                                                                                                | unchanged; the pressed control is busy (`aria-disabled`) until the answer; no lobby or deposit (W-49f)                                                                                                                                         | none                                                                                                  | stays on the pressed control; when the control goes, the status heading (W-46)                                        | nothing new                                          |
| `starting` (config or book)                                                                                     | frame shown, inert; the game shows its own `starting` view                                                                                                                            | status "Preparing the round", detail "The round is being prepared and checked."                                                                                                                                                                | none                                                                                                  | not moved                                                                                                             | the status line                                      |
| `active`, verdict not yet `ready` (W-26 checking)                                                               | frame shown, inert, the game held at its last copy (W-38's hold); scrim with "The round is being checked before you play."                                                            | status "Preparing the round"                                                                                                                                                                                                                   | none                                                                                                  | not moved                                                                                                             | the status line                                      |
| `active`, verdict `ready`                                                                                       | frame shown, interactive (the only such row); no overlay                                                                                                                              | status "Your round is in play"; the multiplier; "Cash out" with the multiplier when the shell offers it (W-24); no lobby or deposit                                                                                                            | game picks; cash-out when offered                                                                     | the iframe element, once, when the round the player started becomes ready (W-46); a pick keeps the focus in the frame | the status line                                      |
| `active`, a round the shell does not hold (a `ROUND_ACTIVE` resume, W-42; a round left open by an earlier page) | frame shown, inert, the game held at its last copy (W-38's hold); cover: **new** "This round can't be played here" and **new** "Nothing is signed for it. It ends by its time limit." | empty; no lobby or deposit (W-49f)                                                                                                                                                                                                             | none                                                                                                  | the cover's heading, after the player's start that led to it; otherwise not moved                                     | the cover's heading                                  |
| `active`, a move or cash-out not confirmed (W-16)                                                               | frame shown, inert; the game waiting                                                                                                                                                  | status "Your move hasn't been confirmed" (or the cash-out's), detail "If it never arrives, the round ends by its time limit."; the round id; "Check again"                                                                                     | "Check again"                                                                                         | the status heading, after the player's own action only                                                                | the status line                                      |
| `resolving`                                                                                                     | frame shown, inert; the game shows its own `resolving` view                                                                                                                           | status "Resolving", detail "The result is being settled."                                                                                                                                                                                      | none                                                                                                  | not moved                                                                                                             | the status line                                      |
| Slow (W-35's "taking longer than expected")                                                                     | unchanged                                                                                                                                                                             | the status line's detail becomes "This is taking longer than expected."                                                                                                                                                                        | unchanged                                                                                             | not moved                                                                                                             | the notice                                           |
| `won`                                                                                                           | frame shown, inert (view only); the game shows the reveal (a book round plays the draw back, W-55)                                                                                    | status "You won" with its icon; "Payout" and the `formatted` amount, the balance; the round id, its copy control, the verify link; the next bet: the bet selector and **new** "Play again"; lobby, deposit                                     | bet selector, "Play again", copy, verify link, lobby, deposit                                         | the status heading, after the player's own action (W-46, and its book exception)                                      | the status line                                      |
| `lost`                                                                                                          | as `won`                                                                                                                                                                              | as `won`, "You lost", the payout only when `payout.value` is above 0 (W-34)                                                                                                                                                                    | as `won`                                                                                              | as `won`                                                                                                              | the status line                                      |
| `canceled` (also with `closeReason: "expired"`)                                                                 | as `won`                                                                                                                                                                              | as `won`, "Round canceled" with its detail, and "The time limit ended this round." on `expired` (W-33)                                                                                                                                         | as `won`                                                                                              | as `won`                                                                                                              | the status line                                      |
| A book round's result whose `playback` copy failed closed (W-38, W-55)                                          | cover: "The game can't show this round."                                                                                                                                              | as `won` or `lost`                                                                                                                                                                                                                             | as `won`                                                                                              | as `won`                                                                                                              | the status line                                      |
| Connection problem (W-43)                                                                                       | as the round's state (at `active` and `ready` the frame stays interactive, W-58)                                                                                                      | as the round's state, and the alert line: "Connection problem", its detail, "Your device is offline." when it is; while a move or cash-out is pending, the status detail **new** "Waiting for your move to be confirmed."; no lobby or deposit | as the round's state; game picks go to the shell's gate ([below](#a-pick-during-an-error-or-offline)) | after a control of the bar: the alert's heading; after a poll or a pick in the frame: not moved (W-46)                | alert (plain text when a cover state owns the alert) |
| A typed error or the generic error during a round                                                               | as the round's state (at `active` and `ready` the frame stays interactive, W-58)                                                                                                      | as the round's state, and the alert line with its control (W-42); while a move or cash-out is pending, the status detail "Waiting for your move to be confirmed."                                                                              | as the round's state, game picks through the shell's gate, and the alert's control                    | after the player's action in the bar: the alert's heading; after a pick in the frame: stays in the frame (W-46)       | alert (plain text when a cover state owns the alert) |
| Round failed verification (W-26), a re-issue, a changed round in play (W-52)                                    | frame inert; cover: "This round failed verification" and its detail, as the alert                                                                                                     | empty but the lobby (W-49f)                                                                                                                                                                                                                    | lobby                                                                                                 | the cover's heading, after the player's action; the inert-frame rule (W-46)                                           | alert                                                |
| Could not verify the chain (W-26a)                                                                              | frame inert; cover: "Could not verify the chain" and its detail, as the alert                                                                                                         | empty (W-49f: no link)                                                                                                                                                                                                                         | none                                                                                                  | as above                                                                                                              | alert                                                |
| Out of sync (W-19)                                                                                              | frame inert; cover: "This round is out of sync" and its detail, as the alert                                                                                                          | the round id and the verify link; the lobby                                                                                                                                                                                                    | copy, verify link, lobby                                                                              | as above                                                                                                              | alert                                                |
| Snapshot rejected (W-28)                                                                                        | frame inert; cover: "The game state could not be read" and its detail, as the alert                                                                                                   | the lobby (no retry, as today)                                                                                                                                                                                                                 | lobby                                                                                                 | as above                                                                                                              | alert                                                |
| "Game not compatible" (W-38)                                                                                    | frame inert; cover: "This game is not compatible with the player."                                                                                                                    | empty (W-49f: no link); no start control                                                                                                                                                                                                       | none                                                                                                  | not moved (it follows the game's `hello`, not the player)                                                             | alert                                                |
| The shell's cancel `in-flight` or `settling` (W-25, W-33)                                                       | frame inert; cover: "This round failed verification", as the alert                                                                                                                    | status "Resolving" while a `resolving` read shows; nothing else                                                                                                                                                                                | none                                                                                                  | not moved                                                                                                             | the status line; the cover as alert                  |
| The shell's cancel `check-later`                                                                                | frame inert; cover: "This round failed verification", as the alert                                                                                                                    | status "Still resolving — contact support"; the round id and the verify link; "Check again"                                                                                                                                                    | "Check again", copy, verify link                                                                      | the result it settles on, after "check again"                                                                         | the status line                                      |
| The shell's cancel `ended`                                                                                      | frame shown, inert (view only); no overlay                                                                                                                                            | status "Round ended"; the round id and the verify link; the next bet; the balance of the one read after it (W-33)                                                                                                                              | as `won`                                                                                              | as `won`                                                                                                              | the status line                                      |
| The shell's cancel `not-taken`                                                                                  | as round failed verification                                                                                                                                                          | as round failed verification                                                                                                                                                                                                                   | lobby                                                                                                 | as above                                                                                                              | alert                                                |
| The shell's cancel `sent`, with `canceled`, `won`, or `lost`                                                    | as the result                                                                                                                                                                         | as the result, with W-33's line ("This round failed verification and was canceled.", or "...; it closed before the cancel arrived.")                                                                                                           | as `won`                                                                                              | as `won`                                                                                                              | the status line                                      |
| Session ended (W-7, W-42)                                                                                       | frame hidden; cover: "Your session has ended" and its detail                                                                                                                          | the lobby, labelled "Relaunch from the lobby" (W-49f)                                                                                                                                                                                          | lobby                                                                                                 | the cover's heading only when the player's own call ended it (W-46); otherwise not moved                              | alert                                                |
| Open in another tab (W-14)                                                                                      | frame hidden; cover: "This session is open in another tab" and its detail                                                                                                             | the lobby                                                                                                                                                                                                                                      | lobby                                                                                                 | not moved                                                                                                             | alert                                                |
| A changed session (W-53)                                                                                        | frame hidden; cover: "This round failed verification", "The game changed during this session. Reload to continue."                                                                    | the lobby                                                                                                                                                                                                                                      | lobby                                                                                                 | not moved                                                                                                             | alert                                                |
| "Chain check not independent (development)" (W-26a)                                                             | unchanged (it does not make the frame inert)                                                                                                                                          | a badge in the bar, for the whole session; it hides no control                                                                                                                                                                                 | unchanged                                                                                             | not moved                                                                                                             | once, with the first status                          |

- "Frame hidden" in the three final states keeps the rule that nothing more is
  shown or forwarded to the game (W-53, and the session's end). The stage keeps
  its size.
- **One `role="alert"` region at a time.** The page keeps one alert region and
  one polite live region, as today (`render.ts`, W-46). Where the table says "as
  the alert", the cover's heading is the alert's heading and the cover owns the
  region; otherwise the bar's alert line owns it. When a state the cover shows
  as the alert and an error that does not stop the round (a typed error, the
  generic error, a connection problem) show together, **the cover owns the
  `role="alert"` region**, as the round-stopping state takes the one alert panel
  today (`alertContent` in `state-views.ts` returns the blocking state before a
  problem or a connection problem). The bar's error is then **plain text** in
  the alert line, with no `role` and no live-region announcement: it keeps its
  icon with its text alternative and its visible styling (W-47), and loses only
  the `role` and the announcement; it is visible, never announced twice, and
  never competes with the cover's alert. It takes no focus; under W-46 the focus
  goes to the cover's heading when the player's own action brought the cover
  state, and otherwise stays where it is (on the bar's control the player used,
  such as "Check again"). If the bar's error is still shown when the cover's
  state ends, the alert line takes the region then and its text is announced
  through it.
- W-44's list of distinct states is unchanged: each keeps its own heading and
  text, on the cover or the status line.

### The height

The Wrapper fills its iframe's viewport, and the stage takes the height the bar
leaves (RFC-004 Q6). The ratio of the box is the operator page's (16:9 is the
common one), so the stage's ratio follows it.

- The Wrapper's document is exactly the height of its viewport: `html` and
  `body` take `height: 100%`, with no margin; the root element sets
  `scrollbar-gutter: stable`. The bar sits at the bottom at a height `B` that
  depends only on the width and the player's text size or zoom: it reserves the
  height of its tallest state at that width (the status slot, one row of
  controls, the operator links, and the round line), so no state makes it grow
  and the stage never moves. The stage takes the rest, `viewport height − B`.
  The status slot reserves the status heading (one line) and one detail line,
  the taller of the status detail and the alert line (the alert's heading and
  its first line): the alert takes the detail line's place when it shows, so an
  error does not change `B`.
- **The slots by width** (CSS `rem`, so they follow the text size):
  - from 64rem: the status slot takes the rest of the width, with the primary
    controls and the operator links side by side on its right; the round line is
    a row of its own under them;
  - from 40rem to 64rem: the status slot spans two rows on the left, the primary
    controls over the operator links on the right; the round line under them;
  - under 40rem: the slots stack, in the order status slot, primary controls,
    round line, operator links.

  The round line reserves one row of its controls from 72rem up and two rows
  below. The development badge (W-26a) takes a row above the slots only while it
  shows; it is set for the session, so it never changes `B` between states.

- **Overflow stays in the bar.** Text that does not fit in its slot (a long
  error's detail, or a status detail and an error shown together) scrolls within
  that slot: the status slot, which holds the alert line, becomes a scrollable
  region, reachable by keyboard (`tabindex="0"` while it overflows), inside the
  bar's reserved height. It never spills onto the stage, so it never covers a
  playable frame; the cover holds only the states the table puts on it. `B`
  scales with the text size, so at 200 % zoom the slots hold the same lines
  (W-47).
- **The minimum the Wrapper supports** (RFC-004 Q14, provisional): 320 CSS
  pixels wide (the reflow width of WCAG 2.2, 1.4.10; narrower is not supported,
  and the bar's slots stack), and `H_min = ceil(B) + S` tall, where `S`, the
  stage's minimum, is PROVISIONAL at 270 CSS pixels until this spec gives
  another number.
- **Below the minimum height** the stage keeps `S` and the Wrapper's own
  document scrolls vertically inside the iframe. The bar is sticky at the bottom
  of the viewport, so the status line and the money controls (start, cash-out,
  "check again") stay in view while the stage scrolls under it; when the bar is
  taller than half the viewport (at a high zoom, for example) it is not sticky,
  and the page scrolls as a whole with nothing hidden (W-47).
  `scrollbar-gutter: stable` keeps the scroll bar from changing the content's
  width, and so `B`. Nothing scrolls horizontally from 320 pixels up.
- **Standalone** (not framed, W-49a), the viewport is the browser window and the
  same rule holds.
- **No `vh` for the page's height.** In an iframe, `vh` and `dvh` resolve
  against the iframe's viewport, which the operator page sets, so they cannot
  loop inside the Wrapper; `height: 100%` is used anyway, so the standalone page
  on a phone does not jump with the browser's toolbar. The stage's height comes
  from the layout (a flex or grid column), never from a measured value written
  back into a style.
- **What `resize` reports** is `H_min`, the least height the content needs, not
  the viewport's height or the `<body>`'s box (W-49d; RFC-004 Q11;
  [ADR-010](../../decisions/ADR-010-resize-height-is-a-minimum.md), accepted).
  Reporting the box would echo the operator page's own height and could loop
  with a page that sets the iframe's height from it.

## When the frame takes input

- **W-58.** The Wrapper sets the `inert` attribute on the game's iframe element
  in every state but one: the round is `active`, the shell holds it and its
  verdict is `ready` (W-26), and none of these holds:
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

  These do **not** make the frame inert (RFC-004 Q12): a connection problem
  (W-43), a typed error, the generic error, the slow notice (W-35), the "chain
  check not independent (development)" indicator (W-26a), a move in flight (the
  bridge answers a second pick `busy` and the game shows its own wait), and
  `RoundState.pending`. So the frame is inert at `idle`, while preparing and
  checking, while `resolving`, on every result, in a round the shell does not
  hold, and in every blocked state.

  `inert` takes the frame out of the tab order and the accessibility tree and
  blocks the player's input to it; the browser applies it to the frame's
  document (`e2e/tests/t14a-inert-frame.spec.ts` checks a click and the Tab key
  in each browser project; confirmed in Chromium, 2026-10-30; Firefox and WebKit
  to be confirmed by their CI jobs). It does not stop the game: its scripts,
  timers, animation, audio, `postMessage`, and rendering run as before, and the
  bridge keeps sending it Snapshots (subject to W-38's hold). The scrim is drawn
  over the inert frame while the round is checked, and the cover in the states
  the table names.

  **The rule for games.** A game MUST play its reveal and a book round's
  playback to the end with no player input, and MUST NOT need input outside an
  `active` round. A book round takes no input but the Wrapper's start (W-50),
  and a steps round's reveal is drawn from the copy's `selectedIndex` and
  `losingIndex`, so the protocol needs none. What a game cannot offer while
  inert (a sound or mute toggle, settings, a paytable or help panel, a skip or
  replay control, a "click to continue", scrolling) is not available outside a
  playable round, and a screen reader does not read the game's content there;
  the bar carries the state and the result as text (W-31, W-39). Accepted for
  the first release (RFC-004 Q13).
  <!-- TODO(later controller increment): Wrapper-side sound and skip controls for a game whose frame is inert outside a playable round (RFC-004 Q13). -->

  W-58 is defense in depth. The trust measure is W-38's hold: the untrusted game
  is never sent an `active` Snapshot that has no `ready` verdict. Neither
  replaces the shell's own gate: the pick use case still re-checks W-26 and W-23
  (W-38).

### A pick during an error or offline

At `active` with the verdict `ready`, the frame stays interactive while a typed
error, the generic error, or a connection problem shows, so the player can pick
then. The shell's gate decides every pick (`gate` in
`packages/shell/src/round-actions.ts`; W-15 to W-19, W-23, W-38):

| Case                                                                                                                                                                                          | What the shell does with the pick                                                                                                                                                                                                                                                                        | What the game is told                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A move or cash-out is signed and not seen applied (pending): its send was lost (offline), or answered a 500 `INTERNAL` or a 503 marked `retryable: false`, or the transport is still retrying | refuses it and signs nothing (W-15: one action per sequence); the pending action is resent at most once, with the same bytes and key, only after a read shows it not applied (W-16, W-43); a resend lost too gives the unconfirmed state, which makes the frame inert                                    | `reject: busy`                                                 |
| The last move or cash-out was refused by a 400 `INVALID_ARGUMENT` (a 409 `STALE_ACTION` is the out-of-sync state)                                                                             | refuses it: signing is held until a read shows the shell's own action applied, otherwise the round is out of sync (W-19)                                                                                                                                                                                 | `reject: not_active`                                           |
| A pick for a row the shell already signed                                                                                                                                                     | refuses it (W-15)                                                                                                                                                                                                                                                                                        | `reject: not_legal`                                            |
| Nothing pending: the error came from something else (a read, a refused "check again"), or the browser is offline with nothing pending                                                         | signs the move, records it, then sends it (W-16). Online, the answer is the round's next Snapshot, shown as the player's action; a newer accepted Snapshot clears the typed error, the generic error, and the connection problem. Offline, the send is lost and the move is pending, as in the first row | nothing on acceptance (W-38); the next Snapshot shows the move |

A pick made during an error or offline is either refused with a reason the game
shows, or signed once and confirmed only by a Snapshot. The Wrapper never
reports success for an action whose outcome it has not read (W-43), and no
second action is signed at the sequence.

**The bar MUST NOT let a pick read as taken before a Snapshot shows it.**

- When a connection problem, a typed error, or the generic error is shown while
  a move or cash-out is pending, the status line's detail reads **new** "Waiting
  for your move to be confirmed." (or "Waiting for your cash-out to be
  confirmed."), with the alert line in the status slot, until a Snapshot shows
  the action applied, the alert clears, or the unconfirmed state replaces it.
  With no error shown it never appears, so normal play, where a move is pending
  only between its send and its answer, never flashes it. The status heading
  stays "Your round is in play", and the multiplier stays that of the last
  Snapshot.
- The cash-out control is not offered while an action is pending or a call is in
  flight (W-24, `cashOutOffered`).
- **`RoundState.pending`** (`move` or `cash-out`) is the flag the session gives
  the UI for this, beside `unconfirmed`. It is derived and read only: the round
  signer's pending move or cash-out (`RoundSigner.pending()`, never a cancel)
  while the signer's phase (`phase()`) is `open` or `adopted`, and absent
  otherwise. So it is set from the signature (recorded before its send, W-16)
  until a Snapshot shows the action applied, and it is absent once a final
  answer has held signing (a 400 or a 409 puts the signer in `stale`, W-19,
  where the action stays pending inside the signer until a read shows it
  applied, `adopted`, or not, out of sync), once the round is out of sync,
  re-issued, failed, or over, and once the session has ended. It carries no
  signature, key, or bytes (W-41). `unconfirmed` is set only once the action's
  one W-16 resend was lost too; `pending` stays set beside it, since the phase
  is still `open` or `adopted`, and the unconfirmed view (W-16) replaces the
  waiting detail.
- Focus: a pick that the shell refuses does not move focus (the game shows the
  reject); a pick's error keeps the focus in the frame (W-46).

## The focus

W-46 states the focus rules for the single screen (the inert-frame rule, a
pick's error staying in the frame, the removed-control rule, the focus into the
game when the round the player started becomes ready, and the tab order). They
are in [Accessibility](../wrapper.md#accessibility).

## Tests

Rows T-25 to T-28 of the [test plan](../wrapper.md#test-plan), and the
single-screen parts of T-6, T-9a, T-10 to T-12, T-14, T-14a, T-15, T-16, T-18,
T-23, and T-24. The tests that assert the hidden frame today change with it:
`e2e/tests/game-mount.spec.ts`, `e2e/tests/focus-from-frame.spec.ts`,
`apps/wrapper/src/book-round.test.ts`, and the visibility checks of the round
specs; the readiness signal of `e2e/tests/harness/round-play.ts` and
`e2e/tests/preview-support/preview-rounds.ts` (a visible iframe) becomes the
frame without `inert` and the status "Your round is in play". The preview run is
the backend's job at a pinned commit, so its next pin bump takes the layout and
the helpers together.
