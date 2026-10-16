---
"@intraverse/se-client-shell": minor
---

The first public API: `createLogger`, a redacting logger with `warn` and
`error` only, whose lines carry a fixed event name and the request fields
(method, path, status, `requestId`, code) and print anything else as
`[redacted]`; `REDACTED`; and `ShellError` with its `ShellErrorCode`. Inside
the package: key custody behind the session's Web Lock, and the transcript
state that records a signed action with its idempotency key before it is sent,
never signs two actions at one sequence, and never reads a `resolving`
Snapshot as a move applied.
