---
"@intraverse/se-client-play-client": minor
---

Add the Play API request layer: `createTransport` (an `https:` base, request
options with `redirect: "error"`, timeout, a caller abort signal, bounded
retries by retry class, with a refresh bound to the old token's deadline), the
`NetworkError`, `ProblemError`, and `ProtocolError` types with problem mapping,
the token refresh schedule with the `Date` header clock offset, and idempotency
keys.
