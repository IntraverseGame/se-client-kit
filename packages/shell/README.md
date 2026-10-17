# `@intraverse/se-client-shell`

The headless part of the SuperEngine Wrapper: session and play-token lifecycle,
custody of the player's action key, the transcript, and the boundary to the
game.

**Status:** pre-release. Not published to npm yet. Today the public entry holds
the redacting logger, the package's error type, and the validation of the chain
part of the environment configuration. Key custody, the signer lock, the
transcript state, the chain tip check, and the round's `CreateRoundAuth` and
`T_0` checks are built and tested inside the package, but are not exposed: they
are reached through the use cases (`start`, `pick`, `cashOut`), which are
specified, not implemented yet, together with the game bridge.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-shell
```

## When to use it

You are building a Wrapper or another front end for SuperEngine and want the
logic that holds the player's key and signs every action, without a UI. Most
integrators use the Wrapper itself rather than this package.

Do not use it for: writing a game (games talk to the Wrapper through the
controller protocol `se.controller/1`) or any code that should not hold a key.

## Example

```ts
import { createLogger } from "@intraverse/se-client-shell";

const logger = createLogger(record => {
  globalThis.console.warn(record);
});

try {
  run();
} catch (error) {
  // Only the error's name and its `code` reach the line.
  logger.error("wrapper.failed", { cause: error });
}
```

Validating the environment configuration at boot:

```ts
import { validateChainConfig } from "@intraverse/se-client-shell";

const result = validateChainConfig(JSON.parse(documentText));
if (!result.ok) {
  // Each issue is a code and a field name, never a value.
  showConfigurationError(result.issues);
} else if (result.config.degraded) {
  showIndicator("chain check not independent (development)");
}
```

## Entry points

- `@intraverse/se-client-shell`: the only entry.
  - `createLogger(sink)` returns a logger with `warn` and `error` only. A line
    is a fixed event name and the request fields `method`, `path`, `status`,
    `requestId`, and `code`, plus a `cause` reduced to its `name` and `code`.
    Any other field is dropped. A sealed secret, or a value that is not of its
    field's shape (free text, a path with a query string), is printed as
    `[redacted]`. The logger cannot recognize a secret given as plain text in a
    well-formed field: the protection is that only the shell supplies the
    fields, and it never passes secret text. The sink gets a frozen plain
    record; a sink that throws is ignored.
  - `REDACTED` is the text every redacting value prints: `[redacted]`.
  - `validateChainConfig(document)` reads the chain part of the parsed
    environment configuration: `environment`, `runtimeSigner`, `registryDomain`
    (`chainId`, `verifyingContract`), `rpcEndpoints` (per entropy source,
    `{ provider, url }` entries), `entropyChainId` (per source, required: the
    chain the source's blocks are on), `minRpcQuorum` (default 2,
    `DEFAULT_MIN_RPC_QUORUM`), and `tipLagMargin` (per source, required). It
    returns the configuration typed and frozen, or every issue found. It refuses
    `production` with `minRpcQuorum` below 2, two endpoints of one source that
    share a provider or a URL, and a source with fewer endpoints than
    `minRpcQuorum`. `local` and `preview` may set `minRpcQuorum` to 1; the
    configuration is then `degraded`. The pinned signer, registry domain, and
    entropy chain ids are the only trust anchor of the chain checks.
  - `RpcTransport`, `RpcCall`, and `BlockTag` type the RPC transport the Wrapper
    supplies: one JSON-RPC 2.0 call (`eth_chainId` or `eth_getBlockByNumber`) to
    one endpoint, resolving with the response's `result`. The optional third
    argument is an abort signal (`play-client`'s `CancelSignal`, which the
    platform `AbortSignal` satisfies) that the shell aborts when the call times
    out; a transport may ignore it, and a late answer is ignored.
  - `ShellError` is the error the package throws, with a stable `code`
    (`ShellErrorCode`) and a fixed message per code that never carries an input
    value.

## Guarantees and constraints

- This is the only code in the kit that holds the player's action key and play
  token. The UI receives use cases and read-only state, never a secret.
- The action key is generated inside the package, on first need, from the
  platform's cryptographic random source, and stays in a closure: nothing
  returns, prints, or stores it. Every value that holds a secret prints
  `[redacted]` under `String()`, `JSON.stringify`, template literals, and the
  Node inspect hook.
- The key is used only while the page holds the session's Web Lock; without the
  Web Locks API it signs nothing. A round never gets two different signed
  actions at one sequence, a signed action is kept with its idempotency key
  before it is sent, and a resend sends the same bytes.
- Nothing is written to `localStorage`, `sessionStorage`, IndexedDB, cookies, or
  a URL.
- It depends on `@intraverse/se-client-signing`,
  `@intraverse/se-client-snapshot`, and `@intraverse/se-client-play-client`.
- Amounts and block numbers are strings or `bigint`, never `number`.
- The chain check asks every configured endpoint, needs `minRpcQuorum` of them
  to answer, all of them to report the source's pinned chain id, and all of them
  to agree, and never drops an outlier.
- A round's `CreateRoundAuth` is trusted only when its domain, signer, and
  entropy chain id equal the pinned configuration, its fields match the round
  and what the shell sent, and its signature recovers to the pinned signer;
  `T_0` is recomputed and must equal the Snapshot's `readyHash`. Until every
  check passes, nothing is signed for the round.

## More

- [The `shell` package](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/the-shell-package.md)
  in the kit specification, including what is provisional
- [The action key and what may be stored](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-action-key-and-what-may-be-stored.md)
  and
  [The Wrapper specification](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md)
- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/packages.md)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
