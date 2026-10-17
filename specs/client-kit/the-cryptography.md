# The cryptography

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

- `signing` is a hand-written encoder for a **fixed set of types**, over
  `@noble/curves` (secp256k1) and `@noble/hashes` (Keccak-256, SHA-256). It
  follows the rules of the backend's Go verifier: signatures are 65 bytes
  `r ‖ s ‖ v`, `v` in `{27, 28}`, low `s`; recovery rejects any other length,
  `v`, a high `s`, and the zero address; signing is deterministic (RFC 6979) and
  normalizes `s`.
- **What it encodes today.** The domain
  (`EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)`),
  `PlayerAction`, `PlayerCashOut`, and `PlayerCancel`
  (`(string action,uint8[] path,uint32 sequence,bytes32 round,bytes32 previous)`,
  where `round` is the round id), `CreateRoundAuth`, `MarkReadyAuth`, and
  `CloseRoundAuth`, each with its type hash, `hashStruct`, and the `0x1901`
  digest. The field types are `string` (Keccak-256 of its UTF-8 bytes; a lone
  surrogate is refused), `uint8[]` (Keccak-256 of the concatenated 32-byte
  words), `bytes32`, `bool`, `address`, and `uintN` (big-endian 32-byte words,
  range-checked). A value outside its type is refused, never truncated. A
  `uint128` or `uint256` field (an amount, the chain id, an expiry) takes a
  `bigint` or a canonical decimal string only; a `number` is accepted only for
  the fields of 40 bits or fewer (a sequence, a window, a path step). The draw
  registry's `CreateDrawRoundAuth` and `RecordDrawAuth` are in the vendored
  vectors and are encoded and replayed by the tests through an internal module,
  but are not public API (the first release has no book round).
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
  - **`PlayerCancel`** is published in the signed-action specification: the same
    fields as `PlayerAction`, type hash
    `0xacaf7a5ad98f54f1cf2ba32c94a782121894bc4306dbb28b7683c5ef579a9ce6`.
    `hashPlayerCancel` encodes it, pinned by the independent signer's
    `signed-action/coinflip-cancel` Snapshot vector (Foundry cast; #41).
  - **`PayoutTerms`** reaches the player only as `newRound.payoutTermsHash`,
    taken as signed (W-26, check 3). No player-facing document publishes a
    `PayoutTerms` type, so the kit has none to encode.
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
  `PlayerCashOut` are these signing vectors. `PlayerCancel`'s is the backend's
  independent `signed-action/coinflip-cancel` Snapshot vector, vendored and read
  through the same entry (`snapshotVectors.signedAction["coinflip-cancel"]`,
  signed with `PLAYER_KEY`) and replayed: the tests reproduce its type hash,
  domain separator, struct hash, and digest, sign the digest with the `player`
  key (its test key, the same public account) to its exact bytes, and recover
  both that signature and the vector's to its address (#41). That vector file
  carries its test key (`testKey`): the tests read its address, a contracts test
  checks that it is the same public key as `PLAYER_KEY`, and the tests sign with
  the fixture below, not with it. The signing vector file names its two signing
  keys (the action key `player` and the admin `engine`) as the well-known local
  development accounts but does not carry them, so the tests hold those two keys
  in a test fixture (`packages/signing/src/fixtures/keys.ts`). They are the
  vectors' test keys (the AGENTS.md exception): public by design, the default
  accounts of the local Ethereum development node, holding nothing and never
  used outside tests. The tests prove each derives the address the vectors give.
  The negative cases (a high `s`, a bad `v`, a wrong length, `r` or `s` out of
  range, a changed `previous`) are derived from the vector signatures; the
  zero-address case replaces Keccak-256 in one test file, since no key with the
  zero address is known.
