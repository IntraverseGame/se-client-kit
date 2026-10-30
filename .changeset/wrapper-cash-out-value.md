---
"@intraverse/se-client-wrapper": patch
---

The Wrapper's "Cash out" control is ready to show what cashing out now credits:
when an `active` round's Snapshot carries `cashOutValue` (se-backend's ADR-050),
the control reads "Cash out" followed by its `formatted` in place of the
multiplier. The field reaches the Wrapper once the contracts sync of this
release vendors the new `se.snapshot/1` schema; until then the vendored schema
rejects a Snapshot carrying it, and the control reads "Cash out" with the
multiplier as a display value, as before. The round line's multiplier is
unchanged either way, and no amount is ever computed from `currentMultiplier`
or anything else.
