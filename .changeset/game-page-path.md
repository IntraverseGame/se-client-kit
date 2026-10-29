---
"@intraverse/se-client-play-client": minor
"@intraverse/se-client-shell": minor
"@intraverse/se-client-wrapper": minor
---

Frame a game at the path of its page on its origin, so several games can share
one origin. `redeemLaunchCode` returns the redeem answer's optional `gamePath`
when it has one, and throws a `ProtocolError` for one that breaks the Play API
document's rule (1 to 255 characters, starting and ending with `/`, segments of
unreserved characters, never `.` or `..`). A `PlaySession`'s accepted
`mountGame` result adds `gamePath` (`/` when the answer has none), and the
Wrapper frames `gameOrigin` + `gamePath` with its `parentOrigin`. Origin checks
are unchanged: messages are still matched by the game origin only.
