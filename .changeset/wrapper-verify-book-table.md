---
"@intraverse/se-client-wrapper": patch
---

The verify page in the release artifact reads the verify API's `book.table`
(V-21): a list of at most 250,000 rows, each with `id`, `weight`, and
`multiplierMilli` as base-10 strings of at most 78 digits. A malformed table, or
a longer one, is refused as an API error; a well-formed one is accepted and not
used yet, so a book round's draw (check 8) stays not checked.
