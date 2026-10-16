# `@intraverse/se-client-signing`

Hand-written EIP-712 and secp256k1 signing and recovery for the fixed set of
messages SuperEngine's signed actions use, with canonical 65-byte signatures.

**Status:** pre-release. Not published to npm yet.

## Install

Once it is published:

```sh
pnpm add @intraverse/se-client-signing
```

## When to use it

You need to sign or verify SuperEngine's signed actions in JavaScript or
TypeScript (a wallet, a tool, a second implementation). The Wrapper's
`@intraverse/se-client-shell` uses it for every action.

Do not use it for: general-purpose EIP-712 or wallet needs; it encodes a fixed
set of types, not arbitrary typed data.

## Example

```ts
import {
  createSigner,
  createTranscript,
  domainSeparator,
  provisionalGrammar,
  recoverAddress,
} from "@intraverse/se-client-signing";

const signer = createSigner(); // a fresh key from crypto.getRandomValues
const transcript = createTranscript({
  domainSeparator: domainSeparator({
    name: "SuperEngine",
    version: "1",
    chainId: 31337n,
    verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  }),
  round: roundId, // the round id, 32 bytes as hex
  initial: t0, // the hash the first action links to
});

const entry = transcript.sign(
  { kind: "action", action: provisionalGrammar.pick(0, 2), path: [0] },
  signer.sign,
);
recoverAddress(entry.digest, entry.signature) === signer.address; // true
transcript.confirm(); // only once the action is known to be applied
signer.destroy(); // at the end of the session
```

## Entry points

- `@intraverse/se-client-signing`: the only entry.
  - `domainSeparator`, `hashPlayerAction`, `hashPlayerCashOut`,
    `hashCreateRoundAuth`, `hashMarkReadyAuth`, `hashCloseRoundAuth`, and
    `typedDataDigest` (the `0x1901` digest).
  - `createSigner`: generates a key and signs digests; the key is never returned
    or serialized.
  - `recoverAddress`: the signer's address (EIP-55) of a canonical signature.
  - `createTranscript`: the `previous` chain and sequence numbers of one round,
    with one signature per sequence.
  - `provisionalGrammar`: the canonical action text (`pick row R tile T`,
    `cash out`). It is provisional and will be replaced by the published action
    grammar.
  - `SigningError`, whose `code` says why something was refused.

## Guarantees and constraints

- Signatures are 65 bytes, `r || s || v`, with `v` in `{27, 28}` and a low `s`;
  recovery refuses any other length, `v`, a high `s`, an `r` or `s` out of
  range, and the zero address.
- Signing is deterministic (RFC 6979): the same input gives the same bytes.
- A key is drawn from the platform's cryptographic random source (32 bytes,
  redrawn while zero or not below the curve order). It never appears in an
  error, a serialization, or a log; `destroy` zeroes it (best effort).
- A transcript never signs two different messages at one sequence: the same
  request returns the same signed bytes, any other request is refused.
- Every value is checked against its EIP-712 field type; nothing is truncated.
- Amounts (`uint128`, `uint256` fields) are a `bigint` or a decimal string,
  never a `number`.
- The only runtime dependencies are `@noble/curves` and `@noble/hashes`.
- It never logs.

## More

- [The cryptography](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/the-cryptography.md)
  in the kit specification
- [Signing start, move, cash-out, and cancel](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/signing-start-move-cash-out-and-cancel.md)
  in the Wrapper specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
