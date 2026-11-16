---
"@intraverse/se-client-wrapper": minor
---

The control bar, version 2 (RFC-005, built on the recommendations of its open
questions): one dark line of 2.75rem controls, the menu (the lobby and the
deposit, and this session's time and rounds, no amount), the balance, a bet
stepper over the same options the chips offered (a `spinbutton` whose value is
the option's index; plus and MAX stop at the highest affordable option), the
status slot with a fairness chip that says what the browser checked ("How it's
checked", "Checking", "Checked before play", "Checked (dev)", "Not verified",
or "Recorded" on a book round; never "Verified"), and one start control of one
width, with a state edge along the bar's top. Space starts a round while the
focus is on the bar itself. The light theme is gone.

On a wide screen the bar floats over the stage: a game that declares the
`inset` capability gets the whole stage and the band the bar covers; any other
game keeps its frame above a neutral apron. The bar docks under the stage on a
narrower screen or when less than the stage's minimum of the game would show.
For operators: the lobby and the deposit moved into the bar's menu (the lobby
stays visible when the session ended), and `resize` now depends on the game's
capability, so it may change once after the game's `hello`.

The environment configuration gains the optional `autoplay` field
(`{ counts, minIntervalMs }`): with it, book rounds offer autoplay, which the
shell runs and stops; a malformed field refuses the document
(`invalid-autoplay`). Without it there is no autoplay.
