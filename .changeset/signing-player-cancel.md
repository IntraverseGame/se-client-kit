---
"@intraverse/se-client-signing": minor
---

Add `hashPlayerCancel`, the struct hash of `PlayerCancel`
(`(string action,uint8[] path,uint32 sequence,bytes32 round,bytes32 previous)`,
type hash `0xacaf7a5a…9ce6`). It is pinned by the backend's independent-signer
`signed-action/coinflip-cancel` vector: the tests reproduce its type hash,
domain separator, struct hash, digest, and signature bytes, and recover both
signatures to the test key's address.
