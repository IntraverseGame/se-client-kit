# The `shell` package

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`shell` is built in slices. Two exist today: the redacting types and logger, key
custody, the signer lock, and the transcript state (W-4, W-9 to W-19, W-41 as
far as the shell is concerned); then the chain configuration, the tip check, and
the decision it leads to (W-26a, W-26b, and W-26's pass or fail). The
`CreateRoundAuth` and `T_0` checks (W-26 items 1 to 5), the `se.controller/1`
bridge (W-37, W-38), and the session, start, move, and cash-out flows follow;
the flows wait for the Play API operations. The Wrapper requirements each rule
serves are in brackets.

- **Public API.** The redacting logger (`createLogger` and its types),
  `REDACTED`, `ShellError` with its `ShellErrorCode`, the chain configuration's
  validation (`validateChainConfig`, `DEFAULT_MIN_RPC_QUORUM`, and the types
  `ChainConfig`, `ChainConfigResult`, `ChainConfigIssue`,
  `ChainConfigIssueCode`, `Environment`, `SourceConfig`, `RpcEndpoint`), and the
  RPC transport types (`RpcTransport`, `RpcCall`, `BlockTag`). The validation is
  public because the Wrapper applies W-26a's boot rule before it starts; the
  transport types because the Wrapper supplies the transport (it owns `fetch`
  and the Content Security Policy). Key custody, the signer lock, the transcript
  state, the tip check, and its decision are internal: the UI is meant to get
  use cases and read-only state, never a signing capability
  ([Packages](./packages.md)), and those use cases do not exist yet.
- **Redacting types (W-4).** Everything that holds a secret, or a closure over
  the key, prints `[redacted]` under `String()`, `JSON.stringify`, template
  literals, `Symbol.toPrimitive`, and Node's inspect hook
  (`Symbol.for("nodejs.util.inspect.custom")`). The four hooks sit on a shared,
  frozen prototype, so the object has no own property a walk or a
  `structuredClone` could copy. A play token or launch code is a sealed `Secret`
  whose text is kept in a module-private `WeakMap`: only the shell's own
  `revealSecret` reads it, and `disposeSecret` forgets it. The key is never
  text: it stays in the closure of the `signing` signer the session holds.
- **The logger (W-4, W-41, the Wrapper's Observability).** `createLogger(sink)`
  has `warn` and `error` only (the Wrapper's console shows `warn` and above). A
  line is a fixed event name and a closed set of fields: `method`, `path`,
  `status`, `requestId`, `code`, and a `cause`, of which only the `name` and a
  string `code` are kept (never a message or a stack). Every value is checked at
  run time: an event that is not a fixed lowercase name, a method that is not
  capital letters, a path that is not absolute or holds a space, `?`, or `#`, a
  status that is not an integer from 100 to 599, and a `requestId`, `code`, or
  name that is not a short token print as `[redacted]`; any other field is
  dropped. A sealed secret prints as `[redacted]`, but a secret given as plain
  text in a well-formed field cannot be recognized: the protection is that only
  the shell supplies the fields and it never passes secret text. The sink
  receives a frozen plain record; a sink that throws is ignored. The shell
  itself logs nothing yet.
- **Errors.** `ShellError` has a stable `code` (`lock-not-held`,
  `session-ended`, `invalid-input`, `key-generation`, `round-exists`,
  `equivocation`, `round-stopped`, `cancel-unavailable`) and a fixed message per
  code that never carries an input value (W-41).
- **The chain configuration (W-26a, W-26b, the Wrapper's Configuration).**
  `validateChainConfig(document)` reads the chain part of the parsed environment
  configuration document and returns `{ ok: true, config }` (typed, deeply
  frozen) or `{ ok: false, issues }`, each issue a `code` and a dotted `field`,
  never a value. It reads `environment` (`production`, `preview`, or `local`),
  `runtimeSigner` (a non-zero address), `registryDomain` (`chainId`, a positive
  integer, and `verifyingContract`, a non-zero address), `rpcEndpoints` (per
  entropy source, named as the Snapshot's `proofs.randomnessProof.source`, a
  non-empty list of `{ provider, url }`: the provider a short token, the URL
  `https:`, or `http:` on a loopback host only, with no credentials, query
  string, or fragment), `entropyChainId` (per source, the chain id the source's
  blocks are on, an integer of at least 1 and at most 2^53 - 1, required for
  each source and only for those), `minRpcQuorum` (an integer of at least 1,
  default 2), and `tipLagMargin` (per source, a non-negative integer of blocks,
  required for each source and only for those). Other fields are the Wrapper's
  and are ignored. Addresses are kept lowercase (their case is not checked
  against EIP-55); block counts and chain ids become `bigint`. It refuses
  (`code`): `production-quorum`, the boot rule, `production` with `minRpcQuorum`
  below 2; `shared-provider`, two endpoints of one source with one provider
  (names compared without case) or one URL (one provider may serve two sources);
  `quorum-unreachable`, a source with fewer endpoints than `minRpcQuorum`; and
  `invalid-environment`, `invalid-signer`, `invalid-domain`, `invalid-quorum`,
  `invalid-endpoints`, `invalid-entropy-chain-id`, and `invalid-lag-margin` for
  a missing or malformed field. `local` and `preview` may set `minRpcQuorum` to
  1: the config is then `degraded`, the Wrapper shows the "chain check not
  independent (development)" indicator, and every tip check records
  `tipCheck: "degraded"`. The Wrapper refuses to start on any issue. This
  configuration is the only trust anchor of the chain checks: the signer
  address, the registry domain, and each entropy source's chain id are pinned
  per environment, and a Snapshot's or a response's copy of them is compared
  with it, never used in its place.
- **The tip check (W-26b, W-26a).** It runs over the endpoints the configuration
  lists for the round's source, through an injected `RpcTransport`
  (`(endpoint, call, signal?) => Promise<result>`: it sends one JSON-RPC 2.0
  request and resolves with its `result`, or rejects). There are no provider
  names or URLs in the code. It makes two rounds of calls, each in parallel:
  `eth_chainId` with `[]` and `eth_getBlockByNumber` with `["finalized", false]`
  to every endpoint, then `eth_getBlockByNumber` with `[h_low, false]` (`h_low`
  as a JSON-RPC quantity) to each endpoint that gave a final block. Each call
  times out on the injected clock (default 15 s, W-43) and has its own abort
  signal (from the platform `AbortController`; typed as `play-client`'s
  `CancelSignal`, since the kit compiles without the DOM library), aborted when
  that call times out and never otherwise; where the platform has no
  `AbortController` the signal is absent. A transport may ignore it, and a late
  answer is ignored. A rejection, a timeout, a transport that throws, and a
  `result` that is not a chain id (a canonical lowercase quantity of at most 64
  bits) or a block (an object whose `number` is such a quantity and whose `hash`
  is 32 bytes of hex) are no answer; a hash is kept lowercase. `h_top` and
  `h_low` are the maximum and minimum final block of the endpoints that answered
  (gave a final block). The check passes only if no endpoint reported another
  chain id than the source's configured one (answering or not), at least
  `minRpcQuorum` answered, each of them reported the configured chain id, each
  is at most `tipLagMargin` blocks behind `h_top`, each gave the block at
  `h_low`, and every hash at `h_low` is the same. The failures, in this order,
  are `chain-id-mismatch` (an endpoint reported another chain),
  `too-few-answered`, `chain-id-unavailable` (an answering endpoint gave no
  chain id), `lagging`, `hash-unavailable`, and `hash-mismatch`; a source the
  configuration does not list is `unknown-source` and no endpoint is asked. The
  order is by what each failure proves: a chain id mismatch is proof of an
  endpoint foreign to the source, so it comes first, whatever the rest; the
  quorum is a precondition of judging the rest; and the endpoints' identity
  (their chain id) comes before their content (lag and hashes). It never drops
  an outlier or picks a side. The record (frozen) holds the source, `passed`,
  the `failure`, `tipCheck` (`independent` or `degraded`), the observed tip
  `h_top` and `h_low` (`null` when no endpoint answered), the lag margin, the
  source's configured chain id, and every configured endpoint's answer in order:
  its provider, its chain id, its final block, and its hash at `h_low` (`null`
  for no answer). Block numbers and chain ids are `bigint`.
- **The decision (W-26, W-26b).** `decideChain(record, bind)` returns `pass`
  only if the check passed and the bind holds: for a `future` bind `N` is above
  `h_top`; for a `tip` bind `N` is at least `h_top` minus the lag margin.
  Otherwise it returns `fail`, with the record kept and a reason:
  `chain-unverified` ("could not verify the chain": `too-few-answered`,
  `chain-id-unavailable`, `hash-unavailable`, or `unknown-source`) or
  `verification-failed` ("this round failed verification": `chain-id-mismatch`,
  `lagging`, `hash-mismatch`, or a bind that does not hold, `failure: "bind"`).
  A failure signs nothing by itself: per W-25 and W-26 the shell signs
  `PlayerCancel` (through the round's `signCancel`) as soon as the round is
  `active` only if `T_0` is settled and the round's `CreateRoundAuth` was not
  re-issued, and the player then sees the reason's text, with "and was canceled"
  added to "this round failed verification"; if `T_0` is not settled it signs
  nothing for the round, not even `PlayerCancel`, keeps the evidence, and the
  round ends by its game's expiry rule. W-26 items 1 to 5 are not built, so
  `T_0` is never settled today and every failure takes that path. The shell does
  not act on the decision yet: the start flow is not built.
- **Key custody (W-9 to W-13).** A session generates its action key with
  `signing`'s `createSigner` on the first need (the first `address()` or
  signature), from the injected random source (the platform's
  `crypto.getRandomValues` by default): 32 bytes, redrawn while zero or not
  below the curve order, refused with `key-generation` after 16 invalid draws.
  The session exposes the address and the round states, never the key or a
  function that signs a digest; it is frozen and prints `[redacted]`. Its end
  zeroes the key bytes (best effort), releases the lock, and refuses every later
  signature with `session-ended`; the signed actions stay readable for the
  player-started export (W-27). Nothing is written to storage, a cookie, a URL,
  or a global.
- **The signer lock (W-14).** The session requests `se:signer:<sessionId>` once
  through the injected `navigator.locks` (exclusive, `ifAvailable: true`) and
  holds it until the session ends. The session id must be 1 to 256 printable
  ASCII characters. Its state is `signing` (held), `held-elsewhere` (the "open
  in another tab" state), `unsupported` (no lock manager, or a `request` that
  throws, rejects, or settles without answering: fail closed), `lost` (the
  platform ended the hold, for example a steal), or `ended`. A lock manager
  whose `request` never settles and never answers leaves the session's opening
  pending; the platform's API with `ifAvailable: true` always answers. Every use
  of the key, the first key generation included, checks the state first: a page
  that is not `signing` gets `lock-not-held` and draws no key. A page that did
  not get the lock does not ask again.
- **The transcript state (W-15 to W-19).** One per round, opened with the
  Snapshot `roundId` (UUIDv7 text), the `bytes32` round id, and `T_0`; a second
  open of one round is `round-exists`. It sits on `signing`'s `createTranscript`
  and adds:
  - **Recorded before it is sent (W-15, W-16).** `sign` (a move or a cash-out)
    and `signCancel` return the signed action (message, struct hash, digest,
    signature, and an idempotency key drawn from the injected `randomUUID`
    before the signature) only after it is recorded as pending. While it is
    pending, the same request returns the same object (the same bytes and key)
    for a resend (a cancel is sent again only after a Snapshot read, W-25), and
    any other request is `equivocation`. A call that re-enters `sign` or
    `signCancel` from an injected function (the key source, the cancel encoding,
    the signer) is `equivocation` too, so a pending action keeps one idempotency
    key.
  - **Cancel against the first move (W-17, W-25).** `signCancel` signs
    `action = "cancel"`, an empty path, sequence 1, `previous = T_0`. It is
    `equivocation` once a move is signed, pending or applied, and a move after a
    cancel is `equivocation`.
  - **`T` advances only on an applied Snapshot (W-18).** `observe` takes a
    validated Snapshot and returns what it shows: `other-round` (another round,
    or `idle`: nothing changes), `applied` (the pending move: `T` advances to
    its struct hash), `not-applied`, `closed` (`won`, `lost`, or `canceled`: the
    round takes no more signatures), or `out-of-sync` (progress the shell did
    not sign: it stops).
  - **`STALE_ACTION` (W-19).** `stale` stops all signing for the round, the
    resend included, for good: no resynchronization rule is defined, so the
    shell never signs again at the next sequence. The next Snapshot of the round
    decides what it shows: when it shows the pending move applied, the outcome
    is adopted (`T` advances to it, the phase is `adopted`); when it does not,
    the round is out of sync. A terminal Snapshot closes it.
- **Provisional items.** Each is one injected value or one module, replaced and
  its note removed as the matching contract item closes:
  - `T_0` and the `bytes32` round id are inputs of a round's state: their
    definition and where the shell reads them belong to the signed-action spec
    and the Play API (W-18, W-26). `T_0` is the Snapshot's optional
    `proofs.fairnessProof.readyHash`, absent until the round is released; the
    vendored `se.snapshot/1` has it (`valid/coinflip-active-ready-hash`), but
    the shell does not read it yet: the caller passes `T_0` until the W-26
    checks that recompute and compare it (check 5) are built. W-26 fixes the
    `bytes32` form of `newRound.roundId` (the 16 UUIDv7 bytes, left-aligned and
    zero-padded); the transcript's round id is expected to be that same value
    once check 3 has passed, pending the signed-action spec.
  - The EIP-712 domain is an input of the session. The environment configuration
    pins its `chainId` and `verifyingContract`; the session is not wired to the
    validated configuration yet.
  - `tipLagMargin` has no default and is required per source: the margin in
    blocks per chain is not decided (W-26b).
  - The bind's mode (`future` or `tip`) and `N` are inputs of the decision: the
    Snapshot's `proofs.randomnessProof.blockNumber` is `N`, and the mode is not
    yet in a contract the kit has vendored.
  - The `CreateRoundAuth` and `T_0` checks (W-26 items 1 to 5) are not built.
    The Snapshot schema that carries `proofs.createRoundAuth` and
    `proofs.fairnessProof.readyHash` is vendored, with the `signature/` vectors
    whose verdicts the checks must reach (their shape is tested in
    `create-round-auth-vectors.test.ts`; replaying the verdicts is part of the
    change that builds the checks), and the caller passes `T_0` instead of the
    shell recomputing it and comparing it with `readyHash`. Its trust rule is
    decided ([OQ-7](../wrapper.md#decided-questions); the entropy chain id by
    human review, 2026-10-16): the environment configuration pins the signer,
    the domain, and each entropy source's chain id, the Snapshot's per-round
    copy must equal them or the shell refuses, and the Snapshot is never the
    trust anchor.
    <!-- TODO(W-26 checks): build checks 1 to 5 against the vendored schema, and replay every `signature/` vector's verdict through them. -->
    <!-- TODO(W-26 checks, entropy chain): the `signature/` vectors pin the domain and the signer but not the entropy source's chain id. Replaying their verdicts with each vector's own `entropyChainId` as the configured one would compare a value with itself, so check 3's wrong-chain case needs its own unit tests (T-8). -->
    <!-- TODO(shell transcript): a re-issue (W-26) needs a transcript state that neither `stale` nor `closed` gives: no new signature, while a W-16 resend of an action already signed continues. -->
  - The `PlayerCancel` encoding is an injected function from the message to its
    struct hash; `signing` does not encode `PlayerCancel` until a published
    contract defines its type string and an independent vector pins it. Without
    one, `signCancel` is `cancel-unavailable` and signs nothing (W-20, W-25).
    The exclusion against the first move does not depend on it. `signCancel`
    does not check that `T_0` is settled: whether a cancel may be signed at all
    (W-25, W-26) is decided by the W-26 check flow that calls it.
  - Reading a Snapshot (`snapshot-reading.ts`): the move at sequence `s` is
    applied exactly when the Snapshot's `step` is `s` and its status is not
    `resolving`, since `step` counts the applied moves and the moves are a
    round's first messages. That a `resolving` Snapshot never counts as a move
    applied is normative (the player-facing Snapshot contract) and pinned by a
    test; a cash-out or a cancel is seen only through the terminal status it
    causes. A terminal Snapshot's `step` still counts the moves applied (the
    vendored `won` and `lost` vectors count the final move), so one whose `step`
    is the pending move's sequence confirms that move before the round closes.
    The move that survives the last step closes the round as `won` (W-24,
    [OQ-8](../wrapper.md#decided-questions)), which the shell reads as closed;
    it never signs a cash-out on its own.
  <!-- TODO(signed-action spec): `T_0`, the `PlayerCancel` type, the `bytes32` round id's source, and how a sequence maps to the Snapshot's progress; replace the provisional items above. -->
- **Tests** are unit tests with injected fakes: a seeded random source that
  keeps a copy of each draw (so a test knows the key's bytes), seeded UUIDs, and
  an in-memory lock manager shared between sessions to stand for tabs. The
  worked round of the signing vectors (read through the `contracts` test-only
  entry) is replayed through a round's state: every sequence, `previous`, struct
  hash, and digest matches, and every signature recovers to the session's
  address. Snapshot inputs are the golden `valid/` vectors with `roundId` and
  `step` replaced, validated before use. A seeded simulation of failures, lost
  responses, retries, `STALE_ACTION`, cancels against moves, and a second tab
  checks that no sequence has two signatures and the chain never breaks; a
  whole-session test checks that the key's bytes (hex, base64, and decimal)
  appear in no printed object, error, log line, or global, and that no storage,
  cookie, URL, history, network, or messaging global is read or written. The
  chain configuration's tests cover each refusal (T-8a) and the boot rule; the
  tip check runs against a scripted JSON-RPC transport and a manual clock and
  covers every T-8 tip case: exactly the quorum agreeing passes, one outlier
  among three fails, too few answering fails, a hash mismatch at `h_low` fails,
  a disagreement just beyond the lag margin fails (and at it passes), `h_top` is
  reported, every answer is recorded, and the degraded mode records
  `tipCheck: "degraded"`; plus the calls' shape, untrusted answers, and the
  request timeout (T-8a), and the pinned chain: an endpoint that reports another
  chain id fails, whether or not it gave a final block (in degraded mode too),
  and an answering one that gives no chain id or a malformed one fails closed.
  The `signature/` Snapshot vectors are read and validated, and each one's
  verdict and reason are checked to be ones W-26 defines; the verdicts
  themselves are replayed when checks 1 to 5 are built.
