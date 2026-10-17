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
  elsewhere, named here only) places the launch code in the fragment, in the
  form the operator launch already uses (decided by human review, 2026-10-17):
  `launchUrl` is the play launch URL, then `#`, then the launch code, so the
  code is the **whole fragment**, with no parameter name (for example
  `https://play.example/l#lc_…`). A code starts with `lc_` today (the Play API
  document gives `lc_` and 43 base64url characters), and the redeem accepts 1 to
  128 characters. The Wrapper checks the length only, never the prefix, which
  the backend may change (decided by human review, 2026-10-17): it measures the
  raw `location.hash` without its `#`, with no decoding, and an empty value or
  one of more than 128 characters is no code (W-1a). It is single use, with a
  short expiry the backend sets; the Wrapper does not rely on its length. The
  Wrapper reads the fragment without its `#`, strips it with
  `history.replaceState`, and sends it as `launchCode` to the Play API's
  `POST /play/v1/sessions:redeem` (W-2). The operator launch serves the Play API
  on the Wrapper's own origin; the Wrapper does not enforce that, and
  `playApiBaseUrl` stays a configured `https:` base (W-3).
- **W-1a.** **No launch code.** When the fragment holds no launch code (it is
  absent or empty, more than 128 characters of the raw `location.hash` without
  its `#`, or the code was placed only in the query string), the Wrapper MUST
  NOT call the redeem call and MUST sign nothing. It shows the
  [session-ended state](../wrapper.md#error-and-degraded-states) with the
  instruction to relaunch from the operator, the same state W-2 shows for a
  rejected code.
- **W-2.** The Wrapper MUST redeem the code once, with the Play API's redeem
  call, and MUST NOT retry a redeem whose response was lost: a code cannot be
  redeemed twice, so the player needs a new launch. It shows the
  [session-ended state](../wrapper.md#error-and-degraded-states) with the
  instruction to relaunch from the operator. A rejected code is the same for an
  unknown, used, or expired one; the Wrapper cannot tell them apart and does not
  try. The redeem call is the Play API's `POST /play/v1/sessions:redeem`
  (`redeemLaunchCode`), with the code in the body (`launchCode`) and no
  credential; it answers the session id (`sessionId`), the first play token
  (`playToken`), its deadline (`tokenExpiresAt`), and the session's hard end
  (`sessionExpiresAt`, which no token outlives), both RFC 3339 `date-time`. A
  rejected code is a `401` (`UNAUTHENTICATED`); a `503` to a redeem carries
  `retryable: false`, and is not repeated either.
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
  other base is refused before a request is made. The header is
  `Authorization: Bearer <playToken>`, the Play API's `playToken` bearer scheme,
  on every call but the redeem.
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

**How it is built (2026-10-17).** Before the session opens, a framed Wrapper
applies W-49's fail-closed minimum
([Operator embedding](../wrapper.md#operator-embedding)): framed by a page it
cannot show is on `operatorOrigins`, it redeems nothing (the code is never sent)
and shows the configuration-error state. This is the minimum until RFC-001, the
operator launch contract, is accepted and built. The Wrapper's entry calls the
shell's `takeLaunchCode` first, before it fetches the environment configuration
document, so the fragment is gone before any request or log line (W-1). The code
stays sealed (it prints `[redacted]`) and only the shell's `openPlaySession`
reveals it, for the one redeem, then forgets it. When the Wrapper opens no
session with it (its configuration or its framing was refused), it discards the
code (the shell's `discardLaunchCode`), so the code is forgotten then too. A
`replaceState` that throws leaves the code unread (no redeem). The session holds
the play token in the shell (`token-keeper.ts`): the refresh point is
play-client's `refreshAtMs` over `tokenExpiresAt` and the redeem's `Date`
offset, at most one refresh is in flight, the new token replaces the old one
only once its answer arrived, a retryable failure is tried again after
play-client's backoff while the old token is valid, a refusal that does not end
the session leaves the old token in use until its deadline, and the deadline or
a session-ending answer to any call ends the session (the key is destroyed, the
token forgotten, and the Wrapper shows the session-ended state). The refresh is
the only call made without the player or a poll (W-8). The session uses a wall
clock (milliseconds since the epoch), since every deadline is a timestamp. A tab
that does not get the signer lock forgets the token and opens nothing (W-14); a
browser without Web Locks shows its own state, "this browser cannot keep your
session safe", and signs nothing.
