# Recorded rounds

Two verify API responses (`GET /verify/v1/rounds/{roundId}`, the vendored verify
API document's `RoundVerification`) of real Coin Flip rounds, one `won` and one
`lost`. The e2e fake of the verify API serves them so the verify page recomputes
checks 5 and 7 for a round the backend signed with its reveals
(`../recorded-rounds.ts`).

- **Provenance.** Recorded by the backend on its local preview stack on
  2026-10-20: anvil as the entropy chain (chain id 31337, block 335), ephemeral
  development keys, no funds. Each file is the response body byte for byte,
  never edited by hand (the formatter ignores them for that reason).
- **Content.** Only the verify response: the round secret and the seed are
  public by design once a round has ended. No URL, credential, or private key.
- **Not a contract copy.** They are test fixtures of the e2e suite, not vendored
  vectors: not part of `contracts`, not in any package or bundle.
- **Do not edit.** Record a new pair instead of changing these.
