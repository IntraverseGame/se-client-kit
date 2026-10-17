---
"@intraverse/se-client-contracts": minor
---

The Play API document (`/play/v1`) is vendored, and its generated types are
public: `PlayApiPaths`, `PlayApiOperations`, `PlayApiComponents`, and
`PlayApiOperationRoutes`. The
Snapshot schema `se.snapshot/1` is synced to the version with
`proofs.createRoundAuth` (required on a config Snapshot that carries `proofs`,
a one-time pre-release exception to additive-only) and
`proofs.fairnessProof.readyHash`, and `UNAVAILABLE` may now carry
`retryable: false`. New public types: `Address`, `CreateRoundAuth`, `NewRound`,
`RegistryDomain`, `Signature65`, `Uint128`, and `Uint256`.
