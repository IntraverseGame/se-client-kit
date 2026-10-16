---
"@intraverse/se-client-signing": minor
---

First public API: the fixed-type EIP-712 encoder (domain separator, struct
hashes of `PlayerAction`, `PlayerCashOut`, `CreateRoundAuth`, `MarkReadyAuth`,
and `CloseRoundAuth`, the `0x1901` digest), canonical secp256k1 signing and
recovery, key generation from the platform's random source, the transcript
chain with one signature per sequence, and a provisional action grammar.
