---
"@intraverse/se-client-contracts": patch
---

Sync the verify API document (`/verify/v1`) to the version with a clearer
description of the round's `payout` (the game's payout, the value the
recomputation reproduces) and a fuller `kernel.vectorSets` example that lists
the `shuffle-draw` set. No schema change: the generated types differ only in a
doc comment.
