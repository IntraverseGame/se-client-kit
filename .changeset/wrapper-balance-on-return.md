---
"@intraverse/se-client-wrapper": minor
---

When the page becomes visible again at `idle` or on a round's
result, the Wrapper reads the Snapshot once (after a 1 s debounce), so a deposit
made in another tab shows before the next start. It is not a poll: one read per
return, none in a state that polls or shows a problem, and a failed read shows
nothing. A Snapshot whose `version` is not higher than the shown one is still
ignored (W-29).
