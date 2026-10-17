# `@intraverse/se-client-shell`

The headless part of the SuperEngine Wrapper: session and play-token lifecycle,
custody of the player's action key, the transcript, and the boundary to the
game.

**Status:** pre-release. Not published to npm yet. Today the public entry holds
the redacting logger, the package's error type, the validation of the chain part
of the environment configuration, and the game bridge with the `se.controller/1`
message types. Key custody, the signer lock, the transcript state, the chain tip
check, and the round's `CreateRoundAuth` and `T_0` checks are built and tested
inside the package, but are not exposed: they are reached through the use cases
(`start`, `pick`, `cashOut`), which are specified, not implemented yet.

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

Mounting the game bridge:

```ts
import { createControllerBridge } from "@intraverse/se-client-shell";

const frame = iframe.contentWindow;
if (frame === null) throw new Error("the game frame is not attached");

const result = createControllerBridge({
  gameOrigin, // D, from the game's catalog entry (Play API)
  gameOrigins: config.gameOrigins,
  ownOrigin: globalThis.location.origin,
  frame,
  listen: handler => {
    globalThis.addEventListener("message", handler);
    return () => globalThis.removeEventListener("message", handler);
  },
  pick: pickUseCase, // resolves { accepted: true } or { accepted: false, reason }
  onIncompatible: () => showError("game not compatible"),
});
if (!result.ok) {
  showError("the game cannot be mounted"); // result.refusal says why
} else {
  result.bridge.sendSnapshot(validatedSnapshot);
}
```

Reading the session's Snapshot for the UI. The composition root that owns the
session builds the reader and hands the UI only the reader object, never the
transport or the `Authorization`:

```ts
// The Wrapper's composition root: it owns the session and its play token.
import {
  createSnapshotReader,
  type SnapshotReader,
} from "@intraverse/se-client-shell";

const reader: SnapshotReader = createSnapshotReader({
  transport, // the Play API transport the root created
  authorization, // reads the sealed play token, per attempt
});
mountUi({ snapshots: reader }); // the UI gets `read` and `latest`, nothing else

// In the UI:
const read = await snapshots.read();
if (read.kind === "snapshot") render(read.snapshot); // validated
else if (read.kind === "problem") showProblem(read.problem); // validated
else if (read.kind === "network") showConnectionProblem();
else showGenericError(); // rejected: not rendered
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
  - `createControllerBridge(options)` mounts the boundary to the game iframe
    (`se.controller/1`). It refuses a game origin that is not on the
    configuration's allow-list, is the Wrapper's own origin, or is not a
    serialized origin. It accepts a message only from the frame's window and the
    game origin, parses it against the closed message set (`hello`, `action`
    with the `pick` verb), and ignores anything else. It sends the game nothing
    before its `hello`, then the allow-listed copy of each validated Snapshot
    (no proofs, session id, links, or amounts) and `reject` messages
    (`not_legal`, `not_active`, `busy`, `invalid`), always with the game origin
    as `targetOrigin`. A pick that passes its early pre-check goes to the pick
    use case you pass, which is the gate: it must re-check the pick against the
    shell's own latest Snapshot and refuse a step it already signed. The bridge
    never holds a key, a token, or a signed action. `CONTROLLER_SCHEMA`,
    `ROUND_STATUSES`, and the message types (`HelloMessage`, `ActionMessage`,
    `SnapshotMessage`, `RejectMessage`, `GameSnapshot`, `GameStep`, `Pick`,
    `RejectReason`, and the unions) describe the protocol.
  - `createSnapshotReader({ transport, authorization })` gives the UI read-only
    Snapshot reads: `read()` calls the Play API's `getSnapshot` and resolves
    with `snapshot` (it passed the Snapshot validator), `problem` (a typed Play
    API error that passed validation), `rejected` (anything that did not), or
    `network` (no response); `latest()` is the last validated Snapshot.
    `SnapshotRead`, `SnapshotReader`, and `SnapshotReaderOptions` type it, and
    `ValidSnapshot` and `ValidPlayProblem` are re-exported from
    `@intraverse/se-client-snapshot`. It returns data only: no key, no token, no
    signing capability. Only the shell or the Wrapper's composition root, which
    owns the session, builds one; the UI receives the reader object, never its
    options.
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
  before it is sent, and a resend sends the same bytes. A move is checked
  against the shell's own latest validated Snapshot and a step is signed at most
  once; after a refused move the shell reads the Snapshot and continues only
  when it shows its own move applied. A round signs at most one cancel.
- Nothing is written to `localStorage`, `sessionStorage`, IndexedDB, cookies, or
  a URL.
- The game is untrusted: it gets only the allow-listed fields of a validated
  Snapshot and the closed `reject` reasons, never a key, a token, a signature,
  or a proof, and every message to it names its origin, never `*`.
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
- [The game iframe and the controller boundary](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  in the Wrapper specification
- [The action key and what may be stored](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-action-key-and-what-may-be-stored.md)
  and
  [The Wrapper specification](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md)
- [Packages](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/packages.md)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
