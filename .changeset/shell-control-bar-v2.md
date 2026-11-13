---
"@intraverse/se-client-shell": minor
---

The controller protocol gains the `inset` capability (RFC-005): a game's
`hello` may carry `capabilities`, a non-empty list from a closed list (today
`"inset"` only; an unknown capability fails the `hello`), and the bridge then
sends it `layout` (`{ schema: "se.controller/1", type: "layout", insetBottom }`)
right after the `hello` and on every change of the band the Wrapper's bar
covers. New types `GameCapability` and `LayoutMessage`; `HelloMessage` gains
the optional `capabilities`, `WrapperMessage` the `layout` message.
`ControllerBridgeOptions` gains `onCapabilities` and `insetBottom`,
`ControllerBridge` gains `layout(insetBottom)`, and an accepted `mountGame`
returns `layout`. A game without the capability is unaffected.

`PlaySession` gains autoplay of book rounds: `autoplay({ count, bet,
minIntervalMs })`, `stopAutoplay`, `autoplayState`, and `onAutoplay`, with the
types `AutoplayRequest`, `AutoplayState`, `AutoplayStop`,
`AutoplayOutsideStop`, `AutoplayRefusal`, `AutoplayBegin`, and the bounds
`AUTOPLAY_MAX_COUNT` and `AUTOPLAY_MAX_INTERVAL_MS`. Each start of a run is the
session's own start; the run stops on every stop rule of W-61, and `start` is
refused `busy` while it runs. Its starts' answers reach `onChange` marked
with the new `ChangeSource` `"autoplay"` (a pick's answer is `"pick"`), so a
UI moves no focus for them; a start that rejects is answered `refused` with the
new `ShellErrorCode` `"use-case-failed"`. Nothing of it is stored or logged.

`RoundState` gains `failure` and `tipFailure` when the verdict failed: which
check refused the round (W-26's check reasons, `reissued`, `tip-check` with
its cause, or `changed` for a changed book round), with the types
`RoundFailure` and `RoundTipFailure`.
