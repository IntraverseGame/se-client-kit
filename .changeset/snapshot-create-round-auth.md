---
"@intraverse/se-client-snapshot": minor
---

Validate against the synced `se.snapshot/1` schema: `proofs.createRoundAuth`
and `proofs.fairnessProof.readyHash` are accepted, and a config Snapshot that
carries `proofs` without a `createRoundAuth` is refused. `RetryableProblem`
types `UNAVAILABLE` with either `retryable` value. Within a schema object the
evaluator now evaluates `not` after its siblings, so an issue that names a
member comes first.
