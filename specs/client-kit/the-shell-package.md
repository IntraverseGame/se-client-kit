# The `shell` package

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`shell` is built in slices. Three exist today: the redacting types and logger,
key custody, the signer lock, and the transcript state (W-4, W-9 to W-19, W-41
as far as the shell is concerned); then the chain configuration, the tip check,
and the decision it leads to (W-26a, W-26b, and W-26's pass or fail); then the
`CreateRoundAuth` and `T_0` checks (W-26 items 1 to 5), the re-issue rule, and
the round's verdict that combines them with the tip check. The `se.controller/1`
bridge (W-37, W-38) and the session, start, move, and cash-out flows follow. The
Wrapper requirements each rule serves are in brackets.

- **Public API.** The redacting logger (`createLogger` and its types),
  `REDACTED`, `ShellError` with its `ShellErrorCode`, the chain configuration's
  validation (`validateChainConfig`, `DEFAULT_MIN_RPC_QUORUM`, and the types
  `ChainConfig`, `ChainConfigResult`, `ChainConfigIssue`,
  `ChainConfigIssueCode`, `Environment`, `SourceConfig`, `RpcEndpoint`), and the
  RPC transport types (`RpcTransport`, `RpcCall`, `BlockTag`). The validation is
  public because the Wrapper applies W-26a's boot rule before it starts; the
  transport types because the Wrapper supplies the transport (it owns `fetch`
  and the Content Security Policy). Key custody, the signer lock, the transcript
  state, the tip check, its decision, the `CreateRoundAuth` checks, and the
  round's verdict are internal: the UI is meant to get use cases and read-only
  state, never a signing capability ([Packages](./packages.md)), and those use
  cases do not exist yet.
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
  round ends by its game's expiry rule. The round's verdict (below) combines the
  decision with checks 1 to 5. The shell does not act on it yet: the start flow
  is not built.
- **The `CreateRoundAuth` checks (W-26 items 1 to 5).** They read a validated
  Snapshot, the validated chain configuration (the only trust anchor, OQ-7), and
  what the shell sent in `start` (the action key's address and the
  `AmountRequest`'s `value` and `unit`). Checks 1 to 4 run on the round's first
  Snapshot that carries `proofs.createRoundAuth` and return `waiting` (a
  `starting` Snapshot without `proofs`), `passed` with the recomputed `created`,
  or `refused` with the first failing check's reason:
  1. `missing`: a Snapshot that carries `proofs` without
     `proofs.createRoundAuth`, or one past `starting` without either (an `idle`
     Snapshot too). A book Snapshot never carries the object, so a book round is
     refused here: the first release ships config games only, and book rounds
     are refused until a later increment defines their evidence (decided by
     human review, 2026-10-17; W-26).
  2. `pinned-mismatch`: `domain.chainId`, `domain.verifyingContract`, or
     `signer` is not the configuration's `registryDomain` or `runtimeSigner`
     (addresses compared without case).
  3. `cross-field`: `newRound.roundId` is not the Snapshot `roundId`'s `bytes32`
     form; `newRound.roundSecretHash` is not
     `proofs.randomnessProof.roundSecretHash`; `newRound.actionKey` is not the
     shell's key address (without case); `newRound.betAmount` and the sent
     `value`, each read with `snapshot`'s `parseBaseUnits` into a `bigint`, are
     not equal or either is not base units; the sent `unit` and
     `newRound.currency`, each as ASCII `bytes32`, are not equal byte for byte,
     or either is not ASCII or is longer than 32 bytes; the source
     (`proofs.randomnessProof.source`) is not in the configuration, or
     `entropyChainId` is not the chain id it pins; or
     `newRound.randomnessTarget` is not
     `keccak256(abi.encode(bytes32 source, uint256 entropyChainId, uint256 blockNumber))`
     recomputed with the source as ASCII `bytes32` and the pinned chain id (a
     source longer than 32 bytes, or a block number that is not a safe integer,
     fails).
  4. `recover-mismatch`: `created = keccak256(abi.encode(newRound))` (the
     currency as ASCII `bytes32`) and the EIP-712 digest of `CreateRoundAuth`
     under the configured domain (`name` `"SuperEngine"`, `version` `"1"`, and
     the pinned `chainId` and `verifyingContract`, never the Snapshot's) are
     computed with `signing`'s `hashNewRound`, `hashCreateRoundAuth`,
     `domainSeparator`, and `typedDataDigest`; `recoverAddress` refuses a
     signature that is not canonical (W-21), and the address it recovers must be
     `runtimeSigner`. A field outside its type fails here too.

  Neither `expiry` nor `prepareWindow` is compared with a time: no clock is
  read. Check 5 runs once checks 1 to 4 passed: when the Snapshot carries
  `proofs.fairnessProof.readyHash`,
  `T_0 = keccak256(abi.encode(created, seedHash))` (`signing`'s `hashReady`,
  `seedHash` from `proofs.fairnessProof.seedHash`) must equal it
  (`ready-mismatch`); without it the result is `waiting` while `starting` and
  `missing` on any later status. `T_0` is settled only by check 5 passing. A
  re-issue is a later read whose `proofs.createRoundAuth` differs from the
  round's first one, compared field by field as validated JSON; a read without
  the object is not one.

- **The round's verdict (W-25, W-26).** `createRoundVerification` holds one
  round (by its Snapshot `roundId`; other rounds' and `idle` Snapshots are
  ignored) and takes its Snapshots and its tip-check decision. It keeps the
  first `proofs.createRoundAuth` and each distinct later one (the evidence,
  W-27), runs checks 1 to 4 once and check 5 until it decides, keeps the first
  tip decision, and returns one of: `checking` (nothing signed, the game not
  shown); `ready` with the settled `T_0`, once every check and the tip check
  passed and the round is past `starting` (the first move links to `T_0`, and a
  cancel the player asks for may be signed, W-25); or `failed` with the failure
  (a check's reason, `reissued`, or `tip-check` with the tip check's failure),
  what the player is shown (`verification-failed`, or `chain-unverified` for a
  tip check that could not read the chain), `T_0` when it was settled, and
  `cancel`. `cancel` is `true` exactly when `T_0` is settled, only the tip check
  failed, the round's latest Snapshot is `active`, and there was no re-issue:
  the shell must then sign `PlayerCancel`, which it cannot yet (the
  `PlayerCancel` encoding below). A tip check that fails before check 5 has run
  leaves the verdict `checking` until check 5 decides. A re-issue fails the
  round at any point, with `cancel` `false`, even after `ready` or after a
  tip-check failure that required a cancel.
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
    definition belongs to the signed-action spec (W-18, W-26). The round's
    verdict settles `T_0` (check 5 recomputes it and compares it with
    `proofs.fairnessProof.readyHash`); the start flow that would pass that
    settled value to the round's state is not built, so the state still takes
    `T_0` as an input. W-26 fixes the `bytes32` form of `newRound.roundId` (the
    16 UUIDv7 bytes, left-aligned and zero-padded); the transcript's round id is
    expected to be that same value once check 3 has passed, pending the
    signed-action spec.
  - The EIP-712 domain is an input of the session. The environment configuration
    pins its `chainId` and `verifyingContract`; the session is not wired to the
    validated configuration yet.
  - `tipLagMargin` has no default and is required per source: the margin in
    blocks per chain is not decided (W-26b).
  - The bind's mode (`future` or `tip`) and `N` are inputs of the decision: the
    Snapshot's `proofs.randomnessProof.blockNumber` is `N`, and the mode is not
    yet in a contract the kit has vendored.
  - The domain's `name` and `version` (`"SuperEngine"`, `"1"`) the checks build
    the digest with are the Snapshot schema's constants: the environment
    configuration pins only `chainId` and `verifyingContract`
    ([OQ-7](../wrapper.md#decided-questions)).
  - A re-issue is decided by the round's verdict (`reissued`), but the round's
    transcript state has no phase that refuses new signatures while a W-16
    resend continues, so nothing applies the verdict to it yet.
    <!-- TODO(shell transcript): a re-issue (W-26) needs a transcript state that neither `stale` nor `closed` gives: no new signature, while a W-16 resend of an action already signed continues. -->
  - The `PlayerCancel` encoding is an injected function from the message to its
    struct hash; `signing` does not encode `PlayerCancel` until a published
    contract defines its type string and an independent vector pins it. Without
    one, `signCancel` is `cancel-unavailable` and signs nothing (W-20, W-25).
    The exclusion against the first move does not depend on it. `signCancel`
    does not check that `T_0` is settled: whether a cancel may be signed at all
    (W-25, W-26) is decided by the round's verdict, which the flow that calls it
    reads (`cancel`, or `ready` for a cancel the player asks for).
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
  The `signature/` Snapshot vectors are read and validated and replay through
  checks 1 to 4 with their verdicts and reasons, each under a configuration that
  pins its `pinned` values and its own entropy source and chain id; the vendored
  `valid/coinflip-active-ready-hash` round passes checks 1 to 5 and settles
  `T_0` as its `readyHash`. Since the vectors do not pin the entropy chain id,
  the wrong-chain cases have their own tests: a configuration that pins another
  chain, a round signed on another chain, an `entropyChainId` changed after
  signing, and a source the configuration does not list. The other T-8 cases
  issue a round with a registry key drawn at run time from a seeded source (so
  no key is written down) and change a field before or after signing: each check
  fails with its reason and in order (`missing`, `pinned-mismatch`,
  `cross-field` for a wrong round, key, bet, currency, secret hash, chain, or
  `randomnessTarget`, `recover-mismatch` for a tampered `playerRef`, `gameId`,
  `gameVersion`, `circuitVersion`, `payoutTermsHash`, `prepareWindow`, or
  `expiry`, another signer, a high-`s` signature, or another domain,
  `ready-mismatch`, and `missing` for `readyHash` still absent at `active`); a
  past `expiry` passes; the verdict never sets `cancel` when `T_0` is not
  settled, sets it for a tip-check failure only once `T_0` is settled and the
  round is `active`, and withdraws it on a re-issue, which is recorded once with
  the first object kept.
