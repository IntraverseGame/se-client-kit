---
"@intraverse/se-client-wrapper": minor
---

A framed Wrapper no longer needs the operator page's `se.operator/1` `hello`
where the browser proves who embeds it: when the page is not nested and
`location.ancestorOrigins` holds exactly one origin on `operatorOrigins`, the
session opens without waiting, the Wrapper posts `welcome` once to that origin,
then `resize` (ADR-011). Where `location.ancestorOrigins` is missing, `hello` is
still required within 10 s (`handshake-timeout`). A masked or empty list, more
than one entry, an unlisted entry, and nesting are refused as before, and a
`hello` that arrives is still checked and answered. Operator pages that already
send `hello` need no change.
