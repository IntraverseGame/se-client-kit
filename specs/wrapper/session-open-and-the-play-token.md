# Session open and the play token

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

The lifetimes of a launch code, a play token, and a session, and its idle
timeout, are the backend's configuration. The Wrapper reads every deadline from
the responses and hard-codes none, and its tests take such values from fixtures,
not from numbers written in the test. The numbers that appear below for polling,
timeouts, and retries are the **Wrapper's own configuration**, with the stated
defaults.

- **W-1.** On load the Wrapper MUST read the launch code **only from the URL
  fragment**, exactly once, and MUST remove it from the URL
  (`history.replaceState`) before any network call or log line. A launch code is
  a secret: single use and short lived. The fragment is the one place no server
  and no `Referer` header sees; a code in the query string would reach the
  server in the first document request. So the Wrapper never reads a code from
  the query string, never forwards it (in a request, a log line, a message, or
  the DOM), and never stores it: it ignores the query string and treats the
  launch as having no code (W-1a). The operator launch contract (owned
  elsewhere, named here only) must therefore place the launch code in the
  fragment.
  <!-- TODO(Play API): the parameter name and the exact fragment format come from the operator launch contract. Only the placement (the fragment) is decided here. -->
- **W-1a.** **No launch code.** When the fragment holds no launch code (it is
  absent or empty, or the code was placed only in the query string), the Wrapper
  MUST NOT call the redeem call and MUST sign nothing. It shows the
  [session-ended state](../wrapper.md#error-and-degraded-states) with the
  instruction to relaunch from the operator, the same state W-2 shows for a
  rejected code.
- **W-2.** The Wrapper MUST redeem the code once, with the Play API's redeem
  call, and MUST NOT retry a redeem whose response was lost: a code cannot be
  redeemed twice, so the player needs a new launch. It shows the
  [session-ended state](../wrapper.md#error-and-degraded-states) with the
  instruction to relaunch from the operator. A rejected code is the same for an
  unknown, used, or expired one; the Wrapper cannot tell them apart and does not
  try.
  <!-- TODO(Play API): the redeem call and its response shape (session id, play token, `tokenExpiresAt`, `sessionExpiresAt`). -->
- **W-3.** The play token MUST live only in a JavaScript variable inside the
  shell, for the lifetime of the page. It MUST NOT be written to any storage
  (`localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, the
  history state), to a URL, to a log, to an error message, to the DOM, or to a
  `postMessage`. It is sent only in the `Authorization` request header of Play
  API calls, with `credentials: "omit"`, `cache: "no-store"`,
  `referrerPolicy: "no-referrer"`, and `redirect: "error"` (a redirect is never
  followed, so the token is never sent on to another URL; it surfaces as a
  network failure). The Play API base MUST be an `https:` URL; `http:` is
  allowed only on a loopback host (`localhost`, `127.0.0.1`, `[::1]`), and any
  other base is refused before a request is made.
  <!-- TODO(Play API): confirm the bearer header form of the play token. -->
- **W-4.** Every type that holds a token, a launch code, or the key MUST print
  `[redacted]` under `String()`, `JSON.stringify`, template literals, and the
  runtime's inspect hook. A thrown error and a log line MUST carry the method,
  path, status, and `requestId` of a request, never its headers or body.
- **W-5.** The Wrapper MUST read the token's deadline from the response
  (`tokenExpiresAt`), not from a constant: the lifetime is the backend's
  configuration and can differ per deployment.
- **W-6.** The Wrapper MUST refresh the token before it expires: when the
  remaining time falls to a configured fraction of the token's lifetime (default
  one third), and at least a configured margin (default 60 s) before the
  deadline, whichever is earlier (Wrapper configuration). The deadline is
  corrected by the clock offset measured from the HTTP `Date` header of the
  redeem response. At most one refresh is in flight. The new token replaces the
  old one only after its response arrived; until then the old token stays in
  use. A refresh whose response was lost MAY be repeated with the same old
  token: the presented token keeps its own expiry. The **shell** holds the token
  and runs this refresh loop; the `play-client` package only provides the pieces
  (the request layer, the refresh-point and clock-offset functions, single
  flight, the retry classes) and never holds a token
  ([client-kit.md](../client-kit/the-play-client-request-layer.md)).
- **W-7.** A refresh failing with a retryable problem MUST be retried with
  bounded backoff while the old token is valid. A refresh answered
  `SESSION_EXPIRED`, `SESSION_REVOKED`, or `UNAUTHENTICATED`, or a token that
  reached its deadline, ends the session: the Wrapper stops signing, discards
  the key and the token, and shows the session-ended state. A token that expired
  cannot be refreshed.
- **W-8.** A token refresh and a Snapshot read do not count as player activity
  on the backend. The Wrapper MUST NOT send calls only to keep a session alive:
  a tab left open expires by the backend's idle timeout, and the Wrapper shows
  the session-ended state when it learns that.
