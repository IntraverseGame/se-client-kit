# ADR-010 — `resize`'s height is a minimum, never a size

- Status: accepted
- Date: 2026-10-30 (decided as RFC-004 Q11 by the human on 2026-10-29; this
  record accepted by the human on 2026-10-30)
- Relates to: [ADR-006](./ADR-006-the-operator-protocol-se-operator-1.md) (the
  operator protocol `se.operator/1`, which this ADR leaves unchanged),
  [RFC-004](../rfcs/archived/RFC-004-single-screen-wrapper.md) (the single
  screen, Q6 and Q11), [W-49d](../specs/wrapper/operator-embedding.md) and
  [W-57](../specs/wrapper/the-single-screen.md#the-height)

## Context

`se.operator/1` has one message the Wrapper sends on its own, `resize`, whose
`height` is "the height the Wrapper's content needs" (W-49b). Until now W-49d
computed it as the `<body>`'s box, and the embedding guide's sample set the
iframe's `height` from it.

The single screen (RFC-004, Q6 decided 2026-10-29) makes the Wrapper fill its
iframe's viewport. Measured as before, `height` would only echo the height the
operator page already gave, and it could loop: an operator page that sets the
iframe's height from it, with a border or padding under
`box-sizing: border-box`, gives the Wrapper a smaller viewport than the value it
set, which the Wrapper reports, and the box shrinks on every frame.

ADR-006 freezes `/1`'s message set and fields; a change to either is
`se.operator/2`. It does not say how `height` is computed. Once operator pages
use `height` one way, changing that use is hard, so the meaning is recorded
here.

## Decision

1. `resize`'s `height` is **the least height the Wrapper's content needs at its
   current width and text size**: the bar's reserved height, measured and
   rounded up, plus the stage's minimum (`H_min`, W-57). It is never the
   viewport's height or the `<body>`'s box, and it does not change with the
   round's state or the iframe's height.
2. An operator page uses it as a **minimum** (`min-height`) and gives the iframe
   its own box; it never sets the iframe's height from it.
3. This is **within `se.operator/1`**: the message, its fields, their type and
   bound, and the stated meaning in W-49b are unchanged, and the operator page
   MAY still ignore the message (W-49d). ADR-006 is not superseded.

## Alternatives considered

- **Stop sending `resize`.** Simple, but an operator page could not learn the
  least height the Wrapper needs.
- **Treat the new value as a protocol change**, moving `resize` to
  `se.operator/2` under an ADR that supersedes ADR-006. Not needed: no field or
  stated meaning changes, and no operator integrates yet.
- **Keep the `<body>`'s box.** Meaningless once the Wrapper fills its box, and a
  loop risk.

## Consequences / tradeoffs

- A breaking change for an operator page that sets the iframe's height from
  `resize`: its iframe would shrink to the Wrapper's minimum. Nothing is
  released and no operator integrates yet; the embedding guide's sample uses
  `min-height`, and the Wrapper's release notes name the change.
- No loop is possible: the value depends only on the width and the text size.
- The value is built with the single screen; until then the Wrapper sends the
  `<body>`'s box, which works as a minimum too.

## References

- [RFC-004](../rfcs/archived/RFC-004-single-screen-wrapper.md), Decisions Q6 and
  Q11
- [Operator embedding](../specs/wrapper/operator-embedding.md), W-49b and W-49d
