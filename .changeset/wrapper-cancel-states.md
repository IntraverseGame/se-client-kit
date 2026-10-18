---
"@intraverse/se-client-wrapper": minor
---

The Wrapper shows and reads the shell's required cancel (W-25, W-26, W-33,
W-35). While the cancel is `settling`, the Snapshot is polled with the usual
backoff and slow rate, also when the round shows `active` and through the
round's failed verification, a typed error, or a rejected read; in
`check-later` the fast poll stops and one background read runs every 30 s,
with a "check again" control that reads once; the poll stops once the cancel is
`ended`, `not-taken`, or `sent`. `check-later` shows "Still resolving — contact
support" beside the failed verification, with the round id and the verify
link; `ended` shows a neutral "Round ended" with the round id, the verify link,
and a new round, and no result claim, after one more read for the current
balance (a failed one keeps the round's balance, with no error); a `canceled` result of the shell's own
cancel reads "This round failed verification and was canceled."
