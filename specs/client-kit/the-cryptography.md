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
  `PlayerAction` and `PlayerCashOut`
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
  shell replays, pin `randomnessTarget`. `PlayerCancel` and `PayoutTerms` are
  not implemented yet: no vendored contract defines their fields.
  <!-- TODO(signed-action spec): the `PlayerCancel` and `PayoutTerms` type strings and their vectors. -->
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
- **Action grammar.** The canonical action text is built by a small, separate
  module, `provisionalGrammar`, which holds only the spellings the vendored
  vectors pin (`pick row <row> tile <tile>`, `cash out`). It is replaced when
  the signed-action spec publishes the grammar; nothing else in the package
  depends on it.
  <!-- TODO(signed-action spec): the action grammar for Coin Flip and the canonical `path`. -->
- No general EIP-712 library (`viem`, `ethers`) is a dependency. They are used
  only as the independent generator of the vectors in the contracts repository.
- **Vectors.** The package's tests replay `test/vectors/signing.json` from the
  contracts repository (the file `viem` generated, so an independent
  implementation checks this one) and the worked-round vectors, read through the
  test-only entry of the `contracts` package, where they are copied with their
  source commit noted. The signed-action spec's vectors join them. The vector
  file names its two signing keys (the action key `player` and the admin
  `engine`) as the well-known local development accounts but does not carry
  them, so the tests hold those two keys in a test fixture
  (`packages/signing/src/fixtures/keys.ts`). They are the vectors' test keys
  (the AGENTS.md exception): public by design, the default accounts of the local
  Ethereum development node, holding nothing and never used outside tests. The
  tests prove each derives the address the vectors give. The negative cases (a
  high `s`, a bad `v`, a wrong length, `r` or `s` out of range, a changed
  `previous`) are derived from the vector signatures; the zero-address case
  replaces Keccak-256 in one test file, since no key with the zero address is
  known.
  <!-- TODO(signed-action spec): the spec's vector file and where it is published. -->
