---
"@intraverse/se-client-snapshot": minor
---

The first API: `validateSnapshot`, `validatePlayProblem`, and `validateAmountRequest`, a hand-written evaluator over the `se.snapshot/1` keyword profile that never throws and returns location-only issues; `ValidSnapshot` and `ValidPlayProblem`, narrowed by `status` and `code`; `isStepsPresentation` and `isPlaybackPresentation`; and `parseBaseUnits` and `compareAmounts`, which read amounts as `bigint`.
