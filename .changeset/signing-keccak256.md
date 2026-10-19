---
"@intraverse/se-client-signing": minor
---

Add `keccak256`, Ethereum's Keccak-256 of raw bytes: a `Uint8Array` in, 32 new
bytes out, anything else refused with `invalid-input`. It is for callers that
encode their own input, such as the verify page's StepsDerive under the
SuperEngine fairness kernel, kernelVersion 1. Its tests check known answers and
the seeds the kernel's public vectors name as `keccak256` of a text.
