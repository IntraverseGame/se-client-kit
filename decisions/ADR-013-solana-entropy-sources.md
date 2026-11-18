# ADR-013 — Solana entropy sources: an explicit chain kind, genesis hashes in code, no Solana library

- Status: proposed (recommended by RFC-007, for the human's decision; the specs
  cite it as "proposed, ADR-013" until it is accepted)
- Date: 2026-11-18
- Relates to: [RFC-007](../rfcs/active/RFC-007-solana-entropy-in-the-browser.md)
  (Solana entropy in the browser), se-client-kit#235,
  [ADR-001](./ADR-001-toolchain-and-signing.md) (no new runtime dependency;
  hand-written protocol code over `@noble`), W-26 and W-26b of
  [signing](../specs/wrapper/signing-start-move-cash-out-and-cancel.md), the
  [configuration](../specs/wrapper.md#configuration) of the Wrapper spec, V-3
  and V-12 of [the verify page](../specs/verify-page.md)

## Context

- Production's entropy chain is Solana mainnet-beta (the human owner,
  2026-11-18, #235). The kit's two chain reads, the shell's tip check (W-26b)
  and the verify page's block check (V-12, check 6), speak only EVM JSON-RPC.
- The environment configuration pins each entropy source by `entropyChainId` and
  does not say which protocol the source speaks.
- The backend's Solana entropy spec gives a Solana source a cluster number as
  its `entropyChainId` (mainnet-beta 101, testnet 102, devnet 103), reserves
  those numbers for Solana, and names the source `solana`. Solana has no chain
  id an RPC reports; a cluster is identified by its genesis hash
  (`getGenesisHash`).
- The kit needs four read-only Solana RPC methods and one base58 decoder. The
  usual way to get them is a Solana library, which would be a new runtime
  dependency on the origin that holds the player's key (ADR-001).

Three choices here are costly to undo: a field of the configuration schema is in
every environment's document and in the deploys' secrets; a trust anchor's home
(code or configuration) decides who can change it; and a dependency, once in the
Wrapper, is hard to take out.

## Decision

1. **An explicit chain kind per entropy source.** The configuration gains
   `entropyChainKind`, per source, `"evm"` or `"solana"`, required with no
   default. Both validators (the shell's and the verify page's) refuse a
   `solana` source whose `entropyChainId` is not 101, 102, or 103, an `evm`
   source with one of those, and a source whose key and kind disagree about
   `solana` (RFC-007 Q7, decided by the code owner on 2026-11-18).
   `entropyChainId` and `tipLagMargin` keep their names; for a Solana source
   they hold the cluster number and a count of slots.
2. **A Solana cluster's identity is its genesis hash, pinned in code.** The kit
   holds the three clusters' genesis hashes as a protocol constant keyed by the
   cluster number, and every Solana endpoint's `getGenesisHash` must equal the
   pinned one, compared as a string. The configuration pins the cluster number
   only; it never carries a genesis hash. The shell and the verify page each
   hold the table (the page cannot import the shell), and a test holds both to
   the spec's values.
3. **No Solana library and no base58 dependency.** The shell's Solana calls go
   through the Wrapper's existing JSON-RPC transport. The verify page's go
   through a new call function of its own read-only module, one that keeps the
   JSON-RPC error's code and refuses a redirect and any status but HTTP 200
   (RFC-007, section 4, Requests). Both are read by hand-written, specified
   readers, and the verify page decodes base58 with its own decoder
   (`apps/verify/src/base58.ts`), pinned by vectors. The shell makes no block
   read on Solana and needs no decoder.

## Alternatives considered

- **Infer the kind from the number** (101 to 103 mean Solana): no schema change.
  Rejected: the protocol becomes a consequence of a number that public EVM
  chain-id registries can also assign, and a mistyped number would switch
  readers silently instead of failing at boot. The engine itself pins
  `CHAIN_KIND` explicitly and cross-checks the cluster number; option (a)
  mirrors it, and its cross-check is how the kit meets the backend's "must use
  the same three numbers and the source name `solana`".
- **The genesis hash in the configuration**, beside or instead of the cluster
  number: lets a test cluster be pinned without a release, and lets a localnet's
  random genesis be used. Rejected: the map from a cluster number to its genesis
  is the same in every environment, so a per-environment copy could only
  disagree with it; the backend reserves no number for a localnet; and a test
  cluster's reset is rare and worth a release.
- **A Solana library** (`@solana/web3.js`, `@solana/kit`) or **a base58
  package**: less code to write. Rejected: a dependency tree on the key's
  origin, under ADR-001's bar, for four read-only calls and a decoder of about
  thirty lines.

## Consequences / tradeoffs

- Every environment's document, and staging's `PAGES_CHAIN_PINS`, gains the
  field in one migration (RFC-007, Migration considerations).
- A test cluster whose genesis changes needs a kit release; production uses
  mainnet-beta only.
- Two copies of a three-row table, held together by a test.
- The readers and the decoder are the kit's to maintain and to test; RFC-007
  specifies them and pins the decoder with vectors.
- The engine will add the same genesis-hash check on its side (the backend,
  2026-11-18), so both ends identify the cluster the same way.

## References

- [RFC-007](../rfcs/active/RFC-007-solana-entropy-in-the-browser.md), sections
  1, 2, and 5.
- The backend's Solana entropy spec and its Shell bind check (backend-owned,
  cited by name).
- The Solana SDK's `ClusterType::get_genesis_hash` (the `solana-cluster-type`
  crate) and the CAIP-2 Solana namespace, for the public genesis hashes.
