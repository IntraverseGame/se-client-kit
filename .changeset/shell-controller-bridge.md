---
"@intraverse/se-client-shell": minor
---

`createControllerBridge` mounts the `se.controller/1` boundary to the game
iframe. It refuses a game origin that is not on the configuration's allow-list,
equals the Wrapper's own origin, or is not a serialized origin; accepts a
message only from the game frame's window and the game origin; parses it
against a closed message set (`hello`, and `action` with the `pick` verb) and
ignores anything else, a string or an extra field included; sends nothing
before the game's `hello`; and posts only with the game origin as
`targetOrigin`. The game receives an allow-listed copy of each validated
Snapshot (no proofs, session id, links, or amounts) and closed `reject` reasons
(`not_legal`, `not_active`, `busy`, `invalid`). A legal pick goes to an injected
pick use case; the bridge never holds a key, a token, or a signed action. The
message types (`HelloMessage`, `ActionMessage`, `SnapshotMessage`,
`RejectMessage`, `GameSnapshot`, `GameStep`, `Pick`, `RejectReason`), the
bridge's option, result, and state types, `CONTROLLER_SCHEMA`, and
`ROUND_STATUSES` are public.
