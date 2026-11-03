---
"@intraverse/se-client-wrapper": patch
---

The Wrapper's "Cash out" control is ready to show what cashing out now credits:
when an `active` round's Snapshot carries `cashOutValue`, the control reads
"Cash out" followed by its `formatted` in place of the multiplier. The field
reaches the Wrapper once an update of
`@intraverse/se-client-contracts` brings it to the Snapshot schema
`se.snapshot/1`; until then the schema rejects a Snapshot carrying it, and the
control reads "Cash out" with the multiplier as a display value, as before. The
round line's multiplier is unchanged either way, and no amount is ever computed
from `currentMultiplier` or anything else.
