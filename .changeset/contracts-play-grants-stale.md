---
"@intraverse/se-client-contracts": minor
"@intraverse/se-client-play-client": minor
---

Sync the Play API document (`/play/v1`) to the version that adds
`GET /play/v1/grants` (`listGrants`, with the `GrantList`, `PlayGrant` and
`GrantId` schemas) and an optional `grantId` on the `rounds:start` request, and
that answers a move or a cash-out with a wrong `sequence` or `previous` as 409
`STALE_ACTION` instead of 400 `INVALID_ARGUMENT` (a cancel still answers 400).
The generated types gain the new operation and schemas, and `PLAY_ROUTES` in
`play-client` lists the `listGrants` route. The kit adds no client function for
grants; the shell already resynchronizes after either code. No behavior change for the
Wrapper.
