# RFC-005 — The control bar, version 2

- Status: draft
- Author: the documenter agent, for human review
- Created: 2026-11-13
- Relates to: W-57 and W-58 of
  [the single screen](../../specs/wrapper/the-single-screen.md); W-31, W-33, and
  W-34 of [rendering](../../specs/wrapper/rendering-from-the-snapshot.md); W-22,
  W-26, W-26a, and W-26b of
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md); W-39
  and W-40 of
  [the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md);
  W-50 to W-56 of [book playback](../../specs/wrapper/book-playback.md); W-49e
  and W-49f of [operator embedding](../../specs/wrapper/operator-embedding.md);
  W-14, W-46, W-47, and W-48 and the
  [configuration](../../specs/wrapper.md#configuration) of
  [the Wrapper spec](../../specs/wrapper.md);
  [ADR-001](../../decisions/ADR-001-toolchain-and-signing.md) (no new
  dependency)

This RFC proposes a new look and five new parts for the Wrapper's control bar.
It changes no money control, no signature, and no check of the shell. A visual
mockup was reviewed with the human on 2026-11-13; it is not in the repository,
and where it and this RFC differ, this RFC holds. The decisions already taken
are in [Decisions](#decisions-2026-11-13); the points still open are in
[Unresolved questions](#unresolved-questions).

## Problem

The bar W-57 defines works, but it reads as a generic form: a light panel, a row
of bet chips, and a plain start button. Players of embedded games expect a
compact, dark bar under the game, with the balance, a bet stepper, and one clear
primary action, and they read anything else as unfinished.

The bar also hides what makes this product different. Every config round is
checked in the player's browser before it can be played (W-26), and the player's
key never leaves the tab (W-9 to W-13). Today the player sees none of that until
a check fails.

## Motivation

- A bar that looks like the games it hosts makes the Wrapper feel like part of
  the game, not a frame around it.
- Showing the shell's checks as they happen turns the kit's security work into
  something a player can see and trust, without any new claim: the bar shows
  only verdicts the shell already reaches.
- Responsible gaming: the session's time and rounds one click away, and an
  autoplay with hard stop rules, are easier to defend than their absence or a
  looser version built later under pressure.

## Proposed solution

Each part is marked with the spec it would change. New rules would be numbered
from W-59 and new tests from T-29.

### 1. Layout and visual system (W-57)

- **One bar**, 88 px tall on a wide screen, radius 12 px, with one line of
  controls in this order: the **menu**, the **balance**, the **bet**, the
  **status slot**, and the **start control**. Every control is 44 px tall (the
  start control too), radius 8 px, so the row has one centre line; the bet's
  label sits inside its field, not above it.
- **Narrow screens**: under about 980 px the status slot moves to its own row
  above the controls; under about 560 px the bar has three rows: the status
  slot, then the balance and the bet, then the menu and a full-width start
  control. No control shrinks below 44 × 44 px.
- **No layout shift**: the start control and its autoplay segment keep one width
  in every state and label ("Place bet", "Play again", "Cash out ×1.46", busy,
  autoplay running), and its label is centred; the busy spinner sits at its
  right edge, out of the flow. The balance keeps a minimum width, so a longer
  balance does not move the bet.
- **The status line has room**: the start control is narrow (about 176 px on a
  wide screen), the heading and the multiplier never truncate (only the
  secondary text may), and below about 1040 px the bar takes two rows rather
  than squeeze the status slot.
- **Theme**: dark (Q7). Tokens: page `#101318`, bar `#1C2128`, controls
  `#252C35`, text `#F5F7FA`, labels `#98A3B3`, one accent `#57D9B3` (the start
  control and selected or passed states), and `#F0B35B` for a problem. No
  gradient, glow, or neon on the bar.
- **Fonts** (decided: system fonts only, no font file ships; Q9 for the face): a
  named stack of fonts the operating systems install, not the bare `system-ui`
  default. Proposed: Bahnschrift (every Windows 10 and 11, a DIN face with a
  width axis; uppercase labels at 87.5 % width), then DIN Alternate (macOS),
  then the system UI font. Amounts use the same face with tabular figures. Text
  is sized for reading at a glance: the balance 21 px, the bet 17 px, the status
  15 px, the start control 16 px, labels 12 px.
- **The apron and the glass** (decided; Q6 for its tone): the bar never covers
  the game. On a wide screen the stage is followed by an **apron**, a band as
  tall as the bar plus its 14 px inset, that continues the game's backdrop: it
  starts in the tone of the game's bottom edge and darkens. The bar floats on
  the apron with a translucent surface and a backdrop blur, and falls back to
  the solid bar where the browser has no backdrop filter. The game frame is
  never overlapped or resized (W-57 holds unchanged), so the game needs no safe
  area. The Wrapper cannot read a cross-origin game's pixels, so the apron's
  tone is a value, not a sample (Q6). On narrower layouts the bar docks under
  the stage with no apron. The surface's opacity is bounded by contrast (section
  9).

### 2. The bet stepper (W-31's bet selector)

The chips become a stepper: a minus control, the bet field, a plus control, and
MIN and MAX text controls beside it (hidden on the narrowest layout).

- It steps through the same list W-31 offers today: the Snapshot's
  `suggestedBets` within `minBet` and `maxBet`, preset to `defaultBet`. It never
  invents a value between two options, and every comparison stays a `bigint`
  comparison of `Amount.value` (W-34).
- An option above the balance is shown on the rail but cannot be chosen, as
  today: plus and MAX stop at the highest affordable option (Q8).
- Minus is disabled at the lowest option and plus at the highest one it may
  reach. This is a bound of a control the state offers, not W-57's "disabled
  placeholder for a control the state does not offer"; W-57 would say so.
- A **rail** of small marks under the value shows where the bet sits in the
  list. The field is a `spinbutton`: the arrow keys, Page Up and Page Down,
  Home, End, and the mouse wheel step it; its text value is the option's
  `formatted`.
- While a start is in flight (and through an autoplay run) the stepper is
  disabled, as the chips are.

### 3. The fairness chip (new, W-59)

A small chip at the start of the status slot shows what the shell has checked
for the current round, in plain words, and opens a popover that lists it. It
reads the shell's verdicts and claims nothing the shell did not check.

| Round, state                                       | Chip                    | Popover                                                                                                                                             |
| -------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| no round yet, `idle`                               | "How it's checked" (Q1) | what the shell checks for this game's kind of round, and that the key is made in this tab and never leaves it                                       |
| config round, `starting` until the verdict         | "Checking"              | the W-26 checks as they pass: the server's signature against the pinned signer (checks 1 to 4), the ready evidence (check 5), the chain tip (W-26b) |
| config round, verdict `ready`                      | "Verified"              | the same list, all passed; the round id with its copy control and the verify link (as in the bar, section 7)                                        |
| config round, W-26a's degraded check (development) | "Checked (dev)"         | the list, with the chain tip marked "one endpoint only (development)"; never "Verified"                                                             |
| any round that failed verification                 | "Not verified"          | which check refused it, in W-26's reason words; the cover and status of the failed-verification state stay as they are                              |
| book round (W-50 to W-56)                          | "Recorded" (Q1)         | that the round's randomness record stayed the same from start to result (W-52), and that checking the draw is the verify page's job (not yet, #156) |

- **A book round is never "Verified".** The shell checks only that a book
  round's record did not change (W-52); it does not check the draw from
  `roundSecret`, and the verify page does not show book rounds yet (W-50). A
  slot is a book round, so on a slot the chip must not claim more.
- The chip is a button with a 44 px hit area; its popover is not a dialog and
  traps no focus; Escape closes it and returns focus to the chip. The chip's
  text change is not announced (the status line already is, W-46).

### 4. The state edge (new, W-60)

The bar's top edge is a 2 px line that mirrors the status line: a short accent
segment sweeps across it while a round is starting or resolving, the whole line
flashes the accent once when the round is won, and it is the problem colour
while a connection problem or an error is shown. It is decoration
(`aria-hidden`): the status line carries the meaning in text (W-47). With
reduced motion it does not move.

### 5. The start control (W-57's labels unchanged)

- The labels stay "Place bet" at `idle` and "Play again" beside a result, for
  every game (decided); the controller protocol does not change.
- No icon at rest; a small spinner shows beside the label while the start is in
  flight, with `aria-busy` (W-57's busy rule).
- A **keyboard shortcut**: Space starts a round when the focus is on the page
  itself, never when it is on a control, in a field, or in the game frame (the
  frame's keys are the game's), and never cashes out. The control says so in its
  tooltip and `aria-keyshortcuts`, not in a visible hint (Q5).
- During a steps round the control becomes "Cash out" with the multiplier (W-24,
  W-57). While the player owes the first pick it is not offered (W-57: no
  disabled placeholder); its space is kept, so nothing moves, and holds the text
  "↑ Make your pick", pointing at the game. That text is not a control, is
  hidden from assistive technology, and the status line carries the same words
  for it. The words name no game's own objects: the Wrapper does not know them.
- Its right end is the **autoplay segment** (section 6) when autoplay is
  offered; otherwise the start control is one piece.

### 6. Autoplay (new, W-61; proposed in full, decided)

- **Which rounds.** Book rounds only. A book round takes no player input after
  the start (W-50) and has nothing signed (W-51), so an autoplay round is a
  `start` call and nothing more: W-22's start with a fresh `idempotencyKey`, the
  same bet, the signer lock (W-14), and W-22's single resend, unchanged. A
  config round needs the player's move, so autoplay is never offered for one.
- **Off unless configured.** A new optional field of the environment
  configuration, `autoplay`, turns it on:
  `{ "counts": [10, 25, 50, 100], "minIntervalMs": 2500 }`. Without the field
  there is no autoplay segment (fail closed); a malformed value refuses the
  document like any other issue (`invalid-autoplay`). Whether the switch also
  needs to be per operator is Q2.
- **The run.** The player chooses a count from `counts`. The bet is fixed for
  the run (the stepper is disabled). The next start is sent only after the
  previous round's result has been shown for at least `minIntervalMs`.
- **It stops**, before the next start, on any of: the player's stop (the round
  in flight finishes); the count reached; the balance below the bet (a `bigint`
  comparison, W-34); any typed or generic error (W-42); a connection problem
  (W-43); a round that ends other than `won` or `lost` (`canceled`, a changed
  round W-52, out of sync); a changed session (W-53); the session's end or a
  token that cannot be refreshed; the signer lock lost (W-14); the page hidden
  (Q3).
- **On screen.** The segment shows the remaining count and a stop square; the
  status line reads "Autoplay · n left"; the start and stop of a run are
  announced politely, a single round is not (W-46).
- **Operator links.** The whole run counts as a call in flight for W-49f: no
  lobby and no deposit until it stops.
- **Nothing is stored.** The count lives in memory and is gone on reload; a
  reload never resumes a run. Nothing is logged or sent.

### 7. The round line (W-39, W-40 unchanged)

The round id with its copy control and the verify link stay in the bar after a
round, as W-39 and W-40 require, after the result in the status slot; the
fairness chip's popover shows them too. (The mockup moved them into the popover
only; this RFC does not, so W-39 and W-40 need no change.)

### 8. The menu (W-49e, W-49f)

The lobby and the deposit move from the bar into a menu at its start. Each item
is offered exactly when W-49f offers it today; when the state offers neither,
the menu holds only what remains, and with nothing left the menu button is not
shown (W-57: no disabled placeholder). The menu also starts with **this
session**: the time since the session opened and the number of rounds played,
kept in memory only (Q4 for amounts). Links to the game's rules and to
responsible gaming need a source the Wrapper does not have today (Q4).

### 9. Accessibility (W-46, W-47, W-48)

- Text meets WCAG 2.2 AA contrast against the bar. For the glass surface the
  stylesheet contrast test checks the worst case: the surface composited over a
  white game and over a black one. At the mockup's 58 % opacity the muted labels
  fail over white; they pass from about 86 %, so the surface is at least that
  opaque, whatever the blur.
- Focus is visible on every control (a 2 px accent ring); the popovers close on
  Escape and return focus; the bar never moves focus unless the player acted
  (W-46).
- Every state change keeps its text and icon (W-47); the state edge and the
  chip's colour never carry meaning alone.
- Reduced motion stops the sweep, the spinner's rotation, and the bet's roll.

### 10. Not in the bar

- **Turbo**: a game's playback speed is the game's (decided). A game that wants
  one shows it in its own interface; the controller protocol does not change.
- **A per-game start label** ("Spin"): not offered (decided).

## Alternatives

- **Restyle only** (new tokens on today's chips and button): smaller, but keeps
  the chips' width problem on narrow screens and adds nothing a player trusts.
- **A light theme** or both themes: game stages are mostly dark, and a light bar
  under a dark stage reads as a separate page; both themes double the contrast
  matrix. Kept as Q7.
- **Autoplay as a game feature** (the game asks for repeated starts): it would
  put a money loop behind the controller protocol, where the Wrapper can see
  less; keeping it in the Wrapper keeps every start behind the shell's rules.
- **No fairness chip**, only the failed-verification states: honest but
  invisible; the chip shows the same verdicts earlier.

## Tradeoffs

- More moving parts in the bar (a popover, a run state) and more tests.
- The apron adds about 116 px under the stage on a wide screen, which the height
  the Wrapper reports to the operator page (W-49d) includes.
- Autoplay adds a configuration field, a state, and a regulatory surface; it is
  off unless configured.
- The chip's words become a promise: they must change whenever the shell's
  checks change.

## Impact

- **Specs**: [the single screen](../../specs/wrapper/the-single-screen.md) (bar
  layout, stepper, chip, edge, autoplay, menu; the state table gains the chip
  and autoplay columns),
  [rendering](../../specs/wrapper/rendering-from-the-snapshot.md) (W-31's bet
  selector), [operator embedding](../../specs/wrapper/operator-embedding.md)
  (W-49f: the menu and the autoplay run), and
  [the Wrapper spec](../../specs/wrapper.md) (the `autoplay` configuration field
  and its validation, accessibility, the test plan).
- **Code** (`apps/wrapper` only): the stylesheet, the bar view, the bet selector
  (to a stepper), a fairness-chip view over the shell's existing verdicts, an
  autoplay use case beside the start, the configuration validator, and their
  tests. The shell does not change unless the chip needs a verdict it does not
  expose yet (the implementer checks). No package boundary moves.
- **Dependencies**: none (ADR-001); no font file.
- **Size budget**: a few kB of CSS and script; `pnpm check:size-budget` decides.
- **Telemetry**: none; autoplay and the session summary emit and store nothing.
- **Tests** (from T-29): the stepper's bounds and keys; the chip's text per
  round kind and verdict, with "Verified" never on a book round or a degraded
  check; autoplay's every stop rule, the interval, and a configuration without
  the field; W-49f during a run; contrast of the glass surface over white and
  black; no layout shift of the start control across its states.

## Migration considerations

- The environment configuration gains one optional field; existing documents
  stay valid and get no autoplay.
- Operators see a dark bar and a menu where the lobby and deposit were; the
  operator protocol (`se.operator/1`) does not change, and W-49d's minimum
  height is recomputed from the new layout.
- One release: no flag and no light/dark switch unless Q7 says otherwise.

## Unresolved questions

- **Q1. The chip's words.** "How it's checked" at `idle` and "Recorded" on a
  book round, or other words? Should a game whose rounds are book rounds show
  the chip at all before #156 lets the verify page check its draw?
  _Recommendation_: show it, with these words; never "Verified" or "Provably
  fair" on a book round.
- **Q2. Who turns autoplay on.** The environment document is per deployment. If
  one deployment serves operators in markets with different rules, the switch
  must be per operator (a field in the operator's `hello`, or an operator-keyed
  map in the document). _Recommendation_: per deployment first; per operator
  when a deployment needs it.
- **Q3. Autoplay in a hidden tab.** Stop the run when the page is hidden, or
  only pause it? _Recommendation_: stop; a run never continues unattended.
- **Q4. Amounts the server did not format, and the menu's links.** The mockup's
  balance-change pill ("+$1.00" after a round) and the session's net are
  computed, and W-34 says the Wrapper shows `Amount.formatted` only. Either W-34
  gains a formatting rule (from `unit` and `decimals`, `bigint` only), or the
  bar shows only served amounts (the payout as today) and the session summary
  shows time and rounds without money. Separately, the rules and
  responsible-gaming links need a source (an operator field, or the
  configuration). _Recommendation_: served amounts only for now; links from the
  operator, as the lobby and deposit are.
- **Q5. The Space shortcut.** A one-key start can place a bet by accident. Keep
  it, keep it but require the focus on the bar, or drop it? _Recommendation_:
  keep it only while the focus is on the bar itself.
- **Q6. The apron's tone.** The apron (section 1) starts in the tone of the
  game's bottom edge, which the Wrapper cannot sample from a cross-origin frame
  (a reflection of the frame, tried in the mockup, does not render). Either one
  neutral dark tone for every game, or an optional colour the game declares in
  its `hello` (a backward-compatible addition to `se.controller/1`, validated as
  a hex colour, ignored when absent). _Recommendation_: the neutral tone in this
  version; the `hello` field in its own small RFC.
- **Q7. Theme.** Dark only, dark with a light variant from
  `prefers-color-scheme`, or a theme the operator chooses? _Recommendation_:
  dark only in this version.
- **Q8. Unaffordable options.** Plus and MAX stop at the highest affordable
  option (proposed), or reach every option and let the start be refused?
  _Recommendation_: stop at the highest affordable one, as the chips do today.
- **Q9. The face.** Which installed face leads the stack: Bahnschrift (DIN,
  proposed), Segoe UI Variable / SF Pro (the OS UI faces), Franklin Gothic /
  Avenir Next, or Gill Sans? The mockup has a toggle for all four. A stack
  differs by platform by nature: Bahnschrift exists only on Windows, so macOS
  gets DIN Alternate and other systems the UI font. _Recommendation_:
  Bahnschrift, then DIN Alternate.

## Decisions (2026-11-13)

Decided by the human before this draft:

- The direction of the reviewed mockup (version 2: the chip, the state edge, the
  stepper's rail, the start control with autoplay at its end, the glass bar) is
  the direction to take into the spec.
- **Autoplay** is proposed in full (section 6), not left as a question.
- **Turbo** is left to games; the bar has none.
- **The start label** stays "Place bet" / "Play again" for every game.
- **Fonts**: system fonts; no font file ships.
- **The start control** is 44 px tall, the same as every other control, keeps
  one width in every state, and has no icon at rest.
- **The bar never covers the game**: on a wide screen it floats on an apron
  below the stage that continues the game's backdrop (section 1), tried with a
  real `se.controller/1` steps game.
