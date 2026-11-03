---
"@intraverse/se-client-wrapper": minor
---

The Wrapper plays a book round (#146, W-54 to W-56): `idle`, `starting`
("preparing the round", polled), and `won` or `lost` with the result, the
payout as the Snapshot's `formatted` (on `lost` only when `payout.value` is
above 0, and never computed from the draw's multiplier), the round id, the
verify link, and the next bet. Beside the bet selector it shows the mode's
"Return to player: <p>%" from `config.rtp.decimal` by string operations only,
and nothing when `rtp` is absent. The game frame is shown as on any round
(W-57), inert: the game plays the draw back with no input beside the result,
and stays in place through the next round's start (W-55). A changed round
covers the frame, and a result whose `playback` copy failed closed covers it
with "The game can't show this round." until a Snapshot whose copy succeeds. A
changed round that is over shows its result with "This round failed
verification." beside it, and the result heading takes focus when a poll brings
the result of the book round the player just started. A changed session (W-53)
shows "this round failed verification" with the detail "The game changed during
this session. Reload to continue.", final until a reload, with the lobby control
only (W-49f).
