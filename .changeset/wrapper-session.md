---
"@intraverse/se-client-wrapper": minor
---

The Wrapper opens a session. Its entry takes the launch code out of the URL
fragment before any request (the configuration document included), and once
the configuration is accepted it opens the session through the shell: no code
or a refused or lost redeem shows the session-ended state, another tab holding
the session and a browser without Web Locks each show their own state, and none
of them sends anything more. The bet selector starts a round with the Snapshot's
own `Amount` fields; an `active` round is shown as being checked until the
shell's W-26 checks pass, and as "this round failed verification", "could not
verify the chain", or out of sync when they do not; the cash-out control is
offered only when the shell offers it, and a second start or cash-out click
while one is in flight does nothing (the shell refuses it too). Polling follows
the shell's `isRoundOver`. The game iframe is mounted, sandboxed and titled, on
the session's game origin D (the redeem answer's `gameOrigin`) with
`?parentOrigin=<the Wrapper's origin>` only once the shell's bridge accepted D.
The tip check's JSON-RPC transport is added. Operator embedding (W-49a, W-49c):
a framed Wrapper opens no session unless it is framed directly, any
`location.ancestorOrigins` holds exactly one origin, on `operatorOrigins` (a
masked entry or an empty list refuses), and the operator handshake completes. A
refusal shows the configuration-error state and logs `embedding.refused` with
its reason code; the launch code is then discarded, as it is when the
configuration is refused. The reduced-motion rule also stops the progress icon's
animation.
