# `@intraverse/se-client-verify`

The SuperEngine verify page: paste a round id and see the round recomputed in
your browser from its public evidence, without taking the verification service's
word for the result.

**Status:** pre-release. It is an application, not an npm package, and is never
published on its own: it ships inside the Wrapper's release, under `verify/`. It
holds the page's checks, its states (the form, checking, matched, mismatched,
not recomputable, not found, and the service's errors), and their accessible
view and its HTML page, built on the recomputation that rests on the SuperEngine
fairness kernel, kernelVersion 1. It reads the verification service through an
assumed answer format until that format is published.

## What it recomputes

For a round of one step with two options:

- **Round id.** The round's `bytes32` id is the one you asked for.
- **Entropy target.** The round was bound, before the block existed, to block N
  of the entropy chain the page's configuration pins.
- **The backend's signature.** The round's creation was signed by the configured
  signer under the configured registry domain, over the same secret commitment
  the round reveals.
- **Ready evidence.** The ready hash binds the round to its seed commitment.
- **Block N.** The page reads block N's hash from several of the configured
  chain endpoints itself, and they must agree.

And, under kernelVersion 1:

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
