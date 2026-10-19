---
"@intraverse/se-client-shell": minor
---

`createOperatorChannel` runs the `se.operator/1` handshake with the page that
embeds the Wrapper. Before the configuration is validated it records the first
well-formed `hello` from the parent window and answers nothing; `check` then
accepts that `hello` at once when its origin is on `operatorOrigins` (and equal
to `location.ancestorOrigins[0]` where that exists), refuses it finally
(`operator-not-allowed`) when it is not, or else waits for one, for 10 s on the
injected clock by default (`HANDSHAKE_TIMEOUT_MS`), before it refuses
(`handshake-timeout`). The first valid `hello` fixes the operator origin: the
channel posts `welcome` to it, answers a repeat from it with `welcome` again,
and later sends `resize` heights to it only (an integer from 1 to
`MAX_RESIZE_HEIGHT`, never the same value twice in a row). A message is read
only from the parent window, through the own data properties of a plain object
with exactly `schema` and `type`; anything else is ignored and never answered.
No message carries a secret, an id, an amount, or a URL. `OPERATOR_SCHEMA` and
the message, option, outcome, and state types are public.

`createControllerBridge` also refuses a game origin whose host shares its last
two labels with the Wrapper's (`same-site`, W-37's registrable-domain rule
without a public suffix list). Its options take the configuration's
`environment`: only in `local` are two loopback hosts exempt. The session gives
the bridge the environment of the configuration it was opened with; the UI's
mount cannot.
