---
"@intraverse/se-client-shell": minor
---

The operator channel's `check` no longer waits for a `hello` when
`ancestorOrigins` holds exactly one entry on `operatorOrigins`: that entry, set
by the browser, proves the parent's origin, so the channel opens to it at once,
posts `welcome` to it once, and starts no timer (ADR-011). A `hello` recorded
before `check` is still checked first, and one from another origin is still
`operator-not-allowed`; a later valid `hello` from the fixed origin is still
answered with `welcome`. With no list, an empty one, several entries, or an
unlisted entry, `check` waits for a `hello` as before. The caller refuses a
nested page before it calls `check`.
