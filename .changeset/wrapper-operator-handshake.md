---
"@intraverse/se-client-wrapper": minor
---

The Wrapper runs the operator launch contract (`se.operator/1`). A framed
Wrapper opens no session, redeems nothing, signs nothing, mounts no game, and
offers no control until the operator page's `hello` is accepted; with no valid
`hello` within 10 s of the configuration's validation it shows the
configuration-error state, finally. Only direct embedding is supported: a page
framed through another page is refused, and where `location.ancestorOrigins`
exists it must hold exactly one origin on `operatorOrigins`. Each refusal logs
`embedding.refused` with its reason only (`nested`, `operator-not-allowed`, and
`handshake-timeout` are new). Once accepted, the Wrapper tells the operator page
its content's height (`resize`).

The lobby and deposit are the player's own links to the Snapshot's
`context.links`, offered only in the states that allow them: the lobby (on an
`operatorOrigins` origin) navigates the operator's page, and the deposit opens a
new page with no opener and no referrer. Neither is offered while a round is in
play or while a start or cash-out call is in flight. A configuration whose
`operatorOrigins` holds a game origin or the Wrapper's own origin, or whose
`gameOrigins` holds the Wrapper's own origin, is refused.
