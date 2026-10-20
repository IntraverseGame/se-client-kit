---
"@intraverse/se-client-play-client": minor
---

The verify API read is added: `getRoundVerification(transport, roundId, options?)`
reads `GET /verify/v1/rounds/{roundId}` with no credential and answers the body
as `unknown`, with `VERIFY_ROUTES`, `verifyRoute`, `VerifyOperationId`, and
`VerifyRoute`. Its transport is made with `verifyApiBaseUrl` as the base.
