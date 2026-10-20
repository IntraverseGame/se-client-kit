# The `play-client` request layer

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`play-client` is built in two layers: a hand-written request layer, and one
function per Play API operation on top of it, typed from the Play API document's
generated types (the operations are under [Operations](#operations)). The
request layer holds these rules (the Wrapper requirements it serves are in
brackets):

- **No credential is kept.** The shell holds the play token and runs the refresh
  loop (W-3, W-6, W-7); `play-client` provides the pieces it uses (the request
  layer, the refresh schedule, single flight, the retry classes) and never holds
  a token or schedules a refresh itself. A request takes its `Authorization`
  value from a function the shell passes, read once per attempt and never
  stored. The header form is one function, `bearerAuthorization`:
  `Bearer <token>`, the document's `playToken` bearer scheme (W-3).
- **The base.** The Play API base (`playApiBaseUrl`) ends with the document's
  prefix `/play/v1`; an operation's path is the document's path below it (for
  example `/rounds:start`). It must be an `https:` URL; `http:` is allowed only
  on a loopback host (`localhost`, `127.0.0.1`, `[::1]`), for local development.
  Any other base, and a base with credentials, a query string, or a fragment, is
  refused when the transport is created (W-3).
- **Request options.** Every request is sent with `credentials: "omit"`,
  `cache: "no-store"`, `referrerPolicy: "no-referrer"`, and `redirect: "error"`
  (W-3), so the token is never sent on to another URL. A refused redirect
  surfaces as a `NetworkError` (`network`), which is how the platform `fetch`
  reports it; a 3xx response that a `fetch` hands back anyway is a
  `ProtocolError`. A path is absolute below the configured base, and a path with
  a query string or a fragment is refused: no query string or fragment is sent,
  and a secret is never placed in a path, because error messages carry the path.
- **Timeout and cancel.** Every attempt, the body read included, times out
  (default 15 s, W-43) and is aborted through the platform `AbortController`
  when there is one. A request may carry the caller's abort signal: aborting it
  aborts the in-flight `fetch`, or clears a backoff wait, and the request
  rejects with a `NetworkError` (`aborted`) without another attempt and without
  reading its `Authorization` again (the shell stops its calls when the session
  ends, W-7).
- **Errors.** Three types: `NetworkError` (no response: `timeout`, `network`, or
  `aborted`; the platform's error is dropped, since it can name the URL),
  `ProblemError` (an error status with a problem body: its `code`, `retryable`,
  HTTP `status`, and `requestId` are read, the body stays `unknown` for the
  `snapshot` validator and is not enumerable, so a console dump shows what the
  JSON form shows), and `ProtocolError` (an error status without a problem body,
  or a body that is not JSON). A message and the JSON form hold the method, the
  path, the status, the `requestId`, and the `code` only (W-4, W-41); never a
  header, a request body, or the problem's `detail`. A `code` the kit does not
  know is kept as a string, for the status and `retryable` fallback (W-42).
- **Retry classes.** A request names its class: `never` (the launch-code redeem,
  W-1, W-2, and a round's cancel, W-25: no repeat at all), `refresh` (a lost
  response or a retryable problem is repeated with the same old token; the
  request must name the old token's local deadline, `localDeadlineMs`, as
  `notAfterMs`, the type and a runtime check refuse a refresh without it, and no
  repeat starts at or after it, W-6, W-7), or `idempotent` (a mutating call with
  its intent's idempotency key, or a read: a lost response or a retryable
  problem is repeated with the same bytes, W-16, W-42, W-43), or `start` (the
  start of a round, `startRound`: a lost response is repeated as for
  `idempotent`, but a problem only when its `code` is `UNAVAILABLE` and it is
  `retryable`. This is an allow-list: a start voided or refused before any money
  moved, `FUNDING_UNCONFIRMED`, `ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, or
  `ROUND_VOIDED`, and any code added later, is answered once whatever its
  `retryable`, since the Play API document says to retry such a start with a new
  key, which only the player's next start does, W-36). A problem that is not
  `retryable`, an aborted request, and `SESSION_EXPIRED`, `SESSION_REVOKED`, and
  `UNAUTHENTICATED` whatever their flag, are never repeated. The bound is a
  configuration value, checked when the transport is created (`maxAttempts` a
  safe integer of at least 1; both delays finite and non-negative, the initial
  one not above the maximum). Its defaults are provisional, since W-42 asks only
  for "a bounded number of times with backoff": 3 attempts in all, waiting 500
  ms, then doubling to at most 2 s (the polling rates of W-35), with no jitter.
- **Token schedule.** Pure functions over the deadline the response carries
  (W-5): the clock offset from the `Date` header, the refresh point (the earlier
  of the configured fraction of the lifetime and the margin before the deadline,
  defaults one third and 60 s, W-6), expiry, and a single-flight wrapper so at
  most one refresh is in flight. `tokenExpiresAt` and `sessionExpiresAt` are
  `date-time` (RFC 3339) in the document; the reader takes a full timestamp with
  seconds and a zone (`Z` or `+hh:mm`) and refuses one without a zone, since it
  would be read in the device's local time.
- **Idempotency keys** come from an injected random source (`randomUUID`) and
  must be UUIDs (W-36): 36 characters, inside the document's limit of 1 to 128.
  A key travels as the request body's `idempotencyKey`.
- **Provisional items.** The retry defaults above are one constant, replaced and
  its provisional note removed when a spec fixes them.
- **It emits nothing**: no log line, no metric, no event.
- **Tests** run against a fake `fetch`, a fake clock, and a fake abort signal
  (no network, no timer), with problem bodies typed against the contracts'
  `PlayProblem`. `play-client`'s tests are not a consumer of the `contracts`
  test-only entry, so they do not replay the `PlayProblem` vectors; the typed
  copies stand in for them. The operations' tests run against a fake Play API
  server built from the vendored document (see [Operations](#operations)).

## Operations

One function per operation of the vendored Play API document (`/play/v1`), named
by its `operationId`. Each takes the transport, the request body (when the
operation has one), and the call's options: the `Authorization` function (every
operation but the redeem, whose route has no `security`), and an optional abort
signal. The redeem and the refresh also take a `seal`, below. The wire types are
the document's generated types (`PlayApiOperations` in `contracts`), aliased by
name (`RedeemLaunchCodeRequest`, `RedeemLaunchCodeResponse`,
`RefreshPlayTokenResponse`, `StartRoundRequest`, `RoundActionRequest`); none is
written by hand. Each operation's method and path are checked at compile time
(`PLAY_ROUTES`) against the literal path and method `PlayApiOperationRoutes`
gives for its `operationId`: a route the document does not serve, at that
method, for that `operationId`, does not compile, even between two operations of
one shape (a move at the cash-out route), and a type test keeps it so.

| Function           | Route                    | Retry class  | Credential | Answers                                                                                 |
| ------------------ | ------------------------ | ------------ | ---------- | --------------------------------------------------------------------------------------- |
| `redeemLaunchCode` | `POST /sessions:redeem`  | `never`      | none       | `sessionId`, the sealed `playToken`, `tokenExpiresAt`, `sessionExpiresAt`, `gameOrigin` |
| `refreshPlayToken` | `POST /sessions:refresh` | `refresh`    | play token | the sealed `playToken`, `tokenExpiresAt`                                                |
| `startRound`       | `POST /rounds:start`     | `start`      | play token | the round's Snapshot, `unknown`                                                         |
| `continueRound`    | `POST /rounds:continue`  | `idempotent` | play token | the round's Snapshot, `unknown`                                                         |
| `cashOutRound`     | `POST /rounds:cashOut`   | `idempotent` | play token | the round's Snapshot, `unknown`                                                         |
| `cancelRound`      | `POST /rounds:cancel`    | `never`      | play token | the round's Snapshot, `unknown`                                                         |
| `getSnapshot`      | `GET /snapshot`          | `idempotent` | play token | the session's Snapshot, `unknown`                                                       |

- **Answers.** Each resolves with `{ body, receivedAtMs, clockOffsetMs }` (the
  last two for the token schedule, W-6). A Snapshot answer is the parsed body,
  unread and `unknown`: only the `snapshot` package's validator types it. The
  two token answers are read, since the shell needs their fields: a redeem
  answer must hold a `sessionId` (`ses_` and 32 lowercase hex digits), a
  non-empty `playToken`, both deadlines as RFC 3339 timestamps with a zone, and
  a `gameOrigin` of 1 to 267 characters (code points, as the document's
  `minLength` and `maxLength` count them; the document gives no pattern, so
  whether it is an origin, and an allowed one, is the shell's game bridge's
  check at mount, W-37); a refresh answer a non-empty `playToken` and
  `tokenExpiresAt`. Anything else is a `ProtocolError` whose message names the
  method, path, and status only. The answer is a new frozen object of exactly
  those fields: a field the document does not list is dropped, never passed on.
- **The token is sealed** (W-3, W-4; decided by human review, 2026-10-17). The
  redeem and the refresh take a `seal: (token: string) => T` from the caller,
  generic in `T`, and call it once with the new play token of a valid answer,
  before they return; the answer's `playToken` is the sealed `T`
  (`Sealed<RedeemLaunchCodeResponse, T>`,
  `Sealed<RefreshPlayTokenResponse, T>`), so no field of the result holds the
  plain token. `play-client` never returns, keeps, or logs the plain token; the
  seal is not called for an answer that does not match the document. The shell's
  seal is its redacting `sealSecret("play-token", token)`, which prints
  `[redacted]`; the shell is not wired to the operations yet.
- **Errors** are the request layer's: a `ProblemError` for every problem status
  the document lists (`400`, `401`, `404`, `409`, `422`, `500`, `503`, by
  operation), keeping a `code` the kit does not know; a `NetworkError` for a
  lost response, a timeout, or an abort; a `ProtocolError` for an error status
  without a problem body or a body that is not JSON. `UNAUTHENTICATED`,
  `SESSION_EXPIRED`, and `SESSION_REVOKED` end the session and are never
  repeated (W-7).
- **The redeem is never repeated** (W-1, W-2), whatever the failure: a lost
  response or a retryable problem means a new launch. The document's 503 to a
  redeem carries `retryable: false`.
- **The refresh** names the presented token's local deadline as `notAfterMs`
  (W-7) and sends no body.
- **Start, move, and cash-out** carry the intent's `idempotencyKey` in their
  body (W-16); a repeat sends the same bytes. `continueRound` and `cashOutRound`
  pass the signed action through as the shell built it (`typedData` in base64,
  `signature`). `play-client` does not read `typedData`, so it cannot tell one
  signed action from another: the shell guarantees that `continueRound` carries
  only a `PlayerAction` and `cashOutRound` only a `PlayerCashOut`, never a
  `PlayerCancel` (W-23, W-25).
- **The cancel is never repeated** (W-25). `cancelRound` takes the body of a
  move (`RoundActionRequest`), carrying the signed `PlayerCancel` the shell
  built, and is sent once whatever the failure. The document does not answer a
  cancel from a log as it does a repeated move: once the engine took a cancel,
  the same cancel again is `FAILED_PRECONDITION`. So a lost response, a timeout,
  or a `503 UNAVAILABLE` (even `retryable: true`) is surfaced to the caller as a
  `NetworkError` or a `ProblemError`, and the caller reads `getSnapshot` before
  it sends the cancel again. Its answer is the round's Snapshot, `unknown`:
  `canceled` (final), `resolving` while the engine has not answered the cancel
  yet, or `active` with a move played when a move won the race; `play-client`
  does not tell them apart. A cancel of a round that is not `active`, one still
  `resolving` included, is a `422 FAILED_PRECONDITION`, surfaced as a
  `ProblemError` like any other. The document lists no `409` for it.
- **No secret leaves the body or the header.** The launch code travels only in
  the redeem body, the play token only in the `Authorization` header; neither is
  in a URL, and an error never holds a header or a body (W-4).
- **Tests** run against a fake Play API server built from the vendored document:
  its routes are `PLAY_ROUTES`; a scripted answer is typed by the operation's
  own responses in `PlayApiOperations` (a status the operation does not list, or
  a body of another shape, does not compile); it refuses a call without the play
  token in the `Bearer` form on every route but the redeem (`UNAUTHENTICATED`),
  decodes request bodies strictly as the document does (an unknown or missing
  field, or a body where the operation takes none, is `INVALID_ARGUMENT`; field
  values are not checked against their patterns), and answers a path the
  document does not have with `NOT_FOUND`. They cover each operation's request
  and answer, each problem status the document lists for it, an unknown problem
  `code`, the session-ending codes, a lost response, a timeout, an abort by the
  caller, a body that is not JSON, an answer that does not match the document,
  that a repeat resends the same bytes, that the redeem and the cancel are never
  repeated (a lost response, a retryable `UNAVAILABLE`, an unknown retryable
  `code`), that a start answered with `FUNDING_UNCONFIRMED`,
  `ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, or `ROUND_VOIDED` marked
  `retryable: true` is sent once while `UNAVAILABLE` and a lost response are
  repeated, that neither the token nor the launch code reaches a URL or an
  error, that a sealed result printed as JSON holds no token and its type has no
  plain string field for it, that the seal is called once per answer (a refresh
  resent after a lost response too) and never for an answer that does not match
  the document, and that the case table's problem statuses equal the document's
  for each operation (a type test).
