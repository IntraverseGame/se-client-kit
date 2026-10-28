---
"@intraverse/se-client-wrapper": minor
---

The Wrapper plays a book round (#146, W-54 to W-56): `idle`, `starting`
("preparing the round", polled), and `won` or `lost` with the result, the
payout as the Snapshot's `formatted` (never computed from the draw's
multiplier), the round id, the verify link, and the next bet. Beside the bet
selector it shows the mode's "Return to player: <p>%" from `config.rtp.decimal`
by string operations only, and nothing when `rtp` is absent. The game frame is
shown with a book round's result until the next start, and hidden otherwise, on
a changed round, and when the game's `playback` copy failed closed, where "The
game can't show this round." shows in its place. A changed round that is over shows its result with "This round failed
verification." beside it, and the result heading takes focus when a poll brings
the result of the book round the player just started. A changed session (W-53)
shows "this round failed verification" with the detail "The game changed during
this session. Reload to continue.", final until a reload, with the lobby control
only (W-49f).
