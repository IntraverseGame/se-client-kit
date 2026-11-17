# The cryptography

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

- `signing` is a hand-written encoder for a **fixed set of types**, over
  `@noble/curves` (secp256k1) and `@noble/hashes` (Keccak-256, SHA-256). It
  follows the rules of the backend's Go verifier: signatures are 65 bytes
  `r ‖ s ‖ v`, `v` in `{27, 28}`, low `s`; recovery rejects any other length,
  `v`, a high `s`, and the zero address; signing is deterministic (RFC 6979) and
  normalizes `s`. The one signature made canonical before that recovery is a
  wallet's `KeyDelegation` signature (its bullet below).
- **What it encodes today.** The domain
  (`EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)`),
  `PlayerAction`, `PlayerCashOut`, and `PlayerCancel`
  (`(string action,uint8[] path,uint32 sequence,bytes32 round,bytes32 previous)`,
  where `round` is the round id), `CreateRoundAuth`, `MarkReadyAuth`, and
  `CloseRoundAuth`, each with its type hash, `hashStruct`, and the `0x1901`
  digest; and `KeyDelegation` under its own chainless domain (proposed, its
  bullet below). The field types are `string` (Keccak-256 of its UTF-8 bytes; a
  lone surrogate is refused), `uint8[]` (Keccak-256 of the concatenated 32-byte
  words), `bytes32`, `bool`, `address`, and `uintN` (big-endian 32-byte words,
  range-checked). A value outside its type is refused, never truncated. A field
  wider than 40 bits (`uint64`, `uint128`, or `uint256`: an amount, the chain
  id, an expiry) takes a `bigint` or a canonical decimal string only; a `number`
  is accepted only for the fields of 40 bits or fewer (a sequence, a window, a
  path step). The draw registry's `CreateDrawRoundAuth` and `RecordDrawAuth` are
  in the vendored vectors and are encoded and replayed by the tests through an
  internal module, but are not public API: the Snapshot schema carries neither,
  and on a book round the shell checks no authorization at all (W-52 replaces
  W-26's checks with the round's consistency rule;
  [Book playback](../wrapper/book-playback.md)).
- **The round's `abi.encode` hashes (W-26).** Three tuples of static fields are
  hashed as `keccak256(abi.encode(...))`, their 32-byte words concatenated with
  no type hash: `hashNewRound` (`created`, over the 11 words of `newRound` in
  the Snapshot schema's order: `bytes32 roundId`, `bytes32 playerRef`,
  `bytes32 currency`, `uint128 betAmount`, `uint32 gameId`,
  `uint32 gameVersion`, `uint32 circuitVersion`, `bytes32 roundSecretHash`,
  `bytes32 randomnessTarget`, `address actionKey`, `bytes32 payoutTermsHash`),
  `hashRandomnessTarget` (`bytes32 source`, `uint256 entropyChainId`,
  `uint256 blockNumber`), and `hashReady` (`T_0`, over `bytes32 created` and
  `bytes32 seedHash`). The field values follow the same rules as above (the bet
  a `bigint` or a decimal string, never a `number`). The signing vectors pin
  `created` and `ready`; the backend's `signature/` Snapshot vectors, which the
  shell replays, pin `randomnessTarget`. `NewRound` is not an EIP-712 struct and
  has no type string: it is the Play API document's `NewRound` schema, and only
  its `created` hash is signed (in `CreateRoundAuth`).
  - **`PlayerCancel`** is published in the signed-action specification and is a
    type of the contracts repository's registry (it records the player's cancel
    of a `Ready` round): the same fields as `PlayerAction`, type hash
    `0xacaf7a5ad98f54f1cf2ba32c94a782121894bc4306dbb28b7683c5ef579a9ce6`.
    `hashPlayerCancel` encodes it, pinned by the independent signer's
    `signed-action/coinflip-cancel` Snapshot vector (Foundry cast; #41) and by
    the signing vectors of contracts release 1.0.0 (their `types.PlayerCancel`
    entry and their `player-cancel` round, below).
  - **`PayoutTerms`** reaches the player only as `newRound.payoutTermsHash`,
    taken as signed (W-26, check 3). No player-facing document publishes a
    `PayoutTerms` type, so the kit has none to encode. The signing vectors list
    six named terms with their hashes (`payoutTerms`); the tests check only that
    each round of `closes` names the hash of its terms, and do not rebuild one.
    The kit computes no payout: the server does, and the Snapshot carries it
    (`payout`).
- **Raw Keccak-256.** `keccak256(data)` hashes bytes its caller encoded: it
  takes a `Uint8Array` and returns 32 new bytes, Ethereum's Keccak-256 (the
  original Keccak padding, not NIST SHA3-256), without changing its input; any
  other value is refused with `invalid-input`. It is public for the verify
  page's StepsDerive, whose draws hash words of their own
  ([Verify page](../verify-page.md#what-the-page-recomputes-v-12-v-13), V-12
  check 7), so that app adds no hash dependency; the shell does not use it. Its
  tests check known answers and the seeds that the fairness kernel's public
  vectors name as `keccak256` of a text.
- **`KeyDelegation`** (proposed,
  [RFC-006](../../rfcs/active/RFC-006-wallet-delegated-action-key.md), its slice
  S3). What a player's browser wallet signs, once per session, for the shell's
  action key; the values are the backend's published `key-delegation/v1`.
  `signing` builds the typed data and the digest and recovers the wallet's
  signature; the shell (S5) and the signing page (S6b) use them.
  - **Type and domain.**
    `KeyDelegation(string notice,address actionKey,bytes32 sessionId,uint64 expiry)`,
    type hash
    `0x3f61f038833be2c4a751a98b54b11d874f7683ea8d0c052705a241abd33c0daf`, under
    `EIP712Domain(string name,string version)` =
    `{ name: "SuperEngine KeyDelegation", version: "1" }`, domain separator
    `0xdf1a3469adcdcfcc9f3bbd698fd36df7cee6c4dddad538d44b80ab537d6fdabf`: no
    `chainId` and no `verifyingContract`. This domain is for `KeyDelegation`
    only; the registry domain and the types above are unchanged. The encoder
    gains the `uint64` field type for `expiry`.
  - **From the notice's hash.** EIP-712 encodes `notice` as the Keccak-256 of
    its UTF-8 bytes, so the struct hash and the `0x1901` digest are computed
    from `noticeHash` (`bytes32`), the hash the start sends and the notices list
    publishes, without the text; a field not of the type is refused.
    `noticeHash(text)` is the Keccak-256 of the text's exact UTF-8 bytes, with
    no normalization (no Unicode normalization, no trimming, no line-ending
    change); a lone surrogate is `invalid-input`.
  - **The session.** `sessionIdBytes32` maps the redeem's `sessionId`
    (`^ses_[0-9a-f]{32}$`, the Play API document) to `bytes32`: its 16 bytes,
    left-aligned and zero-padded (`0x`, the 32 hex digits, then 32 zeros).
    Anything else, uppercase hex and the Snapshot's wider `context.sessionId`
    form included, is `invalid-input`.
  - **The expiry** is a `number`, a safe integer from 1 to 2^53 − 1 (unix
    seconds, `floor(sessionExpiresAt)`, the backend's accepted range); anything
    else is `invalid-input`. A `number`, not a `bigint`: it is a time, never an
    amount; every value the backend accepts is a safe integer, so it is held
    exactly; the shell derives it from the redeem's date-time; and
    `se.delegation/1` carries it as a JSON number, which a `bigint` cannot be.
    The encoder writes the `uint64` word from a `bigint`, so its rule that a
    `number` is accepted only for fields of 40 bits or fewer still holds.
  - **The typed data.** `keyDelegationTypedData` builds the
    `eth_signTypedData_v4` object: `types` with exactly `EIP712Domain` (its two
    fields) and `KeyDelegation` (its four), `primaryType` `KeyDelegation`, the
    chainless domain, and the message with `notice` as text, `actionKey` in
    EIP-55, `sessionId` in lowercase hex, and `expiry` as a decimal string (for
    example `"1795000000"`), in that order. The decimal string is the form the
    spike sent, which MetaMask 13.57 and Rabby signed with signatures that
    verified; a JSON number is untested with real wallets (decided by the code
    owner, 2026-11-17). Only the output is a string: the input `expiry` stays a
    `number`, and the string encodes to the same `uint64` word, so the struct
    hash is the same either way. It checks its four fields as the digest does
    (the notice for a lone surrogate), copies no other field, and returns new
    objects on every call; the same input gives the same JSON.
  - **The wallet's signature.** `recoverKeyDelegation(delegation, signature)`
    takes the 65-byte signature the wallet returned, in either hex case, and
    normalizes it, and only it: `v` 0 or 1 becomes 27 or 28, and an `s` above
    half the curve order becomes `n − s` with `v` flipped. It then recovers
    through `recoverAddress`, unchanged, which refuses the zero address, and
    returns the wallet (EIP-55) and the canonical signature (lowercase hex), the
    one the start sends (RFC-006). Text that is not `0x` hex is `invalid-input`,
    any length but 65 bytes `invalid-signature-length`, any other `v`
    `invalid-signature-v`, and an `r` or `s` that is zero or not below the order
    is left to the strict check (`invalid-signature`). Comparing the recovered
    wallet with the one the signing page names is the caller's. `recoverAddress`
    stays strict for every other signature (W-21, W-26, and the verify page's
    V-12 check 3): `v` 0 or 1 and a high `s` are refused there as before.
  - **Comparing by bytes.** `sameHex(a, b)` is true only when both are `0x` hex
    of at least one byte and encode the same bytes, in either case, so an EIP-55
    address matches the backend's lowercase echo. It serves the shell's
    delegation check, which compares `wallet`, `actionKey`, `noticeHash`,
    `signature`, and the session's `bytes32` by value (RFC-006 section 7), and
    the verify page, which cannot take the shell.
  - **Public API.** `keyDelegationTypedData`, `noticeHash`,
    `recoverKeyDelegation`, `sessionIdBytes32`, and `sameHex`, with the types
    `KeyDelegation` (the notice as `noticeHash`), `KeyDelegationMessage` (the
    notice as text), `KeyDelegationTypedData`, and `RecoveredKeyDelegation`. The
    struct hash, the domain separator, and the digest are internal and tested.
  - **Vectors.** Until the backend's `key-delegation/v1 vectors` are vendored
    (S2), the tests pin its published values, held as provisional test constants
    (`src/fixtures/provisional-key-delegation.ts`). They are copied from
    se-backend `486969a8` (se-backend#88), its published
    `key-delegation/v1 vectors` (the accepted case), and independently
    re-derived here; S2 replaces that file with the lock-pinned vendored copy.
    They are the type string and type hash, the domain string and separator, the
    `en-draft-1` notice's hash, the struct hash and digest for one action key,
    session, and expiry, and a wallet signature that recovers to a well-known
    development account. No key is held for it, and the notice's text is not
    copied (S2 vendors it). The typed data and `noticeHash` are tested with a
    text of their own, and a round trip signs with the `player` test key; the
    normalization cases are derived from the vector's signature; the
    zero-address case replaces Keccak-256 in one test file, as for
    `recoverAddress`. Rows T-37 and T-38 of the
    [Wrapper test plan](../wrapper.md#test-plan).
  - **What it emits.** Nothing; an error carries its code's fixed message, never
    a signature, an address, or a session.
- **Keys.** `createSigner` draws 32 bytes from the platform's cryptographic
  random source (`crypto.getRandomValues`, through `@noble/hashes`; a test
  injects its own source), redraws a value that is zero or not below the curve
  order, and gives up with `random-source` after 16 invalid draws (a broken
  source, since a uniform draw is invalid with probability about 2^-128). The
  key stays in the signer's closure: the signer exposes its address, `sign`
  (digest to signature), and `destroy` (zeroes the key bytes, best effort, and
  refuses every later `sign`); its `toJSON` and `toString` print a placeholder.
  Nothing returns, serializes, or logs the key.
- **Errors.** Every refusal is a `SigningError` with a stable `code`
  (`invalid-input`, `invalid-signature-length`, `invalid-signature-v`, `high-s`,
  `invalid-signature`, `zero-address`, `random-source`, `signer-destroyed`,
  `signing-failed`, `equivocation`, `nothing-pending`) and a fixed message per
  code: a message never carries an input value, and an error from the curve
  library is replaced, not wrapped, so no key or message content reaches an
  error. The package emits no log.
- **Transcript helper.** `createTranscript` holds one round's chain for the
  shell (W-15 to W-18): the last accepted `T` (`T_0` at the start), the next
  sequence (from 1), and the one signed message awaiting confirmation. `sign`
  builds the message at the next sequence with `previous` = the last `T`; while
  a message is pending, the same request returns the same signed entry (the same
  bytes, for a resend) and any other request, including a cash-out against a
  move, is refused with `equivocation`. `confirm` advances `T` to the pending
  message's struct hash. The shell still decides when an action is applied and
  owns the `idempotencyKey`; one transcript serves one round.
- **The `typedData` encoding.** `encodeTypedData` builds the bytes a move, a
  cash-out, or a cancel sends as `typedData` (base64 on the wire): the canonical
  Protocol v1 encoding of `ActionTypedData`, which the Play API document names
  and the engine reads. It takes plain fields (`kind`, `action`, `path`,
  `sequence`, `previous`; not the round, which the request names) and returns
  the deterministic protobuf wire encoding: fields in number order, and an empty
  `path` (always so for a cancel) left out. An empty `action` and a `sequence`
  of 0, which protobuf would leave out as defaults, are refused instead (fail
  closed: the transcript starts at 1 and every action has text), so every
  encoding carries all of `kind`, `action`, `sequence`, and `previous`. The
  vectors name each kind by its published enum name and number:
  `ACTION_KIND_ACTION` = 1, `ACTION_KIND_CASH_OUT` = 2, and
  `ACTION_KIND_CANCEL` = 3. These names are part of the published contract
  (decided by human review, 2026-10-17), so the vendored files keep them as they
  are; the encoder takes the kind as `action`, `cash-out`, or `cancel`.

  | Field | Tag    | Encoding                                                                   |
  | ----- | ------ | -------------------------------------------------------------------------- |
  | 1     | `0x08` | `kind`, a varint: `action` 1, `cash-out` 2, `cancel` 3; 0 is never written |
  | 2     | `0x12` | `action`, length-delimited UTF-8, not empty (a lone surrogate is refused)  |
  | 3     | `0x1a` | `path`, packed varints, each entry a `uint8`; a cancel has none            |
  | 4     | `0x20` | `sequence`, a varint, a `uint32` from 1                                    |
  | 5     | `0x2a` | `previous`, length-delimited, exactly 32 bytes                             |

  Anything else is refused with `invalid-input`, never truncated: fields that
  are not an object (`null` included), a kind other than the three, an empty
  `action`, an `action` with a lone surrogate (which UTF-8 cannot encode
  faithfully), a path entry outside `uint8`, a cancel with a path, a sequence of
  0, outside `uint32`, or not a `number`, and a `previous` that is not 32 bytes
  of `0x` hex. The tags and every byte are pinned by the backend's `typed-data/`
  Snapshot vectors, which the tests replay byte for byte from their `fields`, in
  hex and base64. Two of them are steps of `signing.json`: the third pick links
  to `T_2` and the cash-out to `T_3`, with the action and path of those signed
  messages, and the tests check both against that file; the Coin Flip pick and
  cancel link to the `readyHash` of `valid/coinflip-active-ready-hash`. The
  shell must base64-encode the bytes and apply the Play API document's
  `typedData` limit (4096 base64 characters); that wiring belongs to the shell's
  round flows (#8), not to this package.

- **Action grammar.** The canonical action text and path are built by a small,
  separate module, `actionGrammar`, to the grammar the signed-action
  specification publishes
  ([What the Wrapper spec does not own](../wrapper.md#what-this-spec-does-not-own)):
  `pick row <r> tile <o>`, `cash out`, and `cancel`, canonical base-10 numbers,
  rows and tiles from 0, and a move's `path` of the steps survived then the step
  played, where a path entry is the step's `config.steps[].index` in the
  Snapshot (the tile is only in the text). `pick(path, tile)` derives
  `r = len(path) − 1` from the path (at least one entry), so a text whose row
  disagrees with its path cannot be built. `cashOut(path)` takes the steps
  survived, and `cancel()` has an empty path. A path entry is a `uint8`;
  anything else is `invalid-input`. It reproduces the worked round's texts and
  paths; nothing else in the package depends on it.
- No general EIP-712 library (`viem`, `ethers`) is a dependency. They are used
  only as the independent generator of the vectors in the contracts repository.
- **Vectors.** The package's tests replay `test/vectors/signing.json` from the
  contracts repository (the file `viem` generated, so an independent
  implementation checks this one) and the worked-round vectors, read through the
  test-only entry of the `contracts` package, where they are copied with their
  source commit noted. The signed-action specification publishes no separate
  player-facing vector file: its independent vectors for `PlayerAction` and
  `PlayerCashOut` are these signing vectors. `PlayerCashOut` also has the
  backend's `signed-action/cashorcrash-cash-out` Snapshot vector (Foundry cast,
  the same `PLAYER_KEY`), the cash-out of the vendored Cash or Crash round after
  its first pick, replayed the same way as the cancel below
  (`cash-out-vector.test.ts`), with its chain: the pick
  (`typed-data/cashorcrash-pick`) links to the round's `readyHash`, and the
  cash-out's `previous` is the pick's struct hash. A whole round's chain of
  `PlayerAction`s has the vendored Cash or Crash round won on its last row: its
  three picks (`typed-data/cashorcrash-last-row-pick-row0` to `-row2`) are
  replayed byte for byte, the first links to the round's `readyHash` and each
  later one to the struct hash of the pick before it on that round
  (`last-row-vector.test.ts`); no signature of them is vendored, and nothing
  follows the last. `PlayerCancel`'s independent signature is the backend's
  `signed-action/coinflip-cancel` Snapshot vector, vendored and read through the
  same entry (`snapshotVectors.signedAction["coinflip-cancel"]`, signed with
  `PLAYER_KEY`) and replayed: the tests reproduce its type hash, domain
  separator, struct hash, and digest, sign the digest with the `player` key (its
  test key, the same public account) to its exact bytes, and recover both that
  signature and the vector's to its address (#41). That vector file carries its
  test key (`testKey`), as the cash-out's does: the tests read its address, a
  contracts test checks that each is the same public key as `PLAYER_KEY`, and
  the tests sign with the fixture below, not with it. The signing vector file
  names its two signing keys (the action key `player` and the admin `engine`) as
  the well-known local development accounts but does not carry them, so the
  tests hold those two keys in a test fixture
  (`packages/signing/src/fixtures/keys.ts`). They are the vectors' test keys
  (the AGENTS.md exception): public by design, the default accounts of the local
  Ethereum development node, holding nothing and never used outside tests. The
  tests prove each derives the address the vectors give. **Since contracts
  release 1.0.0** (`1.0.0`, vendored by the re-vendor of the signing vectors;
  the file keeps its older fields as they were and adds three things) the file
  also holds a `PlayerCancel` entry in `types`, `payoutTerms` (six named terms
  with their hashes), and `closes` (nine full rounds on the same domain and
  keys, one per way a round ends, each ending in `closed`, or in
  `canceled = keccak256(abi.encode(ready, T_1))` for the `player-cancel` round).
  `close-vectors.test.ts` replays every round of `closes` with the kit's own
  encoders: `created`, `T_0`, each action's struct hash (a move, a cash-out, or
  a cancel by its kind), digest, exact signature, and recovered signer, the
  `CloseRoundAuth` of a `closeRound`, `lastActionHash`, and the `closed` and
  `canceled` hashes (through the internal `abi.encode` helper, with tuples held
  in the test: the shell never computes either hash). `vectors.test.ts` now
  reproduces the `PlayerCancel` type string and type hash as it does the other
  types. The kit has no encoder for `PayoutTerms` (see above), so
  `hashPayoutTerms` is not replayed. The negative cases (a high `s`, a bad `v`,
  a wrong length, `r` or `s` out of range, a changed `previous`) are derived
  from the vector signatures; the zero-address case replaces Keccak-256 in one
  test file, since no key with the zero address is known.
