---
"@intraverse/se-client-wrapper": patch
---

The Wrapper's "Cash out" control shows what cashing out now credits: when an
`active` round's Snapshot carries `cashOutValue`, the control reads "Cash out"
followed by its `formatted` in place of the multiplier. Without the field the
control reads "Cash out" with the multiplier as a display value, as before. The
round line's multiplier is the same with or without the field, and no amount is
ever computed from `currentMultiplier` or anything else.
