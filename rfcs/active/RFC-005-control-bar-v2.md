# RFC-005 — The control bar, version 2

- Status: draft
- Author: the documenter agent, for human review
- Created: 2026-11-13
- Relates to: W-57 and W-58 of
  [the single screen](../../specs/wrapper/the-single-screen.md); W-31, W-33, and
  W-34 of [rendering](../../specs/wrapper/rendering-from-the-snapshot.md); W-22,
  W-26, W-26a, and W-26b of
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md);
  W-37, W-38 (the `se.controller/1` messages), W-39, and W-40 of
  [the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md);
  W-50 to W-56 of [book playback](../../specs/wrapper/book-playback.md); W-49d,
  W-49e, and W-49f of
  [operator embedding](../../specs/wrapper/operator-embedding.md); W-14, W-46,
  W-47, and W-48 and the [configuration](../../specs/wrapper.md#configuration)
  of [the Wrapper spec](../../specs/wrapper.md);
  [ADR-001](../../decisions/ADR-001-toolchain-and-signing.md) (no new
  dependency)

This RFC proposes a new look and five new parts for the Wrapper's control bar.
It changes no signature and no check of the shell. It does touch money controls:
the bet selector becomes a stepper over the same served options (section 2), and
autoplay is a new way of sending W-22's starts (section 6), each under the same
rules as a start the player presses. A visual mockup was reviewed with the human
on 2026-11-13; it is not in the repository, and where it and this RFC differ,
this RFC holds. The decisions already taken are in
[Decisions](#decisions-2026-11-13); the points still open are in
[Unresolved questions](#unresolved-questions).

## Problem

The bar W-57 defines works, but it reads as a generic form: a plain panel (light
or dark, following `prefers-color-scheme`), a row of bet chips, and a plain
start button. Players of embedded games expect a compact, dark bar under the
game, with the balance, a bet stepper, and one clear primary action, and they
read anything else as unfinished.

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

- **One bar**, 88 px tall on a wide screen (its tab order follows the visual
  order, menu first: a change to W-46's order bullet), radius 12 px, with one
  line of controls in this order: the **menu**, the **balance**, the **bet**,
  the **status slot**, and the **start control**. Every control is 44 px tall
  (the start control too), radius 8 px, so the row has one centre line; the
  bet's label sits inside its field, not above it.
- **Units**: every size and breakpoint here is its value at the default text
  size, written in `rem` (W-57's heights follow the text size), so the bar
  reflows at 200 % zoom without loss of function (W-47).
- **Narrow screens**: under about 1040 px of bar width the status slot moves to
  its own row above the controls; under about 560 px the bar has three rows: the
  status slot, then the balance and the bet, then the menu and a full-width
  start control. No control shrinks below 44 × 44 px.
- **No layout shift**: the start control and its autoplay segment keep one width
  in every state and label ("Place bet", "Play again", "Cash out ×1.46", busy,
  autoplay running), and its label is centred; the busy spinner sits at its
  right edge, out of the flow. The balance keeps a minimum width, so a longer
  balance does not move the bet.
- **The status line has room**: the start control is narrow (about 176 px on a
  wide screen), the heading and the multiplier never truncate (only the
  secondary text may), and the two-row layout above starts early enough that the
  status slot is never squeezed.
- **Theme**: dark (Q7). Today the Wrapper has a light and a dark theme, chosen
  by `prefers-color-scheme` (`apps/wrapper/src/styles.css`); a dark-only bar
  removes the light one. Tokens: page `#101318`, bar `#1C2128`, controls
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
- **The game extends behind the bar** (decided; Q6 for the protocol): the bar
  never covers anything the game needs to show. On a wide screen the bar floats
  over the bottom of the stage with a translucent surface and a backdrop blur
  (the solid bar where the browser has no backdrop filter), and the game draws
  its scene on underneath it. The Wrapper cannot paint for the game (a
  cross-origin game's pixels are not readable; a reflection of the frame, tried
  in the mockup, does not render), so the game does the extending, through a
  proposed **addition to the controller protocol** (Q6: `se.controller/1` or
  `/2`):
  - the game declares `capabilities: ["inset"]` in its `hello`: a new optional
    field, a non-empty array of distinct strings from a closed list (today
    `"inset"` only); an unknown string fails the `hello` as any extra field does
    (W-38), so the list grows only with the spec;
  - the Wrapper then sizes the frame to the full stage, bar included, and sends
    `{ schema: "se.controller/1", type: "layout", insetBottom: <px> }` **right
    after it accepts a `hello` that declares the capability**, whether or not a
    `snapshot` goes with it (W-38 sends none while the bridge has no Snapshot
    yet or holds an `active` one); when a `snapshot` is due at the same moment
    it goes first. That first `layout` is the acknowledgement of the capability.
    The Wrapper sends `layout` again whenever the value changes. The value is
    the height of the band the bar covers from the frame's bottom, an integer of
    CSS pixels, rounded up: 0 when the bar docks below, and at most the frame's
    height less a minimum visible game height this RFC proposes (**200 px**, a
    new number); when the bar would cover more than that, it docks below instead
    and the inset is 0, so a game's interface is never covered. It is derived by
    the Wrapper, sent only to D after a valid `hello`, and says nothing of the
    session; it does reveal the bar's height, which follows the width and the
    player's text size, a minor fingerprinting signal like the frame's own size;
  - the game keeps its framing and every piece of its own interface above the
    inset and draws only scenery below it. The mockup's patched copy of a real
    steps game does this with three.js `setViewOffset` (the shot is framed on
    the visible part, the scene continues below) and its hint lifted by the
    inset: about ten lines.
  - **Compatibility runs one way.** An old game on a new Wrapper works (no
    capability, so no `layout`, and the apron below). A new game on an older
    Wrapper does not: that Wrapper's closed `hello` schema ignores a `hello`
    with `capabilities` (W-38), so it answers nothing and the game waits.
    Wrapper releases that accept the field therefore ship before any game sends
    it. A game falls back only when **no `layout`** arrives within its own
    timeout (never on a missing `snapshot`, which a new Wrapper may rightly
    withhold): it then sends a plain `hello` (an ignored `hello` is not the
    first one, W-38) and draws as a game without the capability.
  - A game without the capability gets an **apron** instead: the frame keeps its
    size and the bar floats on a band below it (as tall as the bar plus its 14
    px inset above and below, about 116 px) in a neutral dark tone (Q6), so it
    is never covered either. On narrower layouts the bar docks under the stage,
    and the inset is 0.
  - **The game draws behind money controls**, and the game is untrusted (W-37):
    under a translucent bar it could paint a fake balance or a fake "Verified".
    So the surface's opacity has a floor, for contrast and against spoofing
    (section 9), and the Wrapper's own text always sits on that surface.
  - **What else follows (W-57, W-49d).** The overlay's scrim and cover span the
    whole frame, under the bar too, or a held game view would show through the
    glass in a cover state. W-57's rule that the bar never spills onto the stage
    becomes: it overlaps only the inset a game asked for. The frame resizes once
    after the `hello` and at a layout change, never on a status change. `H_min`
    (W-49d) depends on the game's capability (apron or inset), so the first
    `resize` may change once after the `hello`; T-9a's "same value in every
    state" then holds from that point. The value is derived, so no game message
    reaches the operator page.

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
  Home, End, and the mouse wheel step it. Its `aria-valuenow` is the option's
  index in the list, never the amount as a number (W-34), and its
  `aria-valuetext` is the option's `formatted`.
- A change of option **rolls** the value: the old `formatted` string slides out
  and the new one in. It never shows an interpolated amount between the two
  (W-34, W-48), and with reduced motion it does not move.
- While a start is in flight (and through an autoplay run) the stepper is
  disabled, as the chips are.

### 3. The fairness chip (new, W-59)

A small chip at the start of the status slot shows what the shell has checked
for the current round, in plain words, and opens a popover that lists it. It
reads the shell's verdicts and claims nothing the shell did not check.

| Round, state                                                                    | Chip                       | Popover                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no round yet, `idle`                                                            | "How it's checked" (Q1)    | what the shell checks for this game's kind of round, and that the key is made in this tab and never leaves it                                                                                                                                                                                                                                                                                                                                              |
| config round, `starting` until the verdict                                      | "Checking"                 | the W-26 checks the shell is running, without progress per check (the shell's `RoundVerdict` is `checking`, `ready`, or `failed`): the round bound to its id, this player's key, bet, and currency, the round's secret commitment, the pinned entropy chain, and the randomness target, under the pinned domain and signed by the pinned signer (checks 1 to 4); the ready evidence (check 5); the chain tip (W-26b)                                       |
| config round, verdict `ready`, through `active` and `resolving`                 | "Checked before play" (Q1) | the same list, all passed, and what it does not cover: the ready evidence is taken from the Snapshot as given until anchoring, the domain, signer, and `CreateRoundAuth` are not yet checked on-chain (W-26's TODO), the round's other terms (`playerRef`, `gameId`, `gameVersion`, `circuitVersion`, `payoutTermsHash`) are taken as signed, `expiry` and `prepareWindow` are not checked, and the shell never checks the outcome (the verify page's job) |
| config round ended (`won`, `lost`, or `canceled`) whose last verdict is `ready` | "Checked before play" (Q1) | the same, with the round id, its copy control, and the verify link, as in the bar after a round ends (W-39)                                                                                                                                                                                                                                                                                                                                                |
| config round, W-26a's degraded check (development)                              | "Checked (dev)"            | the list, with the chain tip marked "one endpoint only (development)"; never "Checked before play"                                                                                                                                                                                                                                                                                                                                                         |
| any round that failed verification                                              | "Not verified"             | which check refused it, as a player label (W-48) for each machine code: the shell's `VerificationFailure` (the five check reasons, `reissued`, `tip-check`), the tip check's `tipFailure` causes (W-26b), and W-52's changed book round; the cover and status of the failed-verification state stay as they are. W-26a's "could not verify the chain" reads "Not verified" too, with that text                                                             |
| book round (W-50 to W-56)                                                       | "Recorded" (Q1)            | that the round's randomness record stayed the same from start to result (W-52), and that checking the draw is the verify page's job (not yet, #156)                                                                                                                                                                                                                                                                                                        |

- **A failure wins, and stays.** A round whose verdict is `failed` (any W-26
  check, a re-issue after `ready`, the tip check, W-26a) or that changed (W-52)
  reads "Not verified" from then on, after it ends too, through the required
  cancel and W-33's cancel states; "Checked before play" needs the round's last
  verdict to be `ready`.
- **The round id and the verify link show only once a round has ended** (W-39);
  during a round the popover lists the checks only, since what the verify page
  shows for a round in play is not specified.
- **The chip keys on the round's kind, not on the verdict alone**: the shell's
  book-round verdict is `ready` too (`book-round.ts`), and must never read as a
  config round's.
- **W-26a's indicator stays.** The non-dismissable "chain check not independent
  (development)" badge of W-26a and W-57 stays in the bar for the whole session,
  apart from the chip, which at `idle` reads "How it's checked".
- **A book round is never "Checked before play" or "Verified".** The shell
  checks only that a book round's record did not change (W-52); it does not
  check the draw from `roundSecret`, and the verify page does not show book
  rounds yet (W-50). A slot is a book round, so on a slot the chip must not
  claim more.
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
- A **keyboard shortcut**: Space starts a round while the focus is on the bar
  itself (not on one of its controls, in a field, or in the game frame, whose
  keys are the game's), and never cashes out. The control says so in its tooltip
  and `aria-keyshortcuts`, not in a visible hint (Q5).
- During a steps round, when the shell offers it, the control becomes "Cash out"
  with the Snapshot's `cashOutValue.formatted` when the Snapshot carries one,
  and the `currentMultiplier` as a display value only without it (W-24, W-57's
  labels, W-31). While the player owes the first pick it is not offered (W-57:
  no disabled placeholder); its space is kept, so nothing moves, and holds the
  text "↑ Make your pick", pointing at the game. That text is not a control, is
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
  the run (the stepper is disabled), and each start copies its `AmountRequest`
  from the latest Snapshot's own `Amount` of that option, as every start does
  (W-22, W-51, W-31). The next start is sent only after the previous round's
  result has been shown for at least `minIntervalMs`.
- **It stops**, before the next start, on any of: the player's stop (the round
  in flight finishes); the count reached; the balance below the bet (a `bigint`
  comparison, W-34); the chosen bet no longer offered by the latest Snapshot
  (outside its `suggestedBets`, `minBet`, or `maxBet`); any typed or generic
  error (W-42), a void or refusal of a start included (it shows `idle`, W-54); a
  connection problem (W-43); a changed round (W-52), usually seen on the `won`
  or `lost` read itself; a round that ends other than `won` or `lost` (a book
  round cannot be `canceled`, W-54, or out of sync, W-51); a Snapshot rejected
  (W-28); "game not compatible" (W-38); a `playback` copy that fails closed
  (W-55), since the player could no longer see the rounds being played; a
  changed session (W-53); the session's end or a token that cannot be refreshed;
  the signer lock lost (W-14); the page hidden (Q3).
- **On screen.** The segment shows the remaining count and a stop square; the
  status line reads "Autoplay · n left". The start and the stop of a run are
  announced politely and a single round of it is not: a change to W-46 ("a
  status change MUST be announced"), which this RFC proposes. W-55's focus
  exception after a book result does not fire on a round of a run.
- **Operator links.** The whole run counts as a call in flight for W-49f: no
  lobby and no deposit until it stops.
- **Nothing is stored.** The count lives in memory and is gone on reload; a
  reload never resumes a run. Nothing is logged or sent.

### 7. The round line (W-39 unchanged, W-40 changed for autoplay)

The round id with its copy control and the verify link stay in the bar after a
round, as W-39 requires, after the result in the status slot; the fairness
chip's popover shows them too. W-40 keeps them "until the player starts another
round": under autoplay the player's start of the run is that act for every round
of the run, so each round's id and link replace the last one's without a new
act. W-40 gains that sentence.

### 8. The menu (W-49e, W-49f)

The lobby and the deposit move from the bar into a menu at its start. Each item
is offered exactly when W-49f offers it today. The menu always holds the session
summary below, so it is never empty. In the session-ended state the lobby is the
only way out (W-49f: "labelled as the way to relaunch"), so there it stays a
visible control in the bar, not an item of the menu. The menu also starts with
**this session**: the time since the session opened and the number of rounds
played, kept in memory only (Q4 for amounts). Links to the game's rules and to
responsible gaming need a source the Wrapper does not have today (Q4).

### 9. Accessibility (W-46, W-47, W-48)

- Text meets WCAG 2.2 AA contrast against the bar. For the glass surface the
  stylesheet contrast test checks the worst case: the surface composited over a
  white game and over a black one. At the mockup's 58 % opacity the muted labels
  fail over white; they pass from about 86 %, so the surface is at least that
  opaque, whatever the blur. The same floor is the anti-spoofing bound of
  section 1: a game drawing under the bar cannot make its own text read as the
  bar's. If review finds 86 % too weak for that, the surface over game pixels is
  solid and only its edge is blurred.
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
- **Keep both themes** (today's light and dark, by `prefers-color-scheme`): game
  stages are mostly dark, and a light bar under a dark stage reads as a separate
  page; both themes double the contrast matrix of the new surfaces. Kept as Q7.
- **Autoplay as a game feature** (the game asks for repeated starts): it would
  put a money loop behind the controller protocol, where the Wrapper can see
  less; keeping it in the Wrapper keeps every start behind the shell's rules.
- **No fairness chip**, only the failed-verification states: honest but
  invisible; the chip shows the same verdicts earlier.

## Tradeoffs

- More moving parts in the bar (a popover, a run state) and more tests.
- The `inset` capability is a change to the controller protocol (W-37, W-38 in
  [the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)):
  the `hello` validator and the reference game change with it, compatibility
  runs one way (section 1), and a game that claims it but draws its interface
  under the bar is that game's bug, not one the Wrapper can detect. W-38's
  "nothing else of the session" goes to the game gains one derived value, the
  inset.
- For a game without it, the apron adds about 116 px under the stage on a wide
  screen, which the height the Wrapper reports to the operator page (W-49d)
  includes.
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
  (W-49d: `H_min` per capability; W-49f: the menu and the autoplay run),
  [the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  (W-38: the `hello` field, the `layout` message, the message table, what the
  game is sent; W-40 under autoplay),
  [book playback](../../specs/wrapper/book-playback.md) (W-55's focus exception
  under autoplay), and [the Wrapper spec](../../specs/wrapper.md) (the
  `autoplay` configuration field and its validation; W-46's announcements and
  order; W-48's labels for W-26's reason codes; the test plan).
- **Code**: in `apps/wrapper`, the stylesheet, the bar view, the bet selector
  (to a stepper), a fairness-chip view over the shell's verdicts, an autoplay
  use case beside the start, the frame sizing and the `layout` sender, the
  configuration validator, and their tests. In `packages/shell`, the `hello`
  parser (`game-message.ts`) and the exported `HelloMessage` type gain
  `capabilities`, and a `layout` message type: a change to the shell's public
  API, so the shell spec and a changeset go with it. In `apps/reference-game`,
  its closed protocol parser (`protocol.ts`) learns `layout`. No package
  boundary moves.
- **Dependencies**: none (ADR-001); no font file.
- **Size budget**: a few kB of CSS and script; `pnpm check:size-budget` decides.
- **Telemetry**: none; autoplay and the session summary emit and store nothing.
- **Tests** (from T-29): the stepper's bounds, keys, and `aria-valuenow` as an
  index; the chip's text per round kind and verdict, with "Checked before play"
  never on a book round or a degraded check, and the round id only after a round
  ends; a round whose verdict was `failed`, or a changed book round, never reads
  "Checked before play", after it ends and through the required cancel's states
  too; W-26a's badge kept; autoplay's every stop rule, the interval, the bet
  copied from the latest Snapshot, and a configuration without the field; W-40
  and W-46 during a run; W-49f during a run; contrast of the glass surface over
  white and black; no layout shift of the start control across its states.

## Migration considerations

- The environment configuration gains one optional field; existing documents
  stay valid and get no autoplay.
- Operators see a dark bar and a menu where the lobby and deposit were; the
  operator protocol (`se.operator/1`) does not change, and W-49d's minimum
  height is recomputed from the new layout.
- Game developers: existing games need no change and get the apron. A game that
  wants to draw behind the bar adds the capability only once the Wrapper
  releases that accept it are deployed, handles `layout`, and falls back to a
  plain `hello` only when no `layout` arrives within its timeout (section 1).
  The reference game shows how.
- One release: no flag. A dark-only bar removes today's light theme for players
  whose system asks for light (Q7).

## Unresolved questions

- **Q1. The chip's words.** "How it's checked" at `idle`, "Checked before play"
  on a config round that passed W-26 (with its limits in the popover), and
  "Recorded" on a book round, or other words? "Verified" alone would read as
  "the outcome was verified", which the shell never checks. Should a game whose
  rounds are book rounds show the chip at all before #156 lets the verify page
  check its draw? _Recommendation_: show it, with these words; never "Verified"
  or "Provably fair".
- **Q2. Who turns autoplay on.** The environment document is per deployment. If
  one deployment serves operators in markets with different rules, the switch
  must be per operator: an operator-keyed map in the environment document, or a
  field in the operator's `hello`. The `hello` field changes `se.operator/1`,
  which needs an ADR superseding ADR-006; the operator's `hello` is absent on
  ADR-011's proven path; and a switch for a money loop read from a message is
  weaker than one in the document the SE origin serves. _Recommendation_: per
  deployment first; an operator-keyed map in the document when a deployment
  needs it, never the `hello`.
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
  it as proposed (only while the focus is on the bar itself), allow it anywhere
  on the page, or drop it? _Recommendation_: as proposed.
- **Q6. The `inset` addition to the controller protocol.** Three choices:
  - stay on `se.controller/1` with an optional field, compatible one way only (a
    new game on an older Wrapper has its `hello` ignored, section 1);
  - move to `se.controller/2`, which W-38's "closed, versioned" schema points
    to: a game can offer both and the Wrapper answers the one it speaks;
  - keep it out of this RFC, in its own RFC and ADR.

  Also: is an unknown capability string refused (proposed) or ignored, and is
  the apron one neutral dark tone (proposed) or a colour the game declares?
  _Recommendation_: an ADR for the addition, decided with this RFC, on
  `se.controller/1` with the fallback to a plain `hello`; unknown strings
  refused; the neutral tone.

- **Q7. Theme.** Today the Wrapper follows `prefers-color-scheme` (light and
  dark). Dark only (removing the light theme), keep both for the new bar, or a
  theme the operator chooses? _Recommendation_: dark only in this version.
- **Q8. Unaffordable options.** Plus and MAX stop at the highest affordable
  option (proposed), or reach every option and let the start be refused?
  _Recommendation_: stop at the highest affordable one, as the chips do today.
- **Q9. The face.** Which installed face leads the stack: Bahnschrift (DIN,
  proposed), Segoe UI Variable / SF Pro (the OS UI faces), Franklin Gothic /
  Avenir Next, or Gill Sans? The mockup has a toggle for all four. A stack
  differs by platform by nature: Bahnschrift exists only on Windows, so macOS
  gets DIN Alternate and other systems the UI font. _Recommendation_:
  Bahnschrift, then DIN Alternate.
- **Q10. Where autoplay's run lives.** Its stop rules read the shell's state
  (the signer lock, a changed session, the session's end, a token that cannot be
  refreshed), and it sends starts. A use case in `apps/wrapper` beside the
  start, or a run in `packages/shell` that the Wrapper drives and shows?
  _Recommendation_: the shell (a run with its stop rules, reported to the UI as
  state), so no money logic sits outside the shell; the Wrapper shows the count
  and the stop control.

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
- **The bar never covers the game, and the game extends behind it**: the game
  draws its scene under the bar and keeps its interface above it (section 1),
  rather than the Wrapper adding a plain band. Tried with a real
  `se.controller/1` steps game.
