---
"@intraverse/se-client-wrapper": minor
---

A round on a `solana` entropy source is now checked before it can be played:
the chain check asks the source's configured Solana RPC endpoints for their
genesis hash and their final slot, through the same JSON-RPC transport, with
the same request options, and shows the same "could not verify the chain" and
"this round failed verification" states as for an EVM source. Each endpoint of
a `solana` source must answer a browser's JSON-RPC POST from the Wrapper's
origin (CORS).
