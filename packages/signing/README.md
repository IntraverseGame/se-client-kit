# `@intraverse/se-client-signing`

Hand-written EIP-712 and secp256k1 signing and recovery for the fixed set of
messages SuperEngine's signed actions use, with canonical 65-byte signatures.

**Status:** pre-release: no public API yet. Not published to npm yet.

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

## Entry points

- `@intraverse/se-client-signing`: the only entry. The API is not defined yet.

## Guarantees and constraints

- Signatures are 65 bytes, `r || s || v`, with `v` in `{27, 28}` and a low `s`;
  recovery rejects any other length, `v`, a high `s`, and the zero address
  (specified; this is the target, no code ships yet).
- Signing is deterministic (RFC 6979): the same input gives the same bytes.
- The only runtime dependencies are `@noble/curves` and `@noble/hashes`.
- Amounts in signed messages are strings or `bigint`, never `number`.
- It never logs or stores a key.

Specified, not implemented yet: no code ships today; these are the rules the
package is specified to follow.

## More

- [The cryptography](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#the-cryptography)
  in the kit specification
- [Signing start, move, cash-out, and cancel](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md#signing-start-move-cash-out-and-cancel)
  in the Wrapper specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
