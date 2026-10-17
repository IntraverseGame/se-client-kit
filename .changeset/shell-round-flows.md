---
"@intraverse/se-client-shell": minor
"@intraverse/se-client-signing": minor
---

The shell's round flows: start (the action key and the bet, nothing signed),
move and cash-out checked against the shell's own latest validated Snapshot and
signed once per step, the W-16 resend, the W-19 resynchronization after a 400
`INVALID_ARGUMENT` or a 409 `STALE_ACTION`, the one cancel a failed tip check requires (its same bytes sent again, once,
only after a lost response or a 503 and a Snapshot that shows the round still
cancelable), and the re-issue state that signs nothing new. The transcript state is
opened only with a settled `T_0`. Every signed action carries `signing`'s
canonical `encodeTypedData` bytes as its `typedData` (base64, at most 4096
characters), checked against the vendored `typed-data` vectors; the shell
refuses to send one whose signed message differs from the encoded one. They
and the pick use case are internal for
now. New public API: `createSnapshotReader`, which gives the Wrapper UI
validated Snapshots and typed Play API errors (`SnapshotRead`,
`SnapshotReader`, `SnapshotReaderOptions`, and the re-exported `ValidSnapshot`
and `ValidPlayProblem`), and the `snapshot-rejected` error code.

`signing`: `provisionalGrammar` is replaced by `actionGrammar`, the published
grammar. `pick(path, tile)` derives the row from the path (`r = len(path) - 1`),
`cashOut(path)` takes the steps survived, and `cancel()` is added; each returns
the action text and its path.
