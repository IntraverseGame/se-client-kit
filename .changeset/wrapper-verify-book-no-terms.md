---
"@intraverse/se-client-wrapper": patch
---

The verify page in the release artifact reads a book round without `game.terms`
(V-18, V-21), as the verify API document now has it. A body with both `book` and
`game.terms`, or with neither, is refused as an API error. A config round's
`game.terms` keeps its bounds, `maxMultiplierMilli` of at least 1 included.
