# `@intraverse/se-client-play-client`

A typed `fetch` client for the SuperEngine Play API (`/play/v1`) and the verify
read the Wrapper needs.

**Status:** pre-release. Not published to npm yet. Today the package holds the
request layer: the request options, the timeout, the typed errors, problem
mapping, bounded retries, idempotency keys, and the play token's refresh
schedule. The Play API operations (redeem, refresh, start, continue, cash-out,
the Snapshot read) are specified, not implemented yet: they join when the Play
API document is part of `@intraverse/se-client-contracts`.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-play-client
```

## When to use it

You call the Play API from a browser or Node and want typed requests and
responses.

Do not use it for: interpreting a Snapshot: the client returns every response
body as `unknown`, and only `@intraverse/se-client-snapshot` can turn it into a
typed value. Do not use it to keep a credential: the client reads the
`Authorization` value from a function you pass for each request and stores
nothing.

## Example

```ts
import {
  ProblemError,
  bearerAuthorization,
  createTransport,
  endsSession,
} from "@intraverse/se-client-play-client";

const transport = createTransport({
  baseUrl: config.playApiBaseUrl,
  fetch: (url, init) => globalThis.fetch(url, init),
  clock: {
    now: () => Date.now(),
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: handle => globalThis.clearTimeout(handle as number),
  },
});

try {
  const response = await transport.send({
    method: "GET",
    path: snapshotPath,
    authorization: () => bearerAuthorization(currentToken()),
    retry: "idempotent",
  });
  handle(response.body); // unknown: validate it before use
} catch (error) {
  if (error instanceof ProblemError && endsSession(error.problem)) {
    endTheSession();
  }
}
```

## Entry points

- `@intraverse/se-client-play-client`: the only entry.
  - `createTransport` takes an `https:` base (plain `http:` only on a loopback
    host) and sends one request with `credentials: "omit"`, `cache: "no-store"`,
    `referrerPolicy: "no-referrer"`, and `redirect: "error"`. It times the
    request out (`DEFAULT_REQUEST_TIMEOUT_MS`, 15 s), stops it when the
    request's `signal` aborts, and repeats it by its retry class: `never` (a
    launch-code redeem), `refresh` (which must name the old token's deadline as
    `notAfterMs`), or `idempotent`. Only a lost response or a problem whose
    `retryable` is `true` is repeated, with the same bytes, a bounded number of
    times with backoff (`DEFAULT_RETRY_CONFIG`, provisional).
  - `bearerAuthorization` builds the `Authorization` value from a token
    (provisional form: `Bearer <token>`).
  - `NetworkError` (no response: `timeout`, `network`, or `aborted`; a refused
    redirect is a `network` failure), `ProblemError` (a Play API problem, with
    `code`, `retryable`, `status`, and `requestId`), and `ProtocolError` (a
    response that is neither, a 3xx included).
  - `readProblem` reads those fields from a problem body; `endsSession` and
    `SESSION_ENDING_CODES` tell the codes that end the session.
  - `isRepeatable` and `backoffDelayMs` are the retry rule and the wait between
    attempts.
  - `refreshAtMs`, `localDeadlineMs`, `isExpired`, `clockOffsetMs`, and
    `singleFlight` compute the token's refresh point and local deadline from the
    deadline the server sent, corrected by the clock offset of the `Date`
    header, and keep one refresh in flight (`DEFAULT_REFRESH_CONFIG`, with
    `DEFAULT_REFRESH_FRACTION` one third and `DEFAULT_REFRESH_MARGIN_MS` 60 s).
  - `parseDeadline` reads a full RFC 3339 timestamp with a zone, and refuses one
    without.
  - `newIntent` draws an idempotency key from a random source you pass.
  - Types: `Authorization`, `CancelSignal`, `Clock`, `FetchLike` and the other
    platform shapes, `HttpMethod`, `Intent`, `NetworkFailure`,
    `PlayClientError`, `PlayRequest`, `PlayResponse`, `ProblemSummary`,
    `RandomUuid`, `RefreshConfig`, `RequestDescription`, `RetryClass`,
    `RetryConfig`, `TokenDeadline`, `Transport`, `TransportOptions`.

## Guarantees and constraints

- It uses the platform `fetch` (or one you pass) and has no runtime dependency
  besides the kit's contracts.
- Its problem types come from `@intraverse/se-client-contracts`.
- It never interprets the bodies it returns.
- An error carries the method, the path, the status, and the `requestId` of a
  request, never its headers or its body. No query string or fragment is sent,
  and a secret must never be placed in a path: error messages carry the path.
- A redirect is never followed, so the token is never sent on to another URL.
- Amounts are strings or `bigint`, never `number`; the client sends JSON as
  given and never touches an amount.

## More

- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/packages.md)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
