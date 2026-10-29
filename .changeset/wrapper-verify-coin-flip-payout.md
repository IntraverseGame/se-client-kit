---
"@intraverse/se-client-wrapper": minor
---

The verify page in the release artifact recomputes a Coin Flip round's payout
(check 7). For a `won` or `lost` round, the payout follows from the recomputed
outcome: 0 for a loss, and for a win Coin Flip's payout from the round's
`game.terms` (house edge and multiplier cap) and its bet, in whole base units,
as the SuperEngine fairness kernel's `coin-flip-payout` vectors pin it. A
payout that differs from the round's fails check 7, and terms or a bet the
kernel refuses make check 7 a mismatch naming the field. The summary of a
matching `won` or `lost` round no longer labels its payout "not checked". The
signed `payoutTermsHash` is still taken as signed and not tied to `game.terms`.
