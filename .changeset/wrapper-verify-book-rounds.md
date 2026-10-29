---
"@intraverse/se-client-wrapper": minor
---

The verify page in the release artifact reads book rounds (#156, V-18 to
V-21). A verify API body with `book` is a book round, and one with `book` and a
signed creation authorization, ready evidence, or signed actions is refused as
an API error. For a book round the page recomputes the round secret's
commitment (check 5), block N by its quorum read with `entropy.chainId` held
to the pinned chain (check 6), and the seed (check 7); checks 2 to 4 do not
apply; the draw (check 8) and the payout are shown as not checked, since the
kit has no public kernel vector for the weighted draw and the verify API does
not carry the mode's table, and a disagreement between the API's recorded and
redrawn rows fails check 8. An ended `won` or `lost` book round reaches a new
not-recomputable reason, "This round's draw was not recomputed", with its
result and payout labelled as the verify API reports them; a `canceled` one is
read under the `canceled` rules.
