# `@intraverse/se-client-verify`

The SuperEngine verify page: paste a round id and see the round recomputed in
your browser from its public evidence, without taking the verification service's
word for the result.

**Status:** pre-release, and not a page yet. It is an application, not an npm
package, and is never published on its own: it will ship inside the Wrapper's
release. Today it holds only the recomputation that rests on the SuperEngine
fairness kernel, kernelVersion 1. The page itself (reading a round, its states,
its checks of the round's signature and of the entropy chain) is specified, not
built yet.

## What it recomputes today

For a Coin Flip round, under kernelVersion 1:

- **Commitment and reveal.** `roundSecretHash` is the SHA-256 of the revealed
  round secret's 32 bytes, and `seedHash` is the SHA-256 of the revealed seed's
  32 bytes.
- **Seed and outcome.** The seed is the SHA-256 of block N's 32-byte hash
  followed by the round secret's 32 bytes, and it must equal the revealed seed.
  The losing side is StepsDerive's single loser of one step with two options,
  drawn with Keccak-256 from the seed; it must equal the round's losing index,
  and the player's pick against it must give the round's status (`won` or
  `lost`). A `canceled` round's seed and losing side are recomputed and shown,
  with no status to compare.

SHA-256 comes from the browser's Web Crypto, and Keccak-256 from
`@intraverse/se-client-signing`. Every derivation is keyed on the round's kernel
version: a round of a version this page does not implement is reported as not
recomputable, and nothing is derived for it. The derivations replay the kernel's
public vectors.

The page holds no key, no token, and no session, and it never loads the code
that holds the player's key.

## More

- [The verify page](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/verify-page.md)
  in the kit specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
