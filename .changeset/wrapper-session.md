---
"@intraverse/se-client-wrapper": minor
---

The Wrapper opens a session. Its entry takes the launch code out of the URL
fragment before any request (the configuration document included), and once
the configuration is accepted it opens the session through the shell: no code,
a refused or lost redeem, another tab holding the session, and a browser
without Web Locks each show their own state and send nothing more. The bet
selector starts a round with the Snapshot's own `Amount` fields; an `active`
round is shown as being checked until the shell's W-26 checks pass, and as
"this round failed verification", "could not verify the chain", or out of sync
when they do not; the cash-out control is offered only when the shell offers
it, and a second start or cash-out click while one is in flight does nothing
(the shell refuses it too). Polling follows the shell's `isRoundOver`. The game iframe is mounted,
sandboxed and titled, on the session's game origin D with
`?parentOrigin=<the Wrapper's origin>` only once the shell's bridge accepted D
(no source of D is wired yet, so no game is mounted). No payout amount is
shown on `won` until the Snapshot carries one. The tip check's JSON-RPC
transport is added. Operator embedding, the W-49 minimum: a framed Wrapper
opens no session unless `location.ancestorOrigins` exists and every entry is on
`operatorOrigins` (a masked entry refuses); without that list (Firefox) it
opens none while framed, until the operator handshake is built. A refusal
shows the configuration-error state and logs `embedding.refused` with its
reason code; the launch code is then discarded, as it is when the
configuration is refused. The reduced-motion rule now also stops the progress
icon's animation, which a class selector had kept running.
