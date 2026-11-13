# The single screen

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

Status: **decided by the human, 2026-10-29 and 2026-10-30**
([RFC-004](../../rfcs/archived/RFC-004-single-screen-wrapper.md), archived). The
control bar, version 2 (W-57's bar, W-59 to W-61, and the inset of the game
frame) is [RFC-005](../../rfcs/active/RFC-005-control-bar-v2.md)'s, **built on
the recommendations of its questions Q1 to Q10, pending the human's decision**;
where this file and RFC-005 differ, RFC-005's decisions hold once taken. Built:
the shell's part, W-38's hold applied by the session
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
for it); a cash-out amount the Wrapper would compute itself (W-34: the control
shows the Snapshot's `cashOutValue`, below); and lifecycle events to the
operator page, a follow-up that needs `se.operator/2` and a new ADR superseding
ADR-006 (RFC-004 Q7, decided 2026-10-30; `roundEnded` will carry the round id,
Q8).

## The screen

- **W-57.** The Wrapper's page is one screen of two parts, in this order in the
  document and on screen:
  1. **The stage**, on top: the game frame (W-37) and, over it when a state
     calls for one, the Wrapper's **overlay**. The frame is mounted once per
     session, when the session is wired and before any round (`mountGame` in
     `apps/wrapper/src/session-wiring.ts`), and is never removed or resized by a
     status change.
  2. **The control bar**, under the stage, or floating over its bottom on a wide
     screen ([The height](#the-height)), which changes in place. It is one line
     of controls (RFC-005 section 1), each 2.75rem tall (44 CSS pixels at the
     default text size) with a radius of 0.5rem, so the row has one centre line,
     in this visual and tab order: the **menu**, the **balance**, the **bet**
     (the stepper, W-31), the **status slot**, and the **start control**.
     W-26a's badge sits in a row of its own above, for the whole session. Its
     top edge is the **state edge** (W-60). The bar element itself takes the
     focus on a click (`tabindex="-1"`, not a tab stop), and while the focus is
     on the bar itself, never on one of its controls, a field, or the game
     frame, Space presses the start control (Q5); never a cash-out. The start
     control names the shortcut in its tooltip and `aria-keyshortcuts`, not in a
     visible hint. Its slots:
     - the **menu**: a button whose popover holds "This session" (the time since
       the session opened, in whole minutes, and the rounds played, kept in
       memory only, never stored, logged, or sent; no amount, Q4), then the
       lobby and the deposit, each exactly when W-49f offers it. In the
       session-ended state the lobby is the only way out, so there it is a
       visible control in the start control's place, not an item of the menu.
       Links to the game's rules and to responsible gaming are not offered: they
       need a source the Wrapper does not have (Q4). The menu shows in every
       state with a session (not while loading, in the configuration-error
       state, or in a browser without Web Locks);
     - the **balance**: the Snapshot's `bet.balance.formatted` under its label,
       while the bar shows the round; its slot keeps a minimum width, so a
       longer balance does not move the bet;
     - the **bet**: W-31's stepper, beside the next bet only;
     - the **status slot**: the **fairness chip** (W-59), then the **status
       line**: the state's heading (a heading element, focusable by script only,
       `tabindex="-1"`, announced politely), the multiplier of an `active` round
       (which, with the heading, never truncates; only the detail may), and at
       most one line of detail;
     - the **alert line**: the `role="alert"` region for an error that does not
       stop the round (a typed error, the generic error, a connection problem),
       except when a cover state owns the region ("One `role="alert"` region at
       a time", below). **The alert overlays the status**: the alert line has no
       slot of its own; it sits in the status line's slot, on the same row after
       the status heading, in the place of the status detail. A state that shows
       a status detail with an error (the waiting detail below, the slow notice,
       the state's own detail) keeps it, between the heading and the alert. The
       status line and the alert line together are the **status slot**; in the
       bar the status heading is set smaller than the cover's (1rem, monospace,
       upper case), so the heading and a line of text share the row. **The alert
       line is one line**: its icon, its heading, and the first line of its
       detail sit on one row inside the alert's box ("Something went wrong: The
       game is unavailable right now."); the rest (further lines, the request
       id, its control) scrolls inside that box, which stays wholly within the
       row, so its border is never cut off. While the alert shows, the status
       line takes at most half the slot and the alert the rest; where the row is
       too narrow for the whole first line, it wraps inside the box and its end
       scrolls with the rest;
     - the **round line**, in the status slot after the status line: the payout
       on a result, a book round's return to player (W-56), the `expired` line
       (W-33), and the round id with its copy control and the verify link (W-39)
       when shown. The round id is **shown shortened**: "…" and its last eight
       characters (`…7a8b9c0d`; a UUIDv7's first characters are its timestamp,
       the same for rounds close in time); its title, and the text an assistive
       technology reads (visually hidden), are the full id, the copy control
       copies the full id, and the verify link is unchanged (W-39);
     - the **start control** (RFC-005 section 5): one primary button of one
       width in every state and label (11rem on a wide screen), its label
       centred, no icon at rest, and a spinner at its right edge, out of the
       flow, with `aria-busy`, while the start is in flight or a run of autoplay
       goes (it is then `aria-disabled`, kept in place, not removed). The
       cash-out control and "check again" take its place and width. While the
       player owes the first pick of a steps round (the round `active` and
       ready, held by the shell, no cash-out offered, nothing pending, W-24),
       its place holds the text "↑ Make your pick": not a control, hidden from
       assistive technology (`aria-hidden`), naming no game's own objects; the
       status line's detail says "Make your pick in the game." for it. Its right
       end is the **autoplay segment** (W-61) when autoplay is offered; the
       control's slot then keeps the segment's width for the session.

     A slot with nothing to show stays empty, its space kept, so nothing moves.
     The bar never shows a disabled placeholder for a control the state does not
     offer, so no control reads as usable while it is not. A bound of a control
     the state offers is not such a placeholder: the stepper's minus at the
     lowest option and its plus at the highest it may reach are disabled (W-31).

     **The look** (RFC-005 section 1; Q7 and Q9 on their recommendations): one
     dark theme (the light theme of `prefers-color-scheme` is gone): page
     `#101318`, bar `#1C2128`, controls `#252C35`, text `#F5F7FA`, labels
     `#98A3B3`, one accent `#57D9B3` (the start control and passed states), and
     `#F0B35B` for a problem; no gradient, glow, or neon. The type is a named
     stack of installed faces, no font file: Bahnschrift, then DIN Alternate,
     then the system UI face, with amounts in the same face and tabular figures;
     the balance at 1.3125rem, the bet at 1.0625rem, the status at 0.9375rem,
     the start control at 1rem, labels at 0.75rem. Every size is in `rem`. The
     bar's popovers (the menu, the chip, the autoplay counts) are not dialogs
     and trap no focus; Escape closes one and returns the focus to its button; a
     click outside closes it; opening one leaves the focus on its button (W-46).
     A floating bar's surface is at least 0.86 opaque (0.9 today), so its text
     keeps 4.5:1 over a white game and a black one, and a game drawing under it
     cannot make its own text read as the bar's (RFC-005 section 9).

  **The overlay** is a panel over the stage, at the stage's size, so it spans
  the whole frame, under a floating bar too (RFC-005), for a state in which the
  round cannot be played or the game cannot be shown; its content sits above a
  floating bar. It holds a heading and its detail, and, for an error, the
  `role="alert"` content. It is not a dialog and traps no focus; the bar stays
  operable. Two forms:
  - the **scrim**: translucent, so the game stays visible behind it, while a
    round is being checked;
  - the **cover**: opaque, for a state in which the game's view must not be read
    as the round's, and for the final states.

  Before a session exists (loading, the configuration error, a browser without
  Web Locks) there is no frame, and the stage shows the cover at the same size.

  **Labels** (W-48's language rule applies to each): the start control reads
  "Place bet" at `idle` and "Play again" on a result, for every game, with the
  stepper preset to `defaultBet` (RFC-004 Q4). The cash-out control reads "Cash
  out" with the Snapshot's `cashOutValue.formatted` beside it when the Snapshot
  carries one: the server's quote of what cashing out now credits, which
  `se.snapshot/1` serves on an `active` steps round after its first step (a
  value of 0 is shown as served). Without a value the control reads "Cash out"
  with the Snapshot's `currentMultiplier` beside it as a display value (`×1.94`)
  and no amount: W-34 forbids computing one from a multiplier (Q3), and the
  Wrapper never checks the value against the multiplier
  ([W-31](./rendering-from-the-snapshot.md) says when an `active` round carries
  none).

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
| `idle`                                                                                                          | frame shown, inert (view only); the game shows its own idle view                                                                                                                      | status "Place your bet"; the balance; the stepper (W-31) and **new** "Place bet"; on a book round the RTP line (W-56); lobby and deposit (W-49f)                                                                                               | stepper, start, lobby, deposit                                                                        | not moved                                                                                                             | the status line                                      |
| `idle` with a typed error or the generic error (a void, `INSUFFICIENT_FUNDS`, ...)                              | as `idle`                                                                                                                                                                             | as `idle`, and the alert line: the code's message, the `requestId`, and its control ("Back to start" for the four voided-start codes, "Try again" when retryable, the deposit for funds, W-42)                                                 | as `idle`, and the alert's control                                                                    | the alert's heading, after the player's start                                                                         | alert                                                |
| A start or cash-out call in flight                                                                              | unchanged; inert for a cash-out (W-58)                                                                                                                                                | unchanged; the pressed control is busy (`aria-disabled`) until the answer; no lobby or deposit (W-49f)                                                                                                                                         | none                                                                                                  | stays on the pressed control; when the control goes, the status heading (W-46)                                        | nothing new                                          |
| `starting` (config or book)                                                                                     | frame shown, inert; the game shows its own `starting` view                                                                                                                            | status "Preparing the round", detail "The round is being prepared and checked."                                                                                                                                                                | none                                                                                                  | not moved                                                                                                             | the status line                                      |
| `active`, verdict not yet `ready` (W-26 checking)                                                               | frame shown, inert, the game held at its last copy (W-38's hold); scrim with "The round is being checked before you play."                                                            | status "Preparing the round"                                                                                                                                                                                                                   | none                                                                                                  | not moved                                                                                                             | the status line                                      |
| `active`, verdict `ready`                                                                                       | frame shown, interactive (the only such row); no overlay                                                                                                                              | status "Your round is in play"; the multiplier; "Cash out" with `cashOutValue.formatted` when the Snapshot carries one, else with the multiplier, when the shell offers it (W-24); no lobby or deposit                                         | game picks; cash-out when offered                                                                     | the iframe element, once, when the round the player started becomes ready (W-46); a pick keeps the focus in the frame | the status line                                      |
| `active`, a round the shell does not hold (a `ROUND_ACTIVE` resume, W-42; a round left open by an earlier page) | frame shown, inert, the game held at its last copy (W-38's hold); cover: **new** "This round can't be played here" and **new** "Nothing is signed for it. It ends by its time limit." | empty; no lobby or deposit (W-49f)                                                                                                                                                                                                             | none                                                                                                  | the cover's heading, after the player's start that led to it; otherwise not moved                                     | the cover's heading                                  |
| `active`, a move or cash-out not confirmed (W-16)                                                               | frame shown, inert; the game waiting                                                                                                                                                  | status "Your move hasn't been confirmed" (or the cash-out's), detail "If it never arrives, the round ends by its time limit."; the round id; "Check again"                                                                                     | "Check again"                                                                                         | the status heading, after the player's own action only                                                                | the status line                                      |
| `resolving`                                                                                                     | frame shown, inert; the game shows its own `resolving` view                                                                                                                           | status "Resolving", detail "The result is being settled."                                                                                                                                                                                      | none                                                                                                  | not moved                                                                                                             | the status line                                      |
| Slow (W-35's "taking longer than expected")                                                                     | unchanged                                                                                                                                                                             | the status line's detail becomes "This is taking longer than expected."                                                                                                                                                                        | unchanged                                                                                             | not moved                                                                                                             | the notice                                           |
| `won`                                                                                                           | frame shown, inert (view only); the game shows the reveal (a book round plays the draw back, W-55)                                                                                    | status "You won" with its icon; "Payout" and the `formatted` amount, the balance; the round id, its copy control, the verify link; the next bet: the stepper and **new** "Play again"; lobby, deposit                                          | stepper, "Play again", copy, verify link, lobby, deposit                                              | the status heading, after the player's own action (W-46, and its book exception)                                      | the status line                                      |
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

- The bar's furniture is the same in every row with a session: the menu (whose
  lobby and deposit are the table's "lobby, deposit", W-49f) and the fairness
  chip (W-59, by its own table); the state edge follows W-60. During a run of
  autoplay (W-61) the start control is busy beside each row's result and the
  status detail reads "Autoplay · n left".
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
  `scrollbar-gutter: stable`. Every slot of the bar keeps its size whatever it
  holds, so no state makes the bar grow and the stage never moves; the bar's
  height `B` depends only on the width, the player's text size or zoom, and
  W-26a's badge (set for the session).
- **The bar by width** (CSS `rem`, so it follows the text size; RFC-005 section
  1):
  - from 66rem (1056 CSS pixels at the default text size): **one line** of
    controls, the menu, the balance, the bet, the status slot (which takes the
    rest of the width), and the start control, 5.5rem tall (88 CSS pixels), a
    radius of 0.75rem;
  - from 35rem to 66rem: **two rows**: the status slot on a row of its own
    (5.5rem, room for a result's two rows), then the menu, the balance, the bet,
    and the start control (as wide as on one line);
  - under 35rem: **three rows**: the status slot (two rows of 3.375rem), the
    balance and the bet, then the menu and a full-width start control; MIN and
    MAX are hidden. No control shrinks below 2.75rem by 2.75rem.

  W-26a's badge takes a row of its own above (2.25rem) while it shows; it is set
  for the session, so it never changes `B` between states.

- **The bar floats or docks** (RFC-005 section 1; decided: the bar never covers
  anything the game needs to show, and the game extends behind it). From 66rem
  the stylesheet lets the bar float: it sits over the bottom of the stage, inset
  by 0.875rem from its sides and bottom, on a translucent surface with a
  backdrop blur (the solid bar where the browser has no backdrop filter), at
  least 0.86 opaque. Then:
  - a game whose accepted `hello` declared the `inset` capability (W-38) gets a
    frame the size of the whole stage, bar included, and draws only scenery
    under the bar: the Wrapper sends it the band the bar covers, `insetBottom`,
    the bar's height and its bottom gap, an integer of CSS pixels rounded up
    (W-38's `layout`);
  - any other game keeps a frame above an **apron**: a band of one neutral dark
    tone (Q6), as tall as the bar and its gaps above and below (about 116 CSS
    pixels), which the bar floats on, so it covers no part of the frame; its
    `insetBottom` is 0 and it is sent nothing.

  The bar **docks** under the stage, and the inset is 0, under 66rem, and
  whenever floating would leave less than the stage's minimum `S` of the game in
  view, and never less than **200 CSS pixels** (`MIN_VISIBLE_GAME`, a new number
  of RFC-005), so a game's interface is never covered. The decision is an
  attribute of the page's main element (`data-bar`, `float` or `dock`;
  `stage-layout.ts`), never a measured value written into a style. The frame
  resizes once after the `hello` (a capable game's frame grows to the whole
  stage) and at a layout change, never on a status change. A game that declared
  `inset` but draws its interface under the bar is that game's bug, which the
  Wrapper cannot detect.

- **The minimum the Wrapper supports** (RFC-004 Q14, provisional): 320 CSS
  pixels wide (the reflow width of WCAG 2.2, 1.4.10; narrower is not supported),
  and `H_min = ceil(B') + S` tall, where `S`, the stage's minimum, is
  PROVISIONAL at 270 CSS pixels until this spec gives another number, and `B'`
  is the band the bar takes under the game's view: the docked bar's height under
  66rem; from 66rem, the floating bar and its bottom gap over an `inset` game,
  and the bar and both gaps over an apron. So `H_min` depends on the game's
  capability, and the first `resize` may change once after the `hello` (W-49d).
- **Below the minimum height** the bar docks, the stage keeps `S`, and the
  Wrapper's own document scrolls vertically inside the iframe. The docked bar is
  sticky at the bottom of the viewport, so the status line and the money
  controls stay in view while the stage scrolls under it; when the bar is taller
  than half the viewport (at a high zoom, for example) it is not sticky, and the
  page scrolls as a whole with nothing hidden (W-47). `scrollbar-gutter: stable`
  keeps the scroll bar from changing the content's width, and so `B`. Nothing
  scrolls horizontally from 320 pixels up.
- **A result is two rows.** With no error beside it, a result fills the status
  slot as two rows of 2.75rem: the chip, the status heading, and the payout (or
  the return to player, or the `expired` line); then the shortened round id, its
  copy control, and the verify link, as quiet text controls that keep their
  2.75rem height. From 35rem up the two rows share columns; under 35rem each row
  lays out on its own, and the payout's and the round id's labels are read, not
  shown (they stay the accessible text). At the default text size it fits from
  320 CSS pixels up without scrolling; content that cannot fit (a long served
  amount, a larger text size) scrolls as below, and nothing is clipped.
- **Overflow stays in the bar.** Text that does not fit its slot (a long error,
  a status detail and an error shown together, a result with an error beside it,
  a result that cannot fit) wraps and scrolls within that slot: the status slot,
  and the alert line's one-row box in it, each become a scrollable region,
  reachable by keyboard (`tabindex="0"` while it overflows), inside the bar's
  height. A slot never grows and never spills onto the stage; a floating bar
  overlaps only the inset a game asked for, or the apron.
- **Standalone** (not framed, W-49a), the viewport is the browser window and the
  same rules hold.
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

## The fairness chip

- **W-59.** At the start of the status slot a chip shows what the shell has
  checked for the round the bar shows, in plain words, and opens a popover that
  lists it (RFC-005 section 3; the words are Q1's recommendation, pending the
  human's decision). It reads the shell's verdicts only and claims nothing the
  shell did not check: never "Verified" or "Provably fair". It keys on the
  round's kind (the session's presentation, W-53), not on the verdict alone: a
  book round's verdict is `ready` too and never reads as a config round's.

  | Round, state                                                                                                                                                                                       | Chip                  | Popover                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | no round yet (`idle`), a round the shell does not hold, a config round that ended before its verdict                                                                                               | "How it's checked"    | what the shell checks for this game's kind of round, and that the key is made in this tab and never leaves it (a book game: that the randomness record is checked to stay the same, and that checking the draw is the verify page's job, not yet available)                                                                                                                                                                                                              |
  | config round, verdict `checking`                                                                                                                                                                   | "Checking"            | checks 1 to 4 of W-26 in full (the round's authorization names this round, is bound to the player's key made in this tab, is for the bet and its currency, commits to the round's secret, takes its randomness from the pinned entropy chain, has the round's randomness target, and is signed by the pinned signer for the pinned domain), check 5 (the ready evidence), and the tip check (W-26b), each "being checked": the shell's verdict has no progress per check |
  | config round whose verdict is `ready`, through `active` and `resolving`, and after it ends `won`, `lost`, or `canceled` (the player's own cancel, an expired round) with that last verdict `ready` | "Checked before play" | the same list, each "passed", and what it does not cover: the ready evidence is taken from the Snapshot as given until anchoring; the domain, the signer, and the authorization are not yet checked on-chain (W-26's TODO); the terms taken as signed (`playerRef`, `gameId`, `gameVersion`, `circuitVersion`, `payoutTermsHash`); the unchecked `expiry` and `prepareWindow`; and the outcome, which the shell never checks (the verify page's job)                     |
  | as above, under W-26a's degraded chain check (development: `minRpcQuorum` 1)                                                                                                                       | "Checked (dev)"       | the list, with the tip check read "from one endpoint only (development)"; never "Checked before play"                                                                                                                                                                                                                                                                                                                                                                    |
  | any round whose verdict is `failed` (a W-26 check, a re-issue after `ready`, the tip check, W-26a's "could not verify the chain"), or a changed book round (W-52)                                  | "Not verified"        | "This round failed verification" (or "Could not verify the chain"), and what refused it: a player label (W-48) for each machine code, the shell's `RoundState.failure` (`missing`, `pinned-mismatch`, `cross-field`, `recover-mismatch`, `ready-mismatch`, `reissued`, `tip-check`, `changed`) and, for the tip check, `tipFailure` (W-26b's seven causes and `bind`); the cover and status of the failed-verification state stay as they are                            |
  | book round (W-50 to W-56), not changed                                                                                                                                                             | "Recorded"            | that the round's randomness record stayed the same from start to result (W-52), and that checking the draw is the verify page's job (not yet, #156)                                                                                                                                                                                                                                                                                                                      |
  - **A failure wins and stays.** A round whose verdict failed, or a changed
    book round, reads "Not verified" from then on: after it ends too, through
    the required cancel and W-33's cancel states (`in-flight`, `settling`,
    `check-later`, `sent`, `ended`, `not-taken`), and on the `idle` read that
    follows the cancel's `ended`. "Checked before play" on an ended config round
    needs the round's last verdict to be `ready`; the required cancel after a
    failed check stays "Not verified", since its last verdict is `failed`. The
    Wrapper keeps the round's last verdict with the ended round
    (`EndedRound.verdict`) for this.
  - **The round id, its copy control, and the verify link** show in the popover
    only once the round has ended (W-39); during a round the popover lists the
    checks only. The popover's content is built while it is open only, so the
    page never holds the round id twice for no reason.
  - **W-26a's badge stays** in the bar for the whole session, apart from the
    chip.
  - The chip is a button with a 44 px hit area and an accessible name of its
    words and "show what was checked"; its popover is not a dialog (W-57). The
    chip's text change is not announced (the status line already is, W-46). Its
    colour never carries its meaning alone (W-47): its words do.
  - There is no chip while loading, in a final state, or before a Snapshot.

## The state edge

- **W-60.** The bar's top edge is a 2 px line that mirrors the status line
  (RFC-005 section 4): a short accent segment sweeps across it while a round is
  starting, being checked, or resolving, or a start is in flight; the whole line
  flashes the accent once when the round is won; it is the problem colour while
  a connection problem, a typed error, the generic error, or a state on the
  cover shows. It is decoration (`aria-hidden`): the status line carries the
  meaning in text (W-47). With reduced motion it does not move (the sweep is a
  still line).

## Autoplay

- **W-61.** Autoplay of book rounds (RFC-005 section 6, proposed in full and
  decided; its switch per deployment is Q2's recommendation, and where its run
  lives Q10's, both pending the human's decision).
  - **Which rounds.** Book rounds only (W-50, W-51): an autoplay round is W-22's
    start with a fresh `idempotencyKey`, the same bet, the signer lock (W-14),
    and W-22's single resend, unchanged, and nothing more. It is never offered
    for a config round.
  - **Off unless configured.** The environment configuration's optional field
    `autoplay` (`counts`, `minIntervalMs`;
    [Configuration](../wrapper.md#configuration)) turns it on for the
    deployment. Without it there is no autoplay segment (fail closed).
    `minIntervalMs` has no floor above 0 (decided by the human, 2026-11-13): the
    deployment's configuration decides.
  - **The run lives in the shell** (`PlaySession.autoplay`; Q10's
    recommendation), so no money logic sits outside it: the Wrapper begins it
    with a count from `counts`, the chosen bet, and `minIntervalMs`, shows its
    state (`onAutoplay`), and reports the stops only the page sees (the player's
    stop, the page hidden). The shell refuses to begin, sending nothing, when
    the session's rounds are not book rounds, a round is open, a run goes, the
    count or the interval is out of range, or the latest Snapshot does not offer
    or cover the bet. While a run goes the session refuses the player's own
    start (`busy`).
  - **The run.** The bet is fixed for the run (the stepper is disabled); each
    start copies its `AmountRequest` from the latest Snapshot's own `Amount` of
    that option (W-22, W-31). The run waits on the round its start's own answer
    names, never on a read that lands while the start is in flight (the previous
    round's result, say), and arms one timer per result: the next start is sent
    only after that round's result (`won` or `lost`) was read and
    `minIntervalMs` passed on the session's clock. A start whose use case failed
    with no answer stops the run and is shown as the generic error (the shell's
    `refused` with `use-case-failed`).
  - **It stops**, before the next start, on any of: the player's stop (the round
    in flight finishes); the count reached; the balance below the bet (a
    `bigint` comparison, W-34); the bet no longer offered by the latest Snapshot
    (not one of its `suggestedBets` or `defaultBet`, or outside `minBet` and
    `maxBet`); any typed or generic error (W-42), a void or a refusal of a start
    included; a connection problem (W-43); a Snapshot rejected (W-28); a round
    that ends other than `won` or `lost`, or goes back to `idle`; a changed
    round (W-52), its own stop rule, usually seen on the `won` or `lost` read
    itself; "game not compatible" (W-38); a `playback` copy that fails closed
    (W-55), since the player could no longer see the rounds being played; a
    changed session (W-53); the session's end or a token that cannot be
    refreshed (W-7); the signer lock lost (W-14); the page hidden (Q3's
    recommendation: a run never continues unattended).
  - **On screen.** The segment at the start control's right end opens a popover
    of the configured counts; during a run it shows the count left and a stop
    square, and stops the run; the start control is busy; the status line's
    detail reads "Autoplay · n left". The start and the stop of a run are
    announced politely, and a single round of it is not (W-46). The run's
    answers move no focus: the session marks each as the run's (`onChange`'s
    source `autoplay`), also the one that stops the run, so W-55's focus
    exception after a book result and W-46's player rules do not fire on them.
  - **Operator links.** The whole run counts as a call in flight for W-49f: no
    lobby and no deposit until it stops.
  - **The round line.** Under autoplay the player's start of the run is the act
    for every round of it, so each round's id and link replace the last one's
    without a new act (W-40).
  - **Nothing is stored.** The run and its count live in memory and are gone on
    reload; a reload never resumes a run. Nothing is logged or sent but the
    starts.

## The focus

W-46 states the focus rules for the single screen (the inert-frame rule, a
pick's error staying in the frame, the removed-control rule, the focus into the
game when the round the player started becomes ready, and the tab order). They
are in [Accessibility](../wrapper.md#accessibility).

## Tests

Rows T-25 to T-28 and, for RFC-005's bar, T-29 to T-35 of the
[test plan](../wrapper.md#test-plan), and the single-screen parts of T-6, T-9a,
T-10 to T-12, T-14, T-14a, T-15, T-16, T-18, T-23, and T-24. The tests that
assert the hidden frame today change with it: `e2e/tests/game-mount.spec.ts`,
`e2e/tests/focus-from-frame.spec.ts`, `apps/wrapper/src/book-round.test.ts`, and
the visibility checks of the round specs; the readiness signal of
`e2e/tests/harness/round-play.ts` and
`e2e/tests/preview-support/preview-rounds.ts` (a visible iframe) becomes the
frame without `inert` and the status "Your round is in play". The preview run is
the backend's job at a pinned commit, so its next pin bump takes the layout and
the helpers together.
