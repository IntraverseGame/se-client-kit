---
"@intraverse/se-client-shell": minor
---

The session the Wrapper UI plays through. New public API: `takeLaunchCode`
(the launch code is the whole URL fragment, 1 to 128 raw characters, removed
with `history.replaceState` and returned sealed; `MAX_LAUNCH_CODE_LENGTH`),
`discardLaunchCode` (forgets a code that will not be redeemed),
`openPlaySession` (redeems the code once and never retries it, takes the
`se:signer:<sessionId>` Web Lock, holds the play token in memory and refreshes
it from `tokenExpiresAt` with the redeem's clock offset, retrying a retryable
failure with backoff while the token is valid and ending the session on
`SESSION_EXPIRED`, `SESSION_REVOKED`, `UNAUTHENTICATED`, or the deadline), and
`isRoundOver`, the kit's one check of whether a round is over. The session
(`PlaySession`) gives the UI use cases and read-only state only: `read`,
`start`, `cashOut`, `round` (the W-26 verdict, out of sync, and whether a
cash-out is offered), `mountGame` (the controller bridge with the session's
pick use case, and the `gameOrigins` allow-list and own origin the session was
opened with), and change and end notices. One start or cash-out runs at a
time: a second while one is in flight is refused `busy`, and a start while the
held round is not over is refused `round-exists`, with nothing sent; it prints `[redacted]`, and no
type it returns holds a key, a token, a signature, or the transcript. New
types: `PlaySessionOptions`, `SessionParts`, `SessionOpening`, `SessionRead`,
`RoundState`, `GameMount`, `GameMountOptions`, `PlaySession`, `Bet`,
`BindMode`, `FailReason`, `LaunchCode`, `LaunchHistory`, `LaunchLocation`,
`RoundEnd`, and the platform types `Clock`, `FetchLike`, `RefreshConfig`, and
`TimerHandle`. The round flows' test-only typedData encoder is no longer an
option: production always uses `signing`'s canonical encoding. Provisional:
the bind mode is an input, and the game origin D is an injected source until
the redeem answer's `gameOrigin` is vendored.
