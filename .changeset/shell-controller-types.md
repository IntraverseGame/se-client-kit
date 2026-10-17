---
"@intraverse/se-client-shell": minor
---

Add the type-only entry `@intraverse/se-client-shell/controller` for a game: the
`se.controller/1` types (`HelloMessage`, `ActionMessage`, `SnapshotMessage`,
`RejectMessage`, `GameMessage`, `WrapperMessage`, `GameSnapshot`, `GameStep`,
`Pick`, `Presentation`, `RoundStatus`, and `RejectReason`) and no value. Its
`exports` entry has a `types` condition only, so it is imported with
`import type` and a runtime import of it does not resolve.
