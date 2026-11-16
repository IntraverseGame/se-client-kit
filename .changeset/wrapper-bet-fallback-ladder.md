---
"@intraverse/se-client-shell": minor
"@intraverse/se-client-wrapper": minor
---

When the Snapshot suggests no bets (`bet.suggestedBets` is empty), the bet
stepper offers a fallback ladder of 1, 10, 20, 50, and 100 whole units of the
minimum bet's currency, kept within `minBet` and `maxBet`, beside `defaultBet`.
Each ladder amount's `formatted` copies `minBet.formatted` with the number
replaced. The shell exports the offered set as `suggestedOrLadder`, and
autoplay's "still offered" rule reads it too, so a run on a ladder bet goes on.
