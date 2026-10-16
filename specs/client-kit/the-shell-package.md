# The `shell` package

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

`shell` is built in slices. The first slice exists today: the redacting types
and logger, key custody, the signer lock, and the transcript state (W-4, W-9 to
W-19, W-41 as far as the shell is concerned). The `CreateRoundAuth` and tip
checks (W-26, W-26a, W-26b), the `se.controller/1` bridge (W-37, W-38), and the
session, start, move, and cash-out flows follow; the flows wait for the Play API
operations. The Wrapper requirements each rule serves are in brackets.

- **Public API.** Only the redacting logger (`createLogger` and its types),
  `REDACTED`, and `ShellError` with its `ShellErrorCode`. Key custody, the
  signer lock, and the transcript state are internal: the UI is meant to get use
  cases and read-only state, never a signing capability
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
    for a resend, and any other request is `equivocation`. A call that re-enters
    `sign` or `signCancel` from an injected function (the key source, the cancel
    encoding, the signer) is `equivocation` too, so a pending action keeps one
    idempotency key.
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
    and the Play API (W-18, W-26). `T_0` is expected in the Snapshot as an
    optional `proofs.fairnessProof.readyHash`, absent until the round is
    released. That field comes from a later Snapshot schema version the kit has
    not vendored yet (the vendored `se.snapshot/1` does not have it), so it is
    provisional and the caller passes `T_0` until a schema sync adds it.
  - The EIP-712 domain is an input of the session, assumed to come from the
    environment configuration (W-26).
  - The `PlayerCancel` encoding is an injected function from the message to its
    struct hash; `signing` does not encode `PlayerCancel` until a published
    contract defines its type string and an independent vector pins it. Without
    one, `signCancel` is `cancel-unavailable` and signs nothing (W-20, W-25).
    The exclusion against the first move does not depend on it. `signCancel`
    does not check that `T_0` is settled: whether a cancel may be signed at all
    (W-25, W-26) is decided by the W-26 check flow that calls it.
  - Idempotency keys are `play-client`'s `newIntent` UUIDs (36 characters),
    inside a limit of 1 to 128 characters. That limit comes from a Play API
    document the kit has not vendored yet, so it is provisional.
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
  cookie, URL, history, network, or messaging global is read or written.
