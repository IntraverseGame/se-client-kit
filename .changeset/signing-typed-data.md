---
"@intraverse/se-client-signing": minor
"@intraverse/se-client-contracts": minor
---

Add `encodeTypedData`, with the types `TypedDataFields` and `TypedDataKind`:
the canonical bytes of a move's, a cash-out's, or a cancel's typed data
(`ActionTypedData`), which a signed action sends as `typedData` in base64. The
fields are written in number order and an empty path is left out; an unknown
kind, an empty action, an action with a lone surrogate, a path entry outside
`uint8`, a cancel with a path, a
sequence of 0 or outside `uint32`, and a `previous` that is not 32 bytes are
refused with `invalid-input`, whose fixed message is now "a value does not fit
its field type". The
backend's `typed-data` Snapshot vectors are vendored in `contracts` (test-only
entry, `snapshotVectors.typedData`) and replay byte for byte.
