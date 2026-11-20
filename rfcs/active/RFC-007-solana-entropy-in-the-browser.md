# RFC-007 — Solana entropy in the browser

- Status: active (partly accepted 2026-11-20: ADR-013 accepted by the human, the
  code owner; see [Decisions](#decisions))
- Author: the documenter agent, for human review
- Created: 2026-11-18
- Relates to: se-client-kit#235; se-backend#375 (the production RPC providers);
  W-26, W-26a, W-26b, and W-27 of
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md); W-52
  of [book playback](../../specs/wrapper/book-playback.md); W-43 and the
  [configuration](../../specs/wrapper.md#configuration) of the Wrapper spec;
  [the Pages sites' configuration](../../specs/client-kit.md#the-pages-sites-configuration)
  and
  [environment configuration](../../specs/client-kit.md#environment-configuration)
  of the client kit spec;
  [the `shell` package](../../specs/client-kit/the-shell-package.md); V-3, V-12
  (checks 2, 6, and 7), V-19, and D-1 of
  [the verify page](../../specs/verify-page.md);
  [ADR-001](../../decisions/ADR-001-toolchain-and-signing.md) (no new runtime
  dependency); [ADR-008](../../decisions/ADR-008-pages-deploy-with-wrangler.md)
  and
  [ADR-009](../../decisions/ADR-009-production-pages-deploy-trigger-and-source.md)
  (the Pages deploys and the release's configuration check);
  [ADR-013](../../decisions/ADR-013-solana-entropy-sources.md) (accepted
  2026-11-20: the chain kind, the pinned genesis hashes, no Solana library)

This RFC adds Solana as a second kind of entropy chain to the two places the kit
reads one: the shell's tip check (W-26b), which the Wrapper runs before a config
round can be played, and the verify page's block check (V-12, check 6).
Production's entropy source is Solana mainnet-beta (decided by the human owner
on 2026-11-18, #235), and both reads spoke only EVM JSON-RPC when this RFC was
drafted. EVM sources, staging's included, keep exactly the behavior they have.
The semantics come from the backend's specs, cited by name: **the backend's
Solana entropy spec** (its block selection and reorg policy, Solana section),
**its Shell bind check**, and **its verify API document**, as confirmed by the
backend's TPO on 2026-11-10 and answered again from se-backend `4a49ab9d` on
2026-11-18. The code owner decided every question this draft asked on
2026-11-18, and two more on the review of 2026-11-19, and the human accepted
ADR-013 on 2026-11-20 ([Decisions](#decisions)). Section 1 and section 2's
genesis table are written into the specs by slice 1, section 3 by slices 2 and 3
(W-26b's Solana tip check and the shell spec), and sections 4 and 5 by slice 4
(V-12's check 6, with base58, and VT-13 and VT-14); they are normative there,
and the specs, not this file, are canonical for them. The other sections stay
here, decided, until their slices (section 9) write them into the specs. What is
pending from the backend and the infrastructure owner is in
[Unresolved questions](#unresolved-questions).

## Problem

- The tip check asks every endpoint `eth_chainId` and `eth_getBlockByNumber`. A
  Solana RPC answers neither, so with a Solana source every endpoint gives no
  answer, the check fails as `too-few-answered`, and the shell signs W-26's
  required `PlayerCancel` for every config round once `T_0` is settled. No
  production config round can be played.
- The verify page's check 6 makes the same two calls. A Solana round's check 6
  fails as `too-few`, so check 7 never runs, and no production round can be
  verified.
- `entropyChainId` is read as an EVM chain id, and nothing in the configuration
  says which protocol a source speaks.
- Staging works only because its entropy chain, Somnia's public testnet, is EVM.

## Motivation

- INC1 ships on Solana. Without this, the kit refuses every production round it
  is meant to protect, and the verify page cannot check one.
- The tip check (the backend's Shell bind check) and the verify page's quorum
  read (D-1) are the player's only independent view of the entropy chain. Solana
  must get the same guarantees as EVM: an identity check of the chain, a quorum
  of independent providers, fail closed on any disagreement, and no trust in a
  value the backend serves.

## Proposed solution

Each part names the spec it changes. New tests are numbered from T-39 and VT-13
(the highest on `main` are T-35 and VT-12; T-36 to T-38 are taken on unmerged
branches).

### 0. The semantics this RFC implements

From the backend's Solana entropy spec and its Shell bind check:

| Item                         | Solana                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| height `N`                   | a **slot**, not a block height. `proofs.randomnessProof.blockNumber` and the verify API's `entropy.block` are the slot                                                                                                                                                |
| block value                  | the block's `blockhash`, base58-decoded to exactly 32 bytes (any other length refused), published as `0x` and 64 lowercase hex, never base58; a block with no `blockTime` is refused                                                                                  |
| final tip                    | `getSlot` at commitment `finalized`. The head (`getSlot` at `processed`) is the engine's only, for `future` binds. The final tip trails the head by about 32 slots                                                                                                    |
| `tip` bind                   | `N` is the engine's latest finalized slot (`getSlot` at `finalized`, polled every 500 ms in production; it never decreases)                                                                                                                                           |
| `future` bind                | `N` = processed head + `k`, with `k` = 22 in production                                                                                                                                                                                                               |
| skipped slot                 | if slot `N` has a block, the value is that block's; if `getBlock(N)` answers -32007 or -32009 (skipped), the value is the **first finalized block at a slot after `N`**, by the procedure of section 4; a ledger gap serves no value                                  |
| not found                    | -32004 (block not available), -32001 (cleaned up), and -32014 (status not available yet) mean "not found", not "skipped"                                                                                                                                              |
| `getBlock` options           | `{ commitment: "finalized", encoding: "json", transactionDetails: "none", rewards: false, maxSupportedTransactionVersion: 0 }`, the engine's exactly                                                                                                                  |
| cluster                      | `entropyChainId` is the cluster number: mainnet-beta 101, testnet 102, devnet 103, reserved for Solana. The engine refuses `solana` with any other number and an EVM source with 101 to 103                                                                           |
| source                       | the ASCII `solana`; `randomnessTarget = keccak256(abi.encode(bytes32 "solana", uint256 cluster, uint256 slot))`, `"solana"` left-aligned and zero-padded                                                                                                              |
| the tip check (INC0)         | `N` against the highest final tip the shell sees on at least `minRpcQuorum` independent RPCs, at its first read of the round's `createRoundAuth`: `future`, `N` above it, strictly; `tip`, `N` not older than it by more than the lag margin (a margin, not equality) |
| independent                  | providers run by different organizations on separate infrastructure, excluding the engine's own RPC; below the quorum the check fails                                                                                                                                 |
| measurements (the backend's) | slot time 0.214 s; p99 lag between providers' processed slots 4 slots                                                                                                                                                                                                 |

"A verifier (the client kit) must apply the same rule to recompute the value of
a skipped slot", and "the client kit must use the same three numbers and the
source name `solana` to pick a Solana reader" (the backend's Solana entropy
spec).

The shell's tip check already runs "with the first Snapshot that carries
`proofs.randomnessProof`"
([the `shell` package](../../specs/client-kit/the-shell-package.md)); for a
config round that Snapshot is the first to carry `proofs.createRoundAuth` too,
both being required from the bind on, so the two descriptions name the same
read.

### 1. The chain kind per entropy source (configuration)

**An explicit kind, cross-checked** (option a; #235 asks for it; ADR-013,
accepted 2026-11-20; now in the
[configuration](../../specs/wrapper.md#configuration) of the Wrapper spec). The
environment configuration gains one per-source map beside `entropyChainId` and
`tipLagMargin`:

```text
"rpcEndpoints":     { "solana": [ { "provider": <name>, "url": <https URL> }, … ] }
"entropyChainKind": { "solana": "solana" }
"entropyChainId":   { "solana": 101 }
"tipLagMargin":     { "solana": 64 }
```

Production's `tipLagMargin` for Solana is **64 slots, provisional** (decided,
Q1): the backend's measurement on the contracted providers (se-backend#471)
replaces it. The field stays required with no default in code; 64 is a value of
the configuration, never a constant of the kit.

- **`entropyChainKind`**: per source, required for each source and only for
  those, `"evm"` or `"solana"`; no default, as `entropyChainId` and
  `tipLagMargin` have none. The issue is `invalid-entropy-chain-kind` at
  `entropyChainKind` (not an object) or `entropyChainKind.<source>` (missing,
  not one of the two strings, or naming a source with no endpoints).
- **The cross-check** (issue `entropy-chain-kind-mismatch` at
  `entropyChainKind.<source>`, naming the field, never a value):
  - a `solana` source MUST have `entropyChainId` 101, 102, or 103;
  - an `evm` source MUST NOT have 101, 102, or 103 (the backend reserves them;
    the public EVM chain-id registries do not, so a number alone cannot say
    which protocol a source speaks);
  - a `solana` source MUST be keyed `solana`, and a source keyed `solana` MUST
    be of kind `solana` (the source name the engine uses, and the one
    `randomnessTarget` encodes; Q7).
- **The other fields keep their names** (aligned with the backend's slice now
  starting): `entropyChainId` holds the cluster number for a Solana source, and
  `tipLagMargin` is in the source's own unit, blocks for `evm` and **slots** for
  `solana`. `rpcEndpoints`, `minRpcQuorum`, W-26a's boot rule, the independence
  rule (no two endpoints of one source share a provider or a URL), and
  `quorum-unreachable` are unchanged and apply to both kinds.
- **Several sources at once, of either kind.** A document may list any number of
  sources, each keyed by its Snapshot `source` name, each with its own kind,
  `entropyChainId`, endpoints, and `tipLagMargin`, and it may mix `evm` and
  `solana` sources. Staging does so for a while (section 9, step 8): during its
  switch, its Somnia source stays beside the new `solana` one, which is
  mainnet-beta (cluster 101), the same chain as production:

  ```text
  "entropyChainKind": { "anvil": "evm",  "solana": "solana" }
  "entropyChainId":   { "anvil": 50312,  "solana": 101 }
  "tipLagMargin":     { "anvil": 100,    "solana": 64 }
  "minRpcQuorum":     1
  ```

  After the backend's switch and drain, `anvil` is dropped and `minRpcQuorum`
  raised to 2 (Q16), leaving `solana` alone, as in production. Staging's
  `solana` margin is the provisional 64 slots (Q1), and its `solana` endpoints
  are staging keys on two independent providers that staging's own engine does
  not read, Origin-locked to staging's origins (P-3, P-6). The rule is per
  environment: an environment's browser endpoints never include the provider its
  own engine reads, so staging's pair may differ from production's.

  - **The reader is the round's.** The tip check and the verify page look up the
    round's own `source` (the Snapshot's `proofs.randomnessProof.source`, the
    verify API's `entropy.source`) in the configuration, then take that source's
    kind, `entropyChainId`, endpoints, and margin. A round never reads another
    source's endpoints, and a source the configuration does not list fails as
    today (`unknown-source` in the shell, `config` on the page). W-26's check 3
    and the verify page's check 2 recompute `randomnessTarget` with that
    source's own pinned `entropyChainId`.
  - **The validator's rules hold per source**: each per-source map
    (`rpcEndpoints`, `entropyChainKind`, `entropyChainId`, `tipLagMargin`) has
    an entry for each source and for no other; the cross-check runs for each
    source; every source has at least `minRpcQuorum` endpoints
    (`quorum-unreachable`, at that source); and no two endpoints of one source
    share a provider or a URL (one provider may serve two sources, as today). By
    Q7 a document has at most one `solana` source, keyed `solana`; it may have
    as many `evm` sources as it has keys.
  - **`minRpcQuorum` is one number for the whole document**: a document with a
    one-endpoint source must set it to 1, and is then `degraded` (W-26a) for
    every source, a Solana one included; only `local` and `preview` may. There
    is no quorum per source. So staging, whose `anvil` source has one endpoint,
    is at `minRpcQuorum` 1 and degraded for both of its sources while it lists
    both, between steps 2 and 4 of section 9's step 8; once `anvil` is dropped
    it sets 2 (Q16).
  - **The production rules hold for the document and for each source**:
    `environment` is `production` and `minRpcQuorum` at least 2, so every source
    has at least two independent endpoints, and every `solana` source is
    cluster 101. Both validators refuse a `production` document with a `solana`
    source on another cluster (`production-cluster`, at
    `entropyChainId.<source>`), as they refuse its quorum below 2
    (`production-quorum`): the rule runs in the player's browser at boot, so a
    document written outside the Pages tool cannot boot on a test cluster's
    entropy. Production's first document lists one source, `solana`.
  - **The policies take every source's endpoints**: `PAGES_RPC_ENDPOINTS` holds
    each source's list under its key, `PAGES_RPC_ORIGINS` lists exactly the
    origins of all of them, and both sites' `connect-src` takes them all, as
    today.

- **Where it is validated**: the shell's `validateChainConfig` (its
  `SourceConfig` becomes a union on `kind`, and a Solana source carries its
  pinned genesis hash, section 2), and the verify page's own
  `validateEnvironmentConfig` by the same rules; `tools/config-parity.test.ts`
  gains the new cases so the two validators keep one verdict. The Wrapper's
  `ENVIRONMENT_CONFIG_FIELDS` and the verify page's `CONFIG_FIELDS` gain the
  field.
- **The Pages deploys and the release's check** (client-kit.md, the Pages sites'
  configuration; ADR-009's amendment of 2026-11-17):
  - `PAGES_CHAIN_PINS` holds `entropyChainKind` too (`CHAIN_PIN_FIELDS` in
    `apps/wrapper/pages-config.ts`); it is a chain pin like `entropyChainId`.
    Staging's document gains `"entropyChainKind": { "anvil": "evm" }` and
    nothing else changes for it, until step 8 of section 9 adds the `solana`
    source beside it.
  - `PAGES_RPC_ENDPOINTS` holds the Solana endpoints under the key `solana`;
    `PAGES_RPC_ORIGINS` lists exactly their origins, as today; each origin
    passes the headers step's `origin` pattern (lowercase `https`), as today.
    The key in an endpoint's path never reaches the CSP, which takes origins
    only.
  - In production mode (`pages-config-cli.ts --production`, run by
    `.github/workflows/pages-prod-check.yml` before npm publishes), no new rule:
    the mode already requires `environment` `production` (`not-production`), and
    its validator pass then refuses a `solana` source on another cluster
    (`production-cluster`, Q10), as it refuses a quorum below 2. So a test
    cluster's entropy is refused before npm publishes and again at boot, under
    one rule and one code. Staging's `solana` source is cluster 101 as well, in
    a `preview` document (Q11): nothing in the kit treats 101 as
    production-only, and nothing requires another cluster on staging.
- **Present state until the slice lands**: no document carries the field, and
  every source is read as EVM.

Rejected, (b) inferring the kind from the number: no configuration change, but
it makes the protocol a consequence of a number rather than a pin, a number
which is also a valid EVM chain id elsewhere. The engine itself pins
`CHAIN_KIND` explicitly and cross-checks the cluster number; option (a) mirrors
it, and its cross-check is how the kit meets the backend's "must use the same
three numbers and the source name `solana`". An explicit kind cross-checked
against the reserved numbers fails a mistake at boot instead of at the first
round.

### 2. Cluster identity: the genesis hash

The EVM path proves an endpoint's chain with `eth_chainId`. Solana has no chain
id; a cluster is identified by its **genesis hash**, which `getGenesisHash`
returns as a base58 string.

- **Decided** (ADR-013, accepted 2026-11-20; the table is now in
  [the `shell` package](../../specs/client-kit/the-shell-package.md)): the kit
  pins the three clusters' genesis hashes **in code**, as a protocol constant
  keyed by the cluster number, and compares each endpoint's `getGenesisHash`
  with the pinned value, as a string, exactly:

  | Cluster number | Cluster      | Genesis hash                                   |
  | -------------- | ------------ | ---------------------------------------------- |
  | 101            | mainnet-beta | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
  | 102            | testnet      | `4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY` |
  | 103            | devnet       | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` |

  Sources (public): the Solana SDK's `ClusterType::get_genesis_hash` (the
  `solana-cluster-type` crate) gives all three; the CAIP-2 Solana namespace's
  references are their first 32 characters (mainnet-beta's
  `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` is also its CAIP-2 id); the backend
  confirmed mainnet-beta's on 2026-11-18. Each value decodes to exactly 32 bytes
  (section 5's vectors).

- **Why in code, not in configuration**: the configuration already pins the
  cluster by its number; the number-to-genesis map is the same in every
  environment, like the EIP-712 domain's `name` and `version`, which the kit
  also keeps in code. A second copy in the configuration could only disagree
  with the first, or let a mistyped document pair 101 with another cluster. The
  validated `SourceConfig` of a Solana source carries the derived `genesisHash`,
  so the readers take it from the configuration they were given, never from the
  table again.
- **The configuration does not carry it** (ADR-013).
- **Two copies, one test**: the shell needs the table and the verify page cannot
  import the shell (D-2), so each holds one
  (`packages/shell/src/solana-clusters.ts`,
  `apps/verify/src/solana-clusters.ts`), and a tools test holds both to this
  table, as `config-parity` holds the two validators to one verdict.
- **A reset of a test cluster** with a new genesis needs a kit release (and the
  engine's equivalent check). Production and staging both use 101; the testnet
  and devnet pins stay in the table for local or test use.
- **The engine has no cluster check of its own RPC today**; the backend endorses
  this one and will add the same genesis-hash check on its side.

### 3. The Solana tip check (W-26b)

The structure of W-26b stays: the same endpoints, the same quorum and degraded
mode (W-26a), the same per-call timeout and abort, the same "never drop an
outlier, never pick a side", the same record kept with the round (W-27), and the
same decision (`decideChain`) and bind rule. Only the calls, the readers, and
one pass change with the kind.

- **The calls**, to every configured endpoint of the source, both at once, each
  a JSON-RPC 2.0 POST of one call (never a batch):
  - `getGenesisHash` with `[]`;
  - `getSlot` with `[{ "commitment": "finalized" }]`. Never `processed` or
    `confirmed`: the kit compares with the final tip only.
- **No second pass** (Q6): the EVM check's `eth_getBlockByNumber` at `h_low` and
  its hash agreement are not made for Solana. At `finalized` a slot is rooted by
  a supermajority of the cluster and does not fork, and a lying endpoint cannot
  turn the check into a pass: the check takes the maximum of the final tips (a
  report below it is ignored, or lags and fails), and one above the honest tip
  makes the others lag and fails the round, a denial of service, never a passed
  check. The pass would cost a `getBlock` on the freshest finalized slot, which
  a load-balanced provider may not serve yet (-32004) and the check would turn
  into "could not verify the chain" and a required cancel. The block's content
  is the verify page's to check (section 4), and the backend serves no block
  value in the Snapshot to compare with. The shell therefore needs no base58
  decoder and no skipped-slot rule.
- **The readers** (untrusted results; anything else is no answer):
  - a genesis hash is a string of 32 to 44 characters from the base58 alphabet
    (section 5). It is compared with the source's pinned `genesisHash` as a
    string; a well-formed string that differs is **another cluster**;
  - a final slot is a JSON number that is a non-negative safe integer
    (`Number.isSafeInteger`), kept as a `bigint`.
- **Definitions**: `h_top` and `h_low` are the maximum and minimum final slots
  of the endpoints that gave one within the timeout.
- **The rule**, in W-26b's order, with W-26b's failure codes reused so the
  player's labels (W-48) and `decideChain`'s reasons do not change:
  1. `chain-id-mismatch`: an endpoint, answering or not, reported another
     cluster's genesis hash;
  2. `too-few-answered`: fewer than `minRpcQuorum` endpoints gave a final slot;
  3. `chain-id-unavailable`: an endpoint that gave a final slot gave no genesis
     hash;
  4. `lagging`: an answering endpoint's final slot is more than `tipLagMargin`
     slots below `h_top`.

  `hash-unavailable` and `hash-mismatch` never occur for a Solana source;
  `unknown-source` is unchanged.

- **The bind**, in slots, against the observed tip `h_top`: `future`, `N` MUST
  be above it (`N > h_top`); `tip`, `N` MUST NOT be older than it by more than
  the margin (`N ≥ h_top − tipLagMargin`). `bindHolds` is unchanged; only the
  unit is. The Wrapper keeps wiring `tip` until a contract carries the mode (the
  shell spec's provisional `bindMode`; Q5): an honest `tip` bind (the engine's
  latest finalized slot) and an honest `future` bind (above the tip) both pass
  it.
- **Timeouts and abort**: each call times out per W-43 (15 s by default) on the
  injected clock and gets its own abort signal, aborted when that call times out
  and never otherwise, exactly as `ask` does today; a late answer is ignored.
  There is one round of calls, so the check takes at most one timeout.
- **The evidence** (W-27), per endpoint in configuration order: its provider,
  the genesis hash it reported (or none), and its final slot (or none); for the
  check: the source, the kind, the cluster number, the pinned genesis hash,
  `h_top`, `h_low`, `tipLagMargin`, `tipCheck` (`independent` or `degraded`),
  whether it passed, and the failure. No URL, so no provider key, is ever
  recorded.
- **How the code extends without changing EVM**:
  - `RpcCall` (public) gains two members, so the Wrapper's transport and any
    other transport type-check both kinds:

    ```ts
    export type RpcCall =
      | { readonly method: "eth_chainId"; readonly params: readonly [] }
      | {
          readonly method: "eth_getBlockByNumber";
          readonly params: readonly [BlockTag, false];
        }
      | { readonly method: "getGenesisHash"; readonly params: readonly [] }
      | {
          readonly method: "getSlot";
          readonly params: readonly [{ readonly commitment: "finalized" }];
        };
    ```

    `RpcTransport` and `BlockTag` are unchanged. The Wrapper's
    `createJsonRpcTransport` already sends any call's `method` and `params` as
    given and resolves with `result`, so it needs no change of code: a Solana
    RPC uses the same JSON-RPC 2.0 envelope, and its JSON-RPC errors (answered
    with HTTP 200) still reject.

  - `runTipCheck` picks the reader by the validated source's `kind`. The EVM
    branch is today's code, and its tests stay as they are except for the added
    `kind` discriminant: `tip-check-calls.test.ts`'s whole-answer `toEqual`
    assertions and `chain-decision.test.ts`'s `TipCheckRecord` literals are the
    expected touch points. The Solana branch is a new module beside it
    (`tip-check-solana.ts`, with its readers in `solana-answers.ts`), reusing
    `ask`, the record's freezing, and the failure order.
  - The internal `TipCheckRecord` and `EndpointAnswer` become unions on `kind`:
    the EVM variants gain the discriminant `kind: "evm"` and nothing else.
  - `SourceConfig` and `ChainConfigIssueCode` change as section 1 says. These
    are public types: a changeset (minor) goes with the slice.

### 4. The verify page's block check (V-12, check 6)

D-1 holds as it is: the page reads block `N` from the chain itself, by a quorum
of the configured endpoints, under W-26a's and W-26b's rules, through its own
small read-only module (never `shell`), with no `h_low` pass and no lag margin.
For a Solana source:

- **Per endpoint**, both at once: `getGenesisHash` with `[]`, and `getBlock`
  with
  `[N, { "commitment": "finalized", "encoding": "json", "transactionDetails": "none", "rewards": false, "maxSupportedTransactionVersion": 0 }]`
  (the engine's options exactly).
- **The endpoint's value for `N`**:
  1. **A block at `N`**: the `getBlock` result is an object whose `blockhash`
     decodes to exactly 32 bytes (section 5), whose `previousBlockhash` also
     decodes to exactly 32 bytes (the engine requires it; the reader checks it
     for parity), whose `blockTime` is an integer (a block with a null or
     missing `blockTime` is refused, as the engine refuses it), and whose
     `parentSlot` is a non-negative safe integer below `N`. The value is that
     `blockhash`, written as `0x` and 64 lowercase hex.
  2. **`N` skipped**: `getBlock` answered a JSON-RPC error -32007 or -32009. The
     endpoint is then asked, in order:
     - `getBlocksWithLimit` with `[N, 1, { "commitment": "finalized" }]`: the
       result must be an array of exactly one non-negative safe integer `M` with
       `M > N`. An empty array is "not found" (no finalized block after `N`
       yet). `M ≤ N` contradicts the skip: an inconsistency, folded into
       **`ledger-gap`**;
     - `getBlock` with `[M, <the same options>]`, read as in step 1 with `M` in
       place of `N`, and its `parentSlot` MUST also be below `N`. A `parentSlot`
       at or above `N` means the endpoint has a block in `[N, M)` that it did
       not report: a **ledger gap**, and the endpoint serves no value. A -32007
       or -32009 from `getBlock(M)`, a slot the endpoint has just listed as a
       block, is an inconsistency and is refused, as the engine refuses it; it
       is folded into **`ledger-gap`** too.

     The value is `M`'s `blockhash`, and the record notes that it came from slot
     `M` because `N` was skipped. The skip path is sequential, and each of its
     calls (`getBlock(N)`, `getBlocksWithLimit`, `getBlock(M)`) has its own 15 s
     timeout. A timeout ends that endpoint's answer, so the calls after it never
     start: the worst case is 45 s, when the first two calls answer just before
     their deadlines and the third times out.

  3. **Not found**: -32004, -32001, -32014, or -32019 (long-term storage
     unreachable; the kit's own addition to the backend's not-found codes), on
     `getBlock` at `N` or at `M`, a `null` result, any other error, a timeout,
     or a result the readers refuse: the endpoint gives no value. The record
     keeps why (`not-available` for the four codes, `no-answer` otherwise, an
     empty `getBlocksWithLimit` included, as approved by the human on
     2026-11-20), never the error's message.
- **The quorum**, in this order, the first failure shown (W-26b's identity
  before completeness before content; a ledger gap is a fault of the provider's
  data, so it comes before completeness):
  1. `config`: as today, a configuration the Wrapper refuses at boot, or a
     source the configuration does not list; nothing is asked;
  2. `other-chain`: an endpoint, answering or not, reported another cluster's
     genesis hash;
  3. `ledger-gap` (new): an endpoint that gave the pinned genesis hash saw a
     ledger gap. It is shown even when fewer than `minRpcQuorum` endpoints gave
     a value, so a gap on one endpoint is never hidden behind `too-few`;
  4. `too-few`: fewer than `minRpcQuorum` endpoints gave a value;
  5. `no-chain-id`: an endpoint gave a value but no genesis hash;
  6. `no-block`: an endpoint gave the pinned genesis hash but no value (not
     found, pruned, or malformed);
  7. `hash-mismatch`: the values differ.

  Values are compared as 32-byte values (lowercase hex). Two endpoints that
  disagree on whether `N` was skipped give different values and fail as
  `hash-mismatch`.

- **The evidence's value**: when the verify API's `entropy.value` (the
  Snapshot's `blockValue`) is present it MUST equal the agreed value; when it is
  absent the agreed value is the one check 7 uses. Unchanged.
- **The display**: per endpoint, its genesis hash (as "this cluster", "another
  cluster", or "no answer") and its value, with "slot `N` was skipped; the value
  is the block at slot `M`" when it came from `M`, and the reason when there is
  none. The texts of `CHAIN_FAILURES` gain Solana wording ("genesis hash" for
  "chain id"), and `ledger-gap` its own: "An endpoint's ledger has a gap at slot
  N."
- **A round not ended**: as today, `too-few` and `no-block` are "not checked: it
  waits for the round's end"; every other failure, `ledger-gap` included,
  surfaces.
- **Old rounds and pruned history**: a provider that no longer holds slot `N`
  answers -32001 (cleaned up) or -32004. That endpoint gives no value, with the
  detail "this provider does not serve slot N" (neutral, as -32014 and -32004
  may also mean "not yet"; decided by the human on 2026-11-20, for all four
  not-found codes). With `minRpcQuorum` 2 and two endpoints, a round older than
  the shallower provider's history cannot reach the quorum, and the read fails
  as `too-few` (as `no-block` when enough other endpoints still give a value).
  On an ended round, today's rule holds (decided, Q14): check 6 is "could not be
  verified", with V-7's chain wording, "this round could not be verified against
  the chain", and "check again". It fails closed: never a pass, check 7 is not
  checked (it has no agreed value), except that an ended round missing a
  required reveal is a mismatch first, and the round never reaches V-6 on it.
  The remedy is the providers' history (section 6, P-5), on the backend's side:
  another provider the engine does not use with a full archive, or a paid
  archive plan; the kit's behavior does not change with it.
- **Check 7 needs no change**: the backend confirmed on 2026-11-18 that the
  kernel's seed is `SHA-256(value ‖ roundSecret)` over the 32 bytes of the value
  and the 32 bytes of the round secret, and `seedHash = SHA-256(seed)`, as for
  an EVM round. Check 2's target is recomputed with the source `solana` and the
  pinned cluster number by `signing`'s `hashRandomnessTarget`, unchanged.
- **Requests**: each Solana call goes through a call function that keeps the
  JSON-RPC error's `code` (the skip path needs it; today's `call` drops it), and
  is sent as the Wrapper's are: no credentials, no cache, no referrer, and no
  redirect (`redirect: "error"`), and only an HTTP 200 is an answer. The
  caller's abort signal ends every request of the read, the skip path's too, and
  rejects with an `AbortError`, as today. The EVM read is left exactly as it is
  (Q13: aligning it is a follow-up issue).
- **The code** (as built in slice 4; approved by the human on 2026-11-20):
  `block-check.ts` picks the reader by the source's kind, `chain-read.ts`'s
  unchanged `readBlockHashByQuorum` for `evm` and `chain-read-solana.ts`'s
  `readSolanaValueByQuorum` for `solana` (dispatching from `chain-read.ts` would
  make an import cycle, which lint refuses); `ChainReadConfig` is unchanged and
  the Solana read's `SolanaReadConfig` extends it with the genesis hash; new
  modules `chain-read-solana.ts`, `solana-call.ts` (the call that keeps the
  error's `code`), `solana-answers.ts`, and `base58.ts` in `apps/verify`, beside
  slice 1's `solana-clusters.ts`; `block-check.ts` shows the new details.
  `ChainReadFailure` gains `ledger-gap`.

### 5. base58

ADR-001 allows no new runtime dependency without an ADR, and no Solana library
is wanted near the Wrapper's origin (ADR-013), so the kit decodes base58 itself.

- **Placement**: `apps/verify/src/base58.ts`, the smallest one that keeps the
  package boundaries. Only the verify page decodes (a block value); the shell
  compares genesis hashes as strings and makes no block read (section 3). Not
  `signing` (its scope is the signatures and hashes of the protocol, and it is
  published), and not `contracts` (data only). If a later rule needs it in the
  shell, it moves to a package then, with a spec change.
- **The rule** (`decodeBase58Bytes32(text): Uint8Array | undefined`, never
  throwing): the alphabet is Bitcoin's 58 characters,
  `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`; a text that is
  not a string of 32 to 44 characters (the lengths of any 32 bytes) is refused
  before any arithmetic, so the work is bounded; any character outside the
  alphabet is refused; each leading `1` is one leading zero byte, and the rest
  is a base-58 integer, written big-endian with no leading zero byte; the result
  MUST be exactly 32 bytes, else refused. The encoding of 32 bytes is then
  unique, so equal strings and equal bytes are the same test.
- **Vectors** (computed by two independent implementations for this RFC; the
  slice's unit tests replay them, VT-13):

  | base58                                         | bytes (hex)                                                        | verdict    |
  | ---------------------------------------------- | ------------------------------------------------------------------ | ---------- |
  | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` | `45296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0` | 32 bytes   |
  | `4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY` | `3a132ece10305ec1830725502fa2b7e7eb8157e9123d4c1f654a71787161dc21` | 32 bytes   |
  | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` | `ce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab` | 32 bytes   |
  | `11111111111111111111111111111111`             | 32 zero bytes                                                      | 32 bytes   |
  | `11111111111111111111111111111112`             | 31 zero bytes, then `01`                                           | 32 bytes   |
  | `JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG` | 32 bytes of `ff`                                                   | 32 bytes   |
  | `JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFH` | `01` then 32 zero bytes                                            | refused 33 |
  | `4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofL`  | 31 bytes of `ff`                                                   | refused 31 |

  And refusals without arithmetic: the empty string, 31 and 45 characters, and
  each of `0`, `O`, `I`, `l`, `+`, `/`, a space, and a non-ASCII character in an
  otherwise valid text.

### 6. RPC endpoints a player's browser may call

Normative for every endpoint of a production Solana source (and for staging's or
preview's, where those use Solana). The infrastructure owner checks them before
an endpoint enters a configuration document; the runbook gets the checklist
(slice 7).

- **P-1. CORS.** The endpoint answers the CORS preflight of a POST with
  `content-type: application/json` (not a "simple" request, so the browser
  always sends `OPTIONS` first) from the Wrapper's and the verifier's origins:
  `Access-Control-Allow-Origin` that origin (or `*`: the kit sends no
  credentials), `Access-Control-Allow-Methods` with `POST`, and
  `Access-Control-Allow-Headers` with `content-type`; and the POST's own
  response carries `Access-Control-Allow-Origin`.
- **P-2. HTTP.** JSON-RPC 2.0 over HTTP POST, one call per request (the kit
  sends no batch), no WebSocket. Every JSON-RPC answer, a JSON-RPC error
  included, is HTTP 200 with the error's `code` in the body (the verify page
  reads -32007 and -32009 from it), and never a redirect: the Wrapper refuses
  any other status and any redirect (`redirect: "error"`), and so do the verify
  page's Solana reads.
- **P-3. Authorization.** The browser is authorized **either** by an
  Origin-restricted key in the URL **path**, **or** by an Origin allowlist on a
  tokenless endpoint; **never** by a key in a query string or a fragment, which
  the configuration's URL rule refuses (so a provider whose only key form is a
  query parameter cannot be used as is).
  - A tokenless endpoint is a bare `https://host`, with or without a trailing
    slash: both validators accept it, and `PAGES_RPC_ORIGINS` takes its origin
    unchanged. Some providers turn their Origin check off when a token is in the
    path, so the form is the provider's.
  - The URL is in the public `environment-config.json`, so a key in it is public
    by design: a quota credential, never a secret. It MUST be a key for the
    browser only, separate from any key the engine uses, restricted by `Origin`
    to the Wrapper's and the verifier's origins, with a rate or spend cap on the
    provider's side. An allowlist on a tokenless endpoint names the same two
    origins.
  - Never restricted by `Referer`: the kit sends no referrer (the Wrapper's
    `referrerPolicy: "no-referrer"` on each request, the verify page's
    `Referrer-Policy: no-referrer`), so a Referer allowlist refuses every call.
  - `Origin` is enforced only by browsers: a script outside a browser can send
    any value. It is a **quota control, not integrity**. The integrity of the
    tip check rests on the quorum and its maximum rule (section 3), and that of
    check 6 on the quorum's agreement (section 4), never on who may call an
    endpoint.
  - A key never appears in the repository, an issue, a pull request, a log, or
    the recorded evidence; the CSP and `PAGES_RPC_ORIGINS` hold origins only.
- **P-4. Methods.** `getGenesisHash`; `getSlot` at `finalized`; `getBlock` (with
  section 4's options) and `getBlocksWithLimit`, both at `finalized`; with the
  JSON-RPC error codes of the Solana validator's RPC (-32001, -32004, -32007,
  -32009, -32014, -32019).
- **P-5. History** (a production requirement; decided, Q15). The verify page
  checks rounds back to at least the operator's dispute window, and never less
  than 90 days, so each browser endpoint serves finalized `getBlock` and
  `getBlocksWithLimit` for every slot back that far; se-backend#375's provider
  check confirms it. A full archive covers any round the Wrapper's verify link
  (W-39) points at. The verify page's reach is the **shallower** provider's:
  with `minRpcQuorum` 2, a round older than it cannot reach the quorum and shows
  section 4's "could not be verified". A provider that falls short is replaced
  or upgraded on the backend's side (another provider the engine does not use
  with a full archive, or an archive plan); the kit does not change for it.
- **P-6. Independence.** At least two endpoints per Solana source in production
  (`minRpcQuorum` of at least 2, W-26a's boot rule), run by different
  organizations on separate infrastructure (W-26b), and none of them the
  provider its own environment's engine reads (section 1; the backend's Shell
  bind check: independent RPCs exclude the engine's own; decided by the code
  owner on 2026-11-18). The kit cannot see the engine's provider, so this one is
  the infrastructure owner's to keep, and the runbook's checklist names it.
- **P-7. The policies.** Each endpoint's origin is in `PAGES_RPC_ORIGINS`
  (exactly the origins of `PAGES_RPC_ENDPOINTS`' URLs), passes the headers
  step's `origin` pattern, and so reaches both sites' `connect-src`; nothing
  else changes in the policies.

**Pending verification before production** (no keys exist yet; decided, Q2: no
production document lists a provider before it passes P-1 to P-6): P-1 for both
providers, and whether each offers an Origin allowlist (P-3); the second
provider's P-1 to P-6 once it is chosen; P-2's HTTP status for JSON-RPC errors
for both; and each provider's history against P-5's depth, in se-backend#375.
<!-- TODO(hosting, se-backend#375): verify P-1 to P-6 for both browser providers with their browser keys, from the Wrapper's and the verifier's origins, before production's document lists them. -->

### 7. The Snapshot and the verify API

What the kit reads does not change, and the vendored contracts already allow a
Solana round:

| Field                                                    | Contract                                             | Solana                                                      |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `proofs.randomnessProof.source` (Snapshot, Play API)     | pattern `^[a-z0-9][a-z0-9:_-]{0,63}$`                | `solana` matches                                            |
| `proofs.randomnessProof.blockNumber`                     | integer, minimum 0, no maximum                       | the slot; read as a safe integer (slots are far below 2^53) |
| `proofs.randomnessProof.blockValue`                      | `Hash32`, `0x` and lowercase hex, optional           | not served today; the shell never reads it                  |
| `proofs.createRoundAuth.entropyChainId`                  | integer 1 to 2^53 − 1                                | 101, 102, or 103                                            |
| verify API `entropy.source`, `chainId`, `block`, `value` | string; int64 from 0; int64 from 0; `Hex32` optional | `solana`; the cluster; the slot; the value, once closed     |

- No contract sync is needed for this RFC. The backend's slice now starting adds
  "slot on Solana" to the descriptions of `blockNumber` and `entropy.block`;
  that sync is descriptions only, regenerates the types' comments, and changes
  no code.
- **Solana vectors: `entropy/solana/v1`** (decided, Q3). No vendored vector has
  a Solana round today (none of the signature and Snapshot vectors uses the
  source `solana`; they use `ethereum:block`, and one signing vector
  `evm-randao`), so the e2e suite cannot play a Solana config round yet (W-26
  check 3 recomputes `randomnessTarget` from the source and the pinned cluster).
  The backend publishes a new contract set, **`entropy/solana/v1`**, through its
  contracts manifest in a backend slice, with real mainnet slots:
  - a base58 `blockhash` and its `0x` value;
  - a skipped slot: `getBlock` answers -32007, then `getBlocksWithLimit`, then
    the next block's value;
  - a ledger gap, refused;
  - a hash that is not 32 bytes, refused;
  - -32004, not found;
  - the seed, `SHA-256(value ‖ roundSecret)`.

  The Solana Snapshot and signature vectors (source `solana`, a cluster number,
  a slot, signed by the public test key) come in the same backend slice. The kit
  vendors them as it vendors every contract: copied into `contracts`, on its
  test-only entry, each file pinned in `contracts.lock.json` with its source
  commit and content hash (section 9, slice 6). The Solana browser test (T-42)
  and the reader's unit tests (VT-14) replay them once vendored; until then the
  tests use recorded or synthetic answers.

### 8. Tests

Deterministic and hermetic, as every test (no real network, no real clock).
Recorded answers, where the slice records them from a real provider, are
committed as plain JSON results with no URL and no key.

| Row   | Level                   | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-39  | unit, `shell` and tools | the configuration: `entropyChainKind` required per source and only for those; `evm` and `solana` only; each cross-check (`solana` with 100 and 104, `evm` with 101 to 103, a `solana` source keyed otherwise, a source keyed `solana` of kind `evm`) refused at its field, never naming a value; a Solana source carries its cluster's genesis hash; the verify page's validator gives the same verdicts (`config-parity`); the two genesis tables equal section 2's; the Pages tool's `CHAIN_PIN_FIELDS`; `production-cluster` in both validators (a `production` document with a `solana` source on 102 or 103 refused at `entropyChainId.<source>` and on 101 accepted, a `preview` or `local` one accepted on any of the three, and the Pages tool's production mode refusing it through its validator pass); a document with an `evm` and a `solana` source (staging's shape) is valid, each source held to its own rules, a source with fewer endpoints than `minRpcQuorum` refused at that source, a second `solana` source refused; and, until slices 2 and 4, slice 1's guards: a `solana` source's tip check asks no endpoint and fails as `unsupported-chain-kind`, decided `chain-unverified`, and the verify page's check 6 asks no endpoint and is "could not be verified" (`unsupported-chain-kind`), an `evm` source beside it read as before |
| T-40  | unit, `shell`           | the Solana tip check against a scripted transport and a manual clock: the calls are exactly `getGenesisHash []` and `getSlot [{ commitment: "finalized" }]`, at once, and nothing else; a quorum that agrees passes; another genesis hash fails as `chain-id-mismatch`, from an endpoint that gave a slot and from one that gave none; a malformed genesis hash or slot (a string, a negative, a fraction, above 2^53 − 1) is no answer; too few; an answering endpoint with no genesis hash; lagging by `tipLagMargin` + 1 slots fails and by `tipLagMargin` passes; a JSON-RPC error and a rejection are no answer; a timeout aborts that call's signal only; the record (section 3's fields, no URL); the bind in slots (`tip`: `N` = `h_top` − margin passes, one less fails; `future`: `N` = `h_top` fails, + 1 passes); with an `evm` and a `solana` source configured, a round of each source makes only its own kind's calls, to its own endpoints; every existing EVM tip-check test passing, unchanged except for the added `kind` discriminant (`tip-check-calls.test.ts`'s whole-answer `toEqual`, `chain-decision.test.ts`'s `TipCheckRecord` literals)                                                                                                                                                                                          |
| T-41  | unit, Wrapper           | the JSON-RPC transport carries a Solana call's `params` (an object inside the array) as given, resolves a JSON number `result`, and rejects a JSON-RPC error answered with HTTP 200, a status other than 200, and a redirect; the Wrapper's validator takes `entropyChainKind` (`ENVIRONMENT_CONFIG_FIELDS`); the "could not verify the chain" and "failed verification" texts for a Solana source's failures are W-48's labels, unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T-42  | e2e, browser            | a Solana config round against the e2e fake Solana RPC: two agreeing endpoints pass and the round reaches `ready`; another genesis hash on one endpoint, and one endpoint silent with a quorum of 2, each fail with T-19's required cancel. Replays the vendored Solana Snapshot and signature vectors, with the fake Solana RPC answering from `entropy/solana/v1`'s mainnet slots (slice 6); until they are vendored the row is pending and T-40 covers the check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| VT-13 | unit, verify page       | base58 (section 5): every vector of its table and every refusal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VT-14 | unit, verify page       | the Solana chain read against a fake endpoint set and a fake clock, replaying `entropy/solana/v1` once vendored (its blockhash, skipped-slot, ledger-gap, non-32-byte, and -32004 cases, and its seed through check 7) and recorded or synthetic answers until then: the calls and their exact options; with an `evm` and a `solana` source configured, a round of each reads only its own source's endpoints with its own kind's calls; a block at `N`; `N` skipped by -32007 and by -32009, with `getBlocksWithLimit` and `getBlock(M)`, the value `M`'s; a ledger gap by `parentSlot ≥ N`, by `M ≤ N`, and by -32007 from `getBlock(M)`; a `previousBlockhash` that is not 32 bytes; a timeout at each of the skip path's three calls separately (each ends the endpoint's answer) and the worst case (the first two calls answering just before their 15 s deadlines, the third timing out); an empty `getBlocksWithLimit`; -32001, -32004, -32014, and -32019; a null `blockTime`; a `blockhash` of 31 and 33 bytes; another genesis hash; the failure order of section 4 (one case per failure); two endpoints that disagree on the skip; `entropy.value` equal, different, and absent; a round not ended; the abort during the skip path; the requests' options (no redirect, no referrer, only 200); the EVM read's existing tests unchanged          |
| VT-15 | e2e, browser            | the verify page against the e2e fake Solana RPC and the fake verify API: a Solana book round (built by the harness from the fake chain's value and a round secret, so checks 5 to 7 hold) reaches V-8's book reason; the same round with `N` skipped; an endpoint answering -32001 makes check 6 "could not be verified" with V-7's chain wording and the pruned detail (Q14); on one document with an `evm` and a `solana` source, a round of each verifies against its own fake endpoints; the policy allows the fake endpoints' origins only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**The e2e fake Solana RPC** (`e2e/tests/harness/fake-solana-rpc.ts`): a
Playwright route per configured endpoint, as `fake-rpc.ts` is for EVM, answering
`getGenesisHash`, `getSlot`, `getBlock`, and `getBlocksWithLimit` from a
scripted ledger (slots, skipped slots, block values; `entropy/solana/v1`'s
recorded mainnet answers once vendored), with the CORS headers and the preflight
answered, HTTP 200 for every JSON-RPC error, and behaviors `agree`,
`other-cluster`, `error`, `lagging`, `skip` (N skipped), `gap` (a ledger gap),
and `pruned` (-32001). A call it does not know is recorded as unexpected and
fails the test. A second harness configuration document keys the source
`solana`, kind `solana`, cluster 101, and a lag margin of the harness's
choosing; a third lists an `evm` and a `solana` source, as staging does during
its switch. The EVM fake stays as it is, and so do the two EVM documents, except
for their `entropyChainKind` entry (slice 1): `environmentConfig`, keyed `base`,
gains `{ "base": "evm" }`, and `roundEnvironmentConfig`, which re-keys by
`pins.source` (`ethereum:block`), gains `{ [pins.source]: "evm" }`.

### 9. The slices after this RFC

Each is one pull request, follows the agent workflow (implementer, human review,
reviewer), writes its rules into the specs in the same change, and keeps
`pnpm check` green.

1. **The configuration and the chain kind** (section 1): the shell's and the
   verify page's validators with `production-cluster`, the Wrapper's field list,
   the two genesis tables, the Pages tool's `CHAIN_PIN_FIELDS`, the fixtures,
   the e2e harness's two EVM documents (`environmentConfig` and
   `roundEnvironmentConfig`, section 8), the Wrapper's Configuration tables and
   W-26b's text, the shell spec, and a changeset. T-39. The release runbook in
   the same change (AGENTS.md mandatory action 4): its `PAGES_CHAIN_PINS` field
   list, which says "exactly" six fields today, gains `entropyChainKind`, with
   `{ "anvil": "evm" }` on staging; and Q12's migration procedure (Migration):
   the secret updated right before the merge, with no merge in between, and what
   a failed configuration job means then. Until slices 2 and 4, a `solana`
   source fails closed and calls no endpoint: the tip check fails as
   `unsupported-chain-kind` (decided `chain-unverified`; the required cancel
   follows once `T_0` is settled), and the verify page's check 6 is "could not
   be verified" (`unsupported-chain-kind`). T-39 tests both guards.
2. **The shell's Solana tip check** (section 3): `RpcCall`, the readers, the
   Solana branch of `runTipCheck`, the record union; W-26b and the shell spec
   written in; a changeset. T-40. It removes the tip check's
   `unsupported-chain-kind` guard, and slice 4 the verify page's.
3. **The Wrapper's Solana transport** (section 3): the transport's tests for
   Solana calls, and any wiring the shell's change needs at boot; no change of
   the transport's code is expected. T-41. Small: the reviewer may fold it into
   slice 2.
4. **The verify page's Solana block check** (sections 4 and 5): base58, the
   Solana read with the error codes, the display, the request options; V-12's
   check 6, D-1's text, and the test plan written in. VT-13, VT-14.
5. **The e2e fake Solana RPC** (section 8): the harness, the second and third
   documents, VT-15, and T-42 once the backend's Solana vectors are vendored
   (slice 6).
6. **Vendor `entropy/solana/v1`** and the Solana Snapshot and signature vectors
   (section 7; decided, Q3), once the backend's slice publishes them through its
   contracts manifest: the files copied into `contracts` on its test-only entry,
   a group per set in `tools/contracts-groups.ts`, and each file pinned in
   `contracts.lock.json` with its source commit and content hash; VT-14 and
   VT-15 then replay `entropy/solana/v1`, and T-42 leaves pending. In the same
   slice, the lists of the contracts the kit may copy gain `entropy/solana/v1`
   (proposed here; this RFC edits none of them): AGENTS.md's Non-Negotiables
   ("Contracts are documents, never code") and its Public repository section,
   and its list of the test-only entry's consumers (the e2e fake Solana RPC
   joins the e2e fake Play API);
   [the `contracts` package](../../specs/client-kit/the-contracts-package.md);
   [how the kit gets its contracts](../../specs/client-kit/how-the-kit-gets-its-contracts.md);
   [the contracts drift job](../../specs/client-kit/the-contracts-drift-job.md);
   the client kit spec's References; the release runbook's list of what may be
   copied; and `.ai/memories/overview.md`. If the Solana signature vectors,
   signed by the public test key, land outside
   `src/vectors/snapshot/signed-action/`, AGENTS.md's test-key exception, in its
   Non-Negotiables and in its Public repository section, must name the new path
   too. If the set lands before slice 4 or 5, it folds into that slice instead.
   **Dependency**: this slice serializes with RFC-006's S2 (vendoring
   `key-delegation/v1` into `contracts`, on RFC-006's unmerged branches): one
   merges after the other, never in parallel, and the one that merges second
   rebases onto the other's AGENTS.md lists, `contracts.lock.json`, and
   `tools/contracts-groups.ts`.
7. **Release and runbook**: `PAGES_RPC_ENDPOINTS` for Solana (the field list of
   `PAGES_CHAIN_PINS` is slice 1's), the provider checklist of section 6 (P-1 to
   P-7, run with the browser keys from both origins), a browser key's rotation
   (the old key stays valid until every session opened before the redeploy has
   ended: the Wrapper reads its configuration once, at boot), the procedure for
   **adding** a Solana source beside an existing one on staging (kind `solana`,
   cluster 101, a `tipLagMargin` of 64 slots, the existing source kept until
   step 8's fourth sub-step, staging keys Origin-locked to staging's origins),
   step 8's five-step order with its canary, and the release dry run's fixtures.

Two steps follow that are operations, not pull requests (a finding in either
comes back as a pull request through the same workflow):

8. **Staging on Solana mainnet-beta** (decided, Q11; a dependency on the backend
   and the infrastructure owner). Staging's one engine moves from Somnia to
   Solana mainnet-beta (cluster 101), the same chain as production. Its `solana`
   source is kind `solana`, `entropyChainId` 101 (the mainnet genesis hash),
   `tipLagMargin` 64 slots, provisional, with staging keys on two independent
   providers that staging's own engine does not read (an environment's browser
   endpoints never include the provider its own engine reads, so staging's pair
   may differ from production's), Origin-locked to staging's origins. In this
   order (slice 7 writes it into the release runbook):
   1. the kit's Solana reader ships to staging: slices 1 to 7 are deployed;
   2. the infrastructure owner adds the `solana` source to staging's secrets
      **beside** `anvil` (Somnia: kind `evm`, `entropyChainId` 50312, its one
      endpoint, 100 blocks), each `solana` endpoint passing P-1 to P-4 from
      staging's origins, then redeploys. `minRpcQuorum` stays 1. No round names
      `solana` yet, so nothing changes for players; the configuration only has
      to be in place before the first Solana round;
   3. the backend's switch and drain, in se-backend#548 (planned for 2026-11-30
      to 2026-12-03, after the kit's reader is on staging): the backend's fix,
      the drain of staging's rounds in flight, then the switch of the engine to
      mainnet-beta;
   4. `anvil` is dropped from staging's document and `minRpcQuorum` raised to 2,
      like production: one configuration change, then a new deploy run. Rounds
      from before the switch then show as not matching on staging's verify page:
      check 2 fails for a source the configuration does not list (V-7), and
      check 6 cannot be verified. That is accepted for staging (Q16);
   5. the canary starts.

   Staging stays degraded (`minRpcQuorum` 1), as it is today, until step 4;
   between steps 2 and 4, W-26a's indicator is on both of its sources.

   **Acceptance: the canary** (the gate before production). After step 4, on
   staging at `minRpcQuorum` 2, the client kit's engineer runs at least 100 Coin
   Flip config rounds on `solana`, over at least 24 hours; a Cash or Crash round
   is neither counted nor restarts the count. A round counts only when its tip
   check passed and the verify page later shows it as matching (V-6). Any other
   outcome of a Coin Flip round, a failed tip check or a verify page that shows
   a mismatch or "could not be verified", restarts the count once its cause is
   found and recorded, and so does a change of provider; a browser key's
   rotation on the same provider does not. The record (round ids, outcomes,
   failure codes, causes, and restarts; never a URL, a key, or a hostname) is
   kept in a public tracking issue of this repository, opened at step 5, and
   #235 links its result (decided by the code owner on 2026-11-19 and
   2026-11-20).
   <!-- TODO(backend and infrastructure, Q11): staging's mainnet-beta source: the staging keys on two providers staging's own engine does not read, Origin-locked to staging's origins; the backend's fix, drain, and switch (se-backend#548, planned 2026-11-30 to 2026-12-03); then the change that drops `anvil` and raises `minRpcQuorum` to 2; then the canary's result. -->

9. **Production's first document** (decided by the code owner, 2026-11-18): the
   publish path (se-client-kit#154) stays off until slice 1 is merged and both
   Solana browser providers pass P-1 to P-6, and production's first document
   waits for step 8's canary to pass. Production's `pages-prod-config` then gets
   its first document, Solana-only (the one source `solana`, cluster 101, two
   endpoints, the `tipLagMargin` of 64 slots, provisional (Q1), or the backend's
   measurement if it has landed), with no interim document before it. A
   production round passes the tip check only on a release that carries the
   Solana tip check (slices 2 and 3). Once production runs on Solana, this RFC
   is archived.

## Alternatives

- **Infer the kind from the cluster number** (section 1, option b): no
  configuration change; rejected there.
- **A Solana library** (`@solana/web3.js`, `@solana/kit`, or a base58 package):
  less code to write, but a large dependency tree on the origin that holds the
  player's key, for four read-only calls and one decoder. Rejected (ADR-013,
  ADR-001).
- **The genesis hash in the configuration** (beside, or instead of, the cluster
  number): rejected in section 2; it moves a protocol constant into a
  per-environment value.
- **Keep W-26b's `h_low` pass for Solana** (`getBlock` at `h_low`, the
  `blockhash` strings compared): rejected (Q6). It costs a call, and turns a
  provider that has not yet served its freshest finalized block into "could not
  verify the chain" and a required cancel, for no protection the maximum rule
  does not already give (section 3).
- **Show check 6 as "not checked" for a round older than the providers'
  history**, with the verdict V-8: rejected (Q14); today's "could not be
  verified" fails closed.
- **One shared Solana reader for the shell and the page** in a package both may
  import: the page cannot import `shell` (D-2), and the two reads differ (a
  final slot against a block value with the skip rule); only the genesis table
  is shared, by a test.

## Tradeoffs

- One more required configuration field, in every environment's document,
  migrated once.
- Two copies of the genesis table, held together by a test.
- A hand-written decoder and readers to maintain; small, specified, and pinned
  by vectors.
- No `h_low` pass on Solana (Q6): the shell checks that its endpoints are on the
  pinned cluster and agree on the tip, not that they agree on a block's content,
  which the verify page checks after the round.
- The independence of the tip check rests on the two providers of P-6; a further
  provider would add a margin and is not required.
- The verify page reaches back only as far as the shallower provider's history
  (P-5).
- Until `entropy/solana/v1` and the Solana round vectors are vendored (slice 6),
  the Wrapper's Solana path is proven by unit tests and by staging's canary on
  mainnet-beta (Q11), not by a browser test in CI.
- Staging stays degraded (`minRpcQuorum` 1), as today, until step 4 of its
  switch, on both of its sources from step 2; the canary runs at quorum 2, like
  production (Q16).
- Once `anvil` is dropped, staging's rounds from before the switch show as not
  matching on its verify page, check 2 failing for an unlisted source (accepted
  for staging, Q16).
- Staging's switch depends on the backend (se-backend#548) and the
  infrastructure owner, and production's first document waits for its canary.

## Impact

- **Specs**:
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md)
  (W-26b: the Solana calls, readers, failures, units, and the evidence; W-26:
  nothing, check 3 already pins the cluster number);
  [the Wrapper spec](../../specs/wrapper.md) (Configuration: the field, its
  schema row, the staging and production paragraphs, the RPC providers; the test
  plan T-39 to T-42); [the client kit spec](../../specs/client-kit.md) (the
  Pages sites' configuration: `PAGES_CHAIN_PINS`, the production rule;
  environment configuration);
  [the `shell` package](../../specs/client-kit/the-shell-package.md) (the chain
  configuration, the tip check, `RpcCall`);
  [the verify page](../../specs/verify-page.md) (V-3, V-12 check 6, D-1's text,
  the e2e fake, VT-13 to VT-15);
  [testing and CI](../../specs/client-kit/testing-and-ci.md) (the fake Solana
  RPC).
- **Code**: `packages/shell` (`chain-config.ts`, `config-fields.ts`,
  `rpc-transport.ts`, `tip-check.ts`, new `tip-check-solana.ts`,
  `solana-answers.ts`, `solana-clusters.ts`); `apps/wrapper`
  (`environment-config.ts`'s field list, `pages-config.ts`,
  `pages-config-rules.ts`); `apps/verify` (`environment-config.ts`,
  `chain-read.ts`, `block-check.ts`, new `chain-read-solana.ts`,
  `solana-answers.ts`, `base58.ts`, `solana-clusters.ts`); `e2e/tests/harness`;
  `tools` (parity tests). No package boundary moves.
- **Public API**: `shell`'s `RpcCall`, `SourceConfig`, and
  `ChainConfigIssueCode` (changesets).
- **Dependencies**: none (ADR-001, ADR-013).
- **Size budget**: a few hundred bytes in the Wrapper (two calls, two readers,
  the table); the decoder and the skip rule in the verify page, under its own
  budget (D-3).
- **Security**: no credential is near a Solana read: the shell's transport sends
  none and the page holds none. Provider keys are public by design (P-3) and
  never logged or recorded. Untrusted results are read by strict readers; any
  disagreement fails closed; nothing is retried in a way that could pick a side.
- **Telemetry**: none. Nothing logs, and the evidence and the page's details
  hold provider names, never URLs.

## Migration considerations

- **The required field**: the Wrapper and the Pages tool that require
  `entropyChainKind` refuse a document or a `PAGES_CHAIN_PINS` without it, and
  today's tool refuses one with it (`CHAIN_PIN_FIELDS` is closed). Staging is
  the only deployed document; production has none yet. Decided (Q12): one step,
  staging's `PAGES_CHAIN_PINS` updated with
  `"entropyChainKind": { "anvil": "evm" }` right before slice 1 merges, with no
  other merge between. A configuration job that fails in that window means the
  secret and the code disagree (one has landed without the other): the job stops
  the deploy before anything is uploaded, the deployed site stays as it was, and
  the deploy is started again as a new run on the merged revision once both have
  landed (a rerun of the failed job reuses its old commit and validator). Slice
  1 writes this procedure into the release runbook, with the field list.
- **The backend's preview stack** serves its own document to the kit's preview
  e2e run (T-10 to T-12); it adds the field when its kit pin moves past slice 1.
- **Sessions already open** keep the configuration they booted with (the Wrapper
  reads it once).
- **EVM rounds** are unaffected: the same calls, readers, records (plus the
  `kind` discriminant), failures, and texts. One validation change: a source of
  kind `evm` whose `entropyChainId` is 101, 102, or 103, and a source keyed
  `solana` of kind `evm`, are now refused (`entropy-chain-kind-mismatch`,
  section 1). No deployed document has either: staging's one source is `anvil`,
  at 50312.
- **Staging's switch to mainnet-beta** (Q11, Q16; section 9, step 8) comes after
  slices 1 to 7, in step 8's order: the kit's reader; the `solana` source
  (cluster 101) added to staging's secrets (`PAGES_RPC_ENDPOINTS`,
  `PAGES_RPC_ORIGINS`, and `PAGES_CHAIN_PINS`) beside the Somnia source, at
  `minRpcQuorum` 1; the backend's switch and drain (se-backend#548); then
  `anvil` dropped and `minRpcQuorum` raised to 2, in one configuration change
  and a new deploy run; then the canary. Staging stays degraded, as today, until
  the fourth of those steps. Once `anvil` is dropped, staging's rounds from
  before the switch show as not matching on its verify page (check 2 fails for
  an unlisted source), which is accepted for staging. Staging is `preview`, so
  `production-cluster` does not apply to it; its `solana` source is cluster 101
  anyway.
- **Production's secrets and the publish path** (decided by the code owner,
  2026-11-18): the publish path (se-client-kit#154) stays off until slice 1 is
  merged and both Solana browser providers pass P-1 to P-6, and production's
  first document waits for step 8's canary (Q11). Production's
  `pages-prod-config` then gets its first document, Solana-only, with the Solana
  `tipLagMargin` of 64 slots, provisional (Q1); there is no interim document
  (section 9, step 9).

## Decisions

- **2026-11-10, the backend's TPO**: the Solana semantics of section 0, as the
  backend's Solana entropy spec and its Shell bind check state them.
- **2026-11-18, the human owner** (#235): production's entropy is Solana
  mainnet-beta, and the kit gets Solana support for INC1.
- **2026-11-18, the backend** (answers read at se-backend `4a49ab9d`):
  - the Snapshot serves `source`, `blockNumber` (the slot), and
    `roundSecretHash` (and `roundSecret` on `won` or `lost`); `blockValue` and
    `blockExplorerUrl` are not served, so the tip check uses `N` only;
  - the verify API's `entropy` is `{ source, chainId, block, value }`, `value`
    in lowercase hex once the round is closed with a seed;
  - check 7's seed and `seedHash` are unchanged from EVM, so check 7 consumes
    the decoded 32 bytes as it does an EVM block hash;
  - the engine has no cluster check of its own RPC; it endorses the kit's
    genesis-hash pin and will add the same check on its side;
  - the providers for production are chosen in se-backend#375; the browser makes
    few calls (one tip check per config round, and the verify page's reads), so
    rate limits are not a concern.
- **2026-11-18, the code owner, on the providers**: the browser's two
  independent Solana RPCs are **two independent providers the engine does not
  use, chosen in se-backend#375**. The provider the engine reads Solana through
  is excluded from the browser's list while the engine uses it; the backend's
  Shell bind check stays as written (independent RPCs exclude the engine's own).
  Section 6 (P-6) states it. Their names are configuration, never written here
  ([wrapper.md](../../specs/wrapper.md#configuration)).
- **2026-11-18, the code owner, on this RFC's questions** (numbered as the draft
  asked them; the sections above point at these numbers):
  - **Q1. `tipLagMargin` for Solana**: required per source, in slots, with no
    default in code. The configured value is **64 slots, provisional** (the
    backend's answer, decided by the code owner on 2026-11-18): about 13.7 s,
    from about 1.4 s of the engine's tip staleness plus about 10 s from the bind
    to the shell's first read of the round, about 53 slots at 0.214 s, rounded
    up. The backend's measurement on the contracted providers (se-backend#471)
    still follows and replaces it. It is kept as small as the measurement
    allows: a `tip` bind may name any of that many past slots.
    <!-- TODO(backend, se-backend#471): replace the provisional 64 slots with the measurement on the contracted providers. -->
  - **Q2. The production providers**: no production document lists a Solana
    provider until P-1 to P-6 pass with its browser key from both origins.
  - **Q3. Solana vectors**: the backend publishes a new contract set,
    `entropy/solana/v1`, through its contracts manifest, with real mainnet slots
    (a blockhash to its value, a skipped slot, a ledger gap refused, a hash that
    is not 32 bytes refused, -32004 as not found, and the seed), and the Solana
    Snapshot and signature vectors in the same backend slice. The kit vendors
    and lock-pins them like every other contract (section 7; section 9, slice
    6), and its lists of the contracts it may copy gain the set in that slice.
    Until they are vendored, the tests use recorded or synthetic answers.
  - **Q4. Check 7**: unchanged (the backend's answer above).
  - **Q5. `bindMode`**: `tip` only for INC1; the Wrapper keeps wiring `tip`. For
    the day a contract carries the mode: on Solana an honest `future` bind sits
    about 54 slots (22 + 32) above the final tip, so the strict `future` rule
    fails it once the shell's check comes more than about 11.5 s after the bind;
    that rule then needs the check to run promptly, or a margin of its own.
  - **Q6. W-26b's `h_low` pass**: dropped for Solana (section 3).
  - **Q7. The source name**: a `solana` source is keyed `solana`, and a source
    keyed `solana` is of kind `solana` (section 1).
  - **Q8. Book rounds**: W-52 stays; no tip check runs on a book round in INC1.
    The backend's "detection only for a book round" is a later RFC.
  - **Q9. #235's acceptance criterion** reads "stale": a config round whose `N`
    is older than the final tip by more than `tipLagMargin` fails, and the check
    compares with the `finalized` tip, never `processed`; an `N` above the final
    tip passes the `tip` rule, as W-26b and the backend's Shell bind check
    state. #235's criterion is updated to say so.
  - **Q10. Production's cluster rule**: both validators refuse a `production`
    document with a `solana` source that is not cluster 101
    (`production-cluster`, section 1), so the rule runs at boot and in the Pages
    tool's production mode (moved there from the Pages tool alone by the code
    owner's review of 2026-11-19). Staging's `solana` source is cluster 101 too,
    in a `preview` document: nothing treats 101 as production-only, and nothing
    requires another cluster on staging.
  - **Q11. A Solana source before production** (changed by the code owner on
    2026-11-18, from devnet to mainnet-beta): staging's Solana source is
    **mainnet-beta, cluster 101**, the same chain as production, so the Solana
    path runs end to end, the Wrapper's tip check and the verify page's check 6,
    against the real chain and providers before production. Staging's pins are
    `entropyChainKind.solana` `solana`, `entropyChainId.solana` 101 (the mainnet
    genesis hash), and `tipLagMargin.solana` 64, provisional. Its endpoints are
    staging keys on two independent providers that staging's own engine does not
    read, Origin-locked to staging's origins: an environment's browser endpoints
    never include the provider its own engine reads, so staging's pair may
    differ from production's (code owner, 2026-11-18). The backend switches
    staging's engine in se-backend#548, planned for 2026-11-30 to 2026-12-03,
    after the kit's reader is on staging. The gate before production is a canary
    on staging: at least 100 config rounds over at least 24 hours, each passing
    the tip check and then matching on the verify page, any other outcome
    restarting the count (section 9, step 8), run by the client kit's engineer;
    production's first document waits for it. The testnet and devnet pins stay
    in the kit for local or test use. Section 9's step 8, and Migration.
  - **Several entropy sources, of different kinds, at once** (follows from Q11):
    the configuration supports them, each round is read by its own source's
    kind, and the validator's rules and the production rules hold per source
    (section 1). There is no quorum per source.
  - **Q12. The migration of the required field**: one step on staging
    (Migration).
  - **Q13. The verify page's EVM read**: left as it is; aligning its request
    options with the Wrapper's (no redirect, exactly 200) is a follow-up issue,
    opened later.
  - **Q14. A round older than the providers' history** keeps today's rule: check
    6 "could not be verified", with V-7's chain wording and "check again"; it
    fails closed (section 4).
  - **Q15. How far back the verify page checks a round**: at least the
    operator's dispute window, and never less than 90 days. Every browser Solana
    provider serves finalized `getBlock` and `getBlocksWithLimit` back that far
    (P-5), and se-backend#375's provider check confirms it.
- **2026-11-18, the code owner, on the review of this draft**:
  - **Production's secrets and the publish path**: the publish path
    (se-client-kit#154) stays off until slice 1 is merged and both Solana
    browser providers pass P-1 to P-6; production's `pages-prod-config` then
    gets its first document, Solana-only, with no interim document (Migration;
    section 9, step 9). Q11 adds step 8's canary to this gate.
  - **Issue numbers** (se-backend#375, se-backend#471, and the like) stay in
    these public documents as bare numbers, without links, as RFC-006 does.
  - **#235's body** is updated by the human, with the code owner's agreement,
    its criterion reworded to "stale" (Q9).
  - **Q16. Staging's quorum** (accepted as written by the code owner on
    2026-11-20): after staging's engine switch and drain (se-backend#548), the
    `anvil` (Somnia, 50312) source is removed from staging's document and
    staging sets `minRpcQuorum` 2, like production, in one configuration change
    and a new deploy run. The canary starts only after that, so it runs at
    quorum 2. Staging's rounds from before the switch then show as not matching
    on its verify page: check 2 fails for a source the configuration does not
    list (V-7) and check 6 cannot be verified. That is accepted for staging
    only; production lists `solana` alone from its first document, so it is not
    affected. The canary counts `solana` rounds only. There is no quorum per
    source. Section 9's step 8, and Migration.
- **2026-11-19, the code owner, on the review of this draft**:
  - **The production cluster rule** (Q10): both validators refuse a `production`
    document whose `solana` source is not cluster 101 (`production-cluster`), so
    the rule runs in the player's browser at boot; the Pages tool's own
    `not-mainnet` rule is dropped, since production mode applies the validators'
    rule.
  - **The canary's pass** (Q11; section 9, step 8): a round counts only when its
    tip check passed and the verify page shows it as matching; any other outcome
    restarts the count once its cause is found and recorded.
- **2026-11-20, the human, the code owner**: **ADR-013 accepted**, option (a):
  the explicit `entropyChainKind`, cross-checked with the source's key and the
  cluster numbers (section 1); the genesis hashes pinned in code (section 2);
  and no Solana library or base58 dependency (section 5). Now in:
  [ADR-013](../../decisions/ADR-013-solana-entropy-sources.md) (accepted);
  section 1 and section 2's genesis table in the specs, written by slice 1: the
  [configuration](../../specs/wrapper.md#configuration) of the Wrapper spec,
  W-26b's Solana sources in
  [signing](../../specs/wrapper/signing-start-move-cash-out-and-cancel.md),
  [the `shell` package](../../specs/client-kit/the-shell-package.md), and V-3 of
  [the verify page](../../specs/verify-page.md). Sections 3 to 8 are decided;
  slices 2 to 4 wrote sections 3 to 5 into the specs, and the rest stay here
  until their slices write them in.
- **2026-11-20, the code owner, on slice 7** (refinements of the canary's pass
  rule; Q11; section 9, step 8):
  - **Coin Flip rounds only**: only Coin Flip config rounds count, since only a
    round of one step and two options reaches V-6 (A-3); a Cash or Crash round
    is neither counted nor restarts the count.
  - **The record**: a dedicated public tracking issue in se-client-kit, opened
    by whoever runs the canary at step 8's fifth sub-step, holds the round ids,
    outcomes, failure codes, causes, and restarts, never a URL, a key, or a
    hostname; #235 links its result.
  - **Endpoint changes during the canary**: a browser key's rotation on the same
    provider does not restart the count; a change of provider does.

## Unresolved questions

None open for the human: ADR-013 was accepted on 2026-11-20
([Decisions](#decisions)).

Pending from the backend and the infrastructure owner (values and checks this
RFC waits on, not questions):

- **The providers** (se-backend#375): the second of the two is still to be
  chosen; P-1 to P-6 for both, with their browser keys from both origins,
  including whether each offers an Origin allowlist (P-3), its HTTP status for
  JSON-RPC errors (P-2), and its history against P-5's depth (Q15).
- **`entropy/solana/v1` and the Solana Snapshot and signature vectors** (Q3):
  published by the backend's slice through its contracts manifest; the kit
  vendors and lock-pins them in slice 6, and the lists of what it may copy gain
  the set there.
- **Staging's switch to mainnet-beta** (Q11, Q16; section 9, step 8): the
  staging keys on two providers staging's own engine does not read,
  Origin-locked to staging's origins, and staging's secrets (the infrastructure
  owner); the backend's fix, drain, and switch in se-backend#548 (planned for
  2026-11-30 to 2026-12-03); the change that drops `anvil` and raises
  `minRpcQuorum` to 2; and the canary's result (the client kit's engineer).
