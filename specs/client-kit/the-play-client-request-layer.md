# The `play-client` request layer

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`play-client` is built in two layers: a hand-written request layer, and one
function per Play API operation on top of it, typed from the Play API document's
generated types. The request layer exists today; the operations wait for the
document (the `TODO(Play API document)` marker in
[The `contracts` package](./the-contracts-package.md)). The request layer holds
these rules (the Wrapper requirements it serves are in brackets):

- **No credential is kept.** The shell holds the play token and runs the refresh
  loop (W-3, W-6, W-7); `play-client` provides the pieces it uses (the request
  layer, the refresh schedule, single flight, the retry classes) and never holds
  a token or schedules a refresh itself. A request takes its `Authorization`
  value from a function the shell passes, read once per attempt and never
  stored. The header form is one function, `bearerAuthorization`, provisional
  until the Play API confirms it (W-3).
- **The base.** The Play API base must be an `https:` URL; `http:` is allowed
  only on a loopback host (`localhost`, `127.0.0.1`, `[::1]`), for local
  development. Any other base, and a base with credentials, a query string, or a
  fragment, is refused when the transport is created (W-3).
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
- **Retry classes.** A request names its class: `never` (the launch-code redeem:
  no repeat at all, W-1, W-2), `refresh` (a lost response or a retryable problem
  is repeated with the same old token; the request must name the old token's
  local deadline, `localDeadlineMs`, as `notAfterMs`, the type and a runtime
  check refuse a refresh without it, and no repeat starts at or after it, W-6,
  W-7), or `idempotent` (a mutating call with its intent's idempotency key, or a
  read: a lost response or a retryable problem is repeated with the same bytes,
  W-16, W-42, W-43). A problem that is not `retryable`, an aborted request, and
  `SESSION_EXPIRED`, `SESSION_REVOKED`, and `UNAUTHENTICATED` whatever their
  flag, are never repeated. The bound is a configuration value, checked when the
  transport is created (`maxAttempts` a safe integer of at least 1; both delays
  finite and non-negative, the initial one not above the maximum). Its defaults
  are provisional, since W-42 asks only for "a bounded number of times with
  backoff": 3 attempts in all, waiting 500 ms, then doubling to at most 2 s (the
  polling rates of W-35), with no jitter.
- **Token schedule.** Pure functions over the deadline the response carries
  (W-5): the clock offset from the `Date` header, the refresh point (the earlier
  of the configured fraction of the lifetime and the margin before the deadline,
  defaults one third and 60 s, W-6), expiry, and a single-flight wrapper so at
  most one refresh is in flight. Reading `tokenExpiresAt` assumes a full RFC
  3339 timestamp with seconds and a zone (`Z` or `+hh:mm`); one without a zone
  is refused, since it would be read in the device's local time. This is
  provisional until the Play API document fixes the format.
- **Idempotency keys** come from an injected random source (`randomUUID`) and
  must be UUIDs, provisional until the Play API document fixes their limits
  (W-36).
- **Provisional items.** The bearer form, the `tokenExpiresAt` format, the
  idempotency key's form, and the retry defaults above are each one function or
  constant. Each is replaced, and its provisional note removed, as the matching
  Play API item of the open contract items closes.
- **It emits nothing**: no log line, no metric, no event.
- **Tests** run against a fake `fetch`, a fake clock, and a fake abort signal
  (no network, no timer), with problem bodies typed against the contracts'
  `PlayProblem`. `play-client`'s tests are not a consumer of the `contracts`
  test-only entry, so they do not replay the `PlayProblem` vectors; the typed
  copies stand in for them. The fake is rebuilt from the Play API document when
  it is vendored, and the operations are added then; until then the request
  layer is delivered on its own, as part of the client's issue, which stays open
  for the operations.
  <!-- TODO(Play API document): the operations (redeem, refresh, start, continue, cash-out, cancel, the Snapshot read), their paths and wire types, and a fake Play API built from the document. -->
