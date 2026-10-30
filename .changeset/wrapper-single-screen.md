---
"@intraverse/se-client-wrapper": minor
---

The Wrapper is one screen (W-57, W-58, RFC-004). The game frame shows from its
mount, in one place at one size for the whole session, over one control bar
that changes in place: the status line (an error shows under its heading, in
the place of its detail), the primary controls, the round line, and the lobby
and deposit. The frame takes input only in a
playable round (`active`, held by the shell, verdict `ready`); in every other
state it is `inert`, under a translucent scrim while the round is checked, or
an opaque cover in a state that stops the round. The final states (the
session ended, another tab, a changed session) hide it behind the cover. The
start control reads "Place bet" at `idle` and "Play again" beside a result;
"Cash out" shows the multiplier beside it, never an amount. "Waiting for your
move to be confirmed." shows while a move or cash-out is pending and an error
shows. The focus follows W-46's single-screen rules: it moves into the game
once when the round the player started is ready, never stays on an inert
frame, and stays in the frame when an error answers a pick.

The game is sent an `active` Snapshot only once its round is ready (W-38's
hold, in the shell): a game now sees a round go from `starting` to `active`
later than before, and a `ROUND_ACTIVE` resume or a round an earlier page left
open is no longer sent as `active`. A game must render an `idle` state, since
it now shows at `idle`.

For operators: `resize` now reports the least height the Wrapper needs at its
width and text size (`H_min`, ADR-010), not its content's box, and does not
change with the round's state. Use it as the iframe's `min-height`, never as
its height: a page that set the iframe's height from `resize` would shrink it
to the minimum. The Wrapper fills the box it is given.
