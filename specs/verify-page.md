# Verify page

A static page that takes a round id, reads the round's public evidence from the
verify API, and **recomputes** the round in the player's browser: it shows
whether the evidence is consistent and whether the outcome follows from it, and
it does not take the API's word for either. The kit builds it (decided by the
backend's TPO, 2026-10-18); the backend owns only the API it reads.

Status: **specified; partly built.** Built, in `apps/verify`
([What is built](#what-is-built)): the derivations of checks 5 and 7 under the
SuperEngine fairness kernel, kernelVersion 1, keyed on the kernel version, and
the raw `keccak256` they take from `signing`; the quorum read of check 6; checks
1 to 4; the rules on which reveals a round carries; the configuration read
(V-3); the page's states, their view, and its accessibility (V-4 to V-14); the
verify API read, built to an **assumed** response body confined to one module;
the page's HTML and module entry (`index.html`, `src/main.ts`, mounting at
`#verify-root`), and the build and release (V-15 to V-17); and the e2e fake of
the verify API with VT-5's browser rows
([The e2e fake](#the-e2e-fake-of-the-verify-api-built)). Not built: the e2e rows
VT-6 to VT-8. The response body waits for the verify API document, to come; what
depends on it is marked `TODO(verify API)`. Its four design decisions were made
by the human on 2026-10-18, and five more on the kernel derivations on
2026-10-19 ([Decisions](#decisions)).

## Purpose

- Let anyone, player or not, paste a round id and see the round recomputed: the
  minimum is "paste the round ID, see it recomputed".
- Give the Wrapper's verify link (W-39) a destination the kit controls, built
  and released with the same rules as the Wrapper (reviewed source, reproducible
  build, SRI, a strict policy).

## Scope

In scope, for the first release:

- the page at `<verifyBaseUrl>/rounds/{roundId}` and at `<verifyBaseUrl>/` (no
  round id);
- config rounds of the Coin Flip game (the only game of the first release), in
  the states below;
- recomputation with the kit's own code (`signing`, the round id and its
  `bytes32` form, the pinned values of the environment configuration) and a
  quorum read of the entropy chain;
- its build, its place in the Wrapper's release artifact, and its tests.

Out of scope:

- the verify API itself and its response body (the backend's, by name: the
  verify API document);
- book rounds (`playback`), which the first release does not ship;
- the on-chain record (`proofs.record`) read against the registry, and ZK proof
  verification: shown when present, never claimed as checked (a later increment,
  like W-27's deferred evidence check);
- any key, token, or session: the page has none (see [Security](#security)).

## Boundary

- **The kit owns:** the page's source, its build and release, what it recomputes
  and how it shows the result, its tests, and the e2e fake of the verify API.
- **The backend owns:** `GET /verify/v1/rounds/{roundId}`, a public,
  unauthenticated read, and its response body (the verify API document). It
  serves no HTML.
- **The infrastructure owner owns:** the Wrapper's hosting origin, so the page's
  production URL; carrying out the edge rules of V-2, which are decided; and the
  RPC providers the configuration lists.
- **Consumes:** the verify API document (vendored into `contracts` when
  published, with its generated types, as
  [the contracts package](./client-kit/the-contracts-package.md) already plans);
  the Snapshot schema's `RoundId` and `RoundIdBytes32` definitions; the
  environment configuration document the Wrapper reads
  ([wrapper.md](./wrapper.md#configuration)).

## Contract

### Vocabulary

- **Round id:** the Snapshot's `roundId`, a UUIDv7 in canonical lowercase text
  (the Snapshot schema's `RoundId`).
- **Evidence:** the round's public fields the verify API returns.
  <!-- TODO(verify API): the response body, from the verify API document, to come. Until then every field named below is by its Snapshot name. -->
- **Recomputed:** every check of
  [What the page recomputes](#what-the-page-recomputes) that applies to the
  round ran in the browser and passed.

### The URL and where the page is served (V-1, V-2)

- **V-1.** The page is a set of static files served next to the built Wrapper,
  under the path `/verify/` of the Wrapper's origin. `verifyBaseUrl` (the
  environment configuration's field) is that origin plus `/verify`, with no
  trailing slash; in preview it is the Wrapper's origin plus `/verify` (decided
  by the backend's TPO, 2026-10-18, and recorded in the backend's documentation
  at b6e1e48, which names `verifyBaseUrl` as this configuration field).
  <!-- TODO(infrastructure owner): the Wrapper's hosting origin in each environment, so the production and preview values of `verifyBaseUrl`. -->
  A round's page is `<verifyBaseUrl>/rounds/{roundId}`, the round id in the
  path, in its canonical form. The Wrapper's verify link builds exactly this URL
  (W-39).
- **V-2.** The page has one HTML file, `verify/index.html`, and its assets are
  referenced by absolute path under `/verify/` (the page's policy forbids
  `<base>`, and a relative path would resolve under `/verify/rounds/`). The host
  serves `verify/index.html` for every path under `/verify/rounds/`, so a
  round's URL needs a rewrite rule, not a file per round.
  - **The edge rules are decided** (the backend's TPO, 2026-10-18; b6e1e48). On
    the Wrapper's origin, `/verify/v1/` stays the backend's: the edge routes it
    to the verify API. The edge rewrites `/verify/rounds/*` to
    `/verify/index.html`. The page's files use only other paths under `/verify/`
    and never `/verify/v1/`.
  - The rewritten path is served with the same headers as the page (this spec's
    rule, V-16 and Security).
  - The verify API is on the page's own origin, a read that needs no CORS, when
    the Wrapper is served from the backend's origin, as in preview (b6e1e48);
    otherwise the verify API is on another origin and needs the backend's CORS
    decision first, before a configuration document may name it.
  <!-- TODO(infrastructure owner): carry out the two edge rules on the CDN (the route of `/verify/v1/` and the rewrite of `/verify/rounds/*`, with the page's headers) once the Wrapper's hosting origin is known. -->

### Configuration (V-3)

- **V-3.** The page reads the same environment configuration document as the
  Wrapper, from the same origin, and validates it with the same schema before it
  reads anything else. An invalid document shows the configuration-error state
  and the page makes no request. It uses `runtimeSigner`, `registryDomain`, and
  `entropyChainId` as the trust anchor (as W-26 does); `rpcEndpoints`,
  `minRpcQuorum`, and `environment` for the chain read (V-12, check 6); and the
  verify API's base from a field of its own, **`verifyApiBaseUrl`** (D-4): an
  absolute URL under `playApiBaseUrl`'s rule (`https:`, or `http:` on a loopback
  host, no credentials, query, or fragment) whose path ends with `/verify/v1`,
  with no trailing slash. The page will read
  `<verifyApiBaseUrl>/rounds/{roundId}`. The field is required (D-4), never
  derived or defaulted: once the Wrapper accepts the field, the preview
  configuration is to set it to the Wrapper's origin plus `/verify/v1`, a
  same-origin read when the Wrapper is served from the backend's origin, as in
  preview (b6e1e48); otherwise the verify API is on another origin and needs the
  backend's CORS decision first (V-2). The field is part of the one
  configuration schema: the Wrapper's validator accepts it and does not use it
  ([wrapper.md](./wrapper.md#configuration)), and refuses a document without it
  (`invalid-verify-api-base`). Before this change the Wrapper refused it as an
  unknown field, so **the Wrapper's acceptance of the field ships before, or in
  the same release as, any configuration document that carries it**; and, the
  field being required, the configuration document of every environment is
  updated in that same release, since the Wrapper that accepts the field refuses
  a document without it.

### The page's states (V-4 to V-11)

The page is in exactly one of these states. Each has a heading, a text that says
what happened, and, where the player can act, one control.

- **V-4. No round id.** At `<verifyBaseUrl>/` (or a `/rounds/` path with no id)
  the page shows a form with one labeled text field and a submit control. The
  input is trimmed of surrounding white space and its hexadecimal letters are
  lower-cased (UUID text is case-insensitive); the result MUST match the
  Snapshot schema's `RoundId` pattern, read from the vendored schema in
  `contracts`, not retyped. A value that does not match keeps the form, with an
  error text tied to the field ("this is not a round id") and no request. A
  value that matches navigates to `<verifyBaseUrl>/rounds/{roundId}`. A
  `/rounds/` path whose id does not match shows the form with the same error and
  the path's text in the field, and makes no request.
- **V-5. Loading.** While the API read or the chain read (V-12, check 6) is in
  flight, the page shows the round id and "checking this round", announced
  politely. A request times out after 15 s (as W-43's SHOULD).
- **V-6. Recomputed and matches.** Every applicable check passed. The page shows
  the round id, its shape ("one step, two options"; the page names no game), the
  result (`won` or `lost`, or `canceled` with its reason), and the payout as the
  evidence's `formatted` string, then the list of checks, each with what was
  compared and "matches". It says plainly what was **not** checked (V-13).
- **V-7. Mismatch.** At least one check failed. The page says "this round does
  not match its evidence", names every failed check with the two values it
  compared, and shows no result as established. A mismatch is a result, not an
  error: the API answered and the page could read the answer. When the only
  failure is the chain read (check 6: too few endpoints answered, or they
  disagree), the page says instead "this round could not be verified against the
  chain", names that check, and offers to check again; it still shows no result
  as established.
- **V-8. Not recomputable.** The API returned the round, but the page cannot
  recompute it, for one of three reasons:
  - the round has not ended (`won`, `lost`, and `canceled` are the ended
    statuses): the page shows what it could check, says the rest waits for the
    round's end, and offers to check again;
  - the round's kernel version is one this page does not know (V-12a): the page
    says it cannot recompute rounds of that kernel version, names it, runs no
    derivation, and offers no retry;
  - the round is not a one-step, two-option config round (A-3): the page says it
    recomputes rounds of that shape only, shows checks 1 to 4 and 6, runs no
    derivation of checks 5 and 7, and offers no retry.
- **V-9. Not found.** The API answered that it has no such round. The page says
  so, shows the id it looked for, and offers the form.
  <!-- TODO(verify API): the status code and body for an unknown round, from the verify API document. -->
- **V-10. API error.** The API answered with an error (any other 4xx or 5xx), or
  with a body that does not validate against the verify API document's schema.
  The page says the verification service could not answer, offers to try again,
  and claims nothing about the round. A body that fails validation is never
  partly used.
  <!-- TODO(verify API): the error status codes and body, from the verify API document. -->
- **V-11. API unreachable.** No answer: offline, DNS, TLS, timeout, reset, or a
  request the policy blocked. The page says it could not reach the service, says
  so distinctly when the browser reports being offline, and offers to try again.

A configuration error (V-3) is its own state, like the Wrapper's. When the
document could not be fetched (a network failure or a timeout) or could not be
read (a non-success status, or a body that is not JSON), the state offers "try
again", which reads the configuration again and then shows what the address asks
for; when the document was read and is invalid, it offers no control (the same
document would fail again). A failure of the checks themselves (an exception in
the page's own code) is shown as V-10, never left on V-5.

### What the page recomputes (V-12, V-13)

The page validates the evidence, then runs the checks below in the browser.
Checks 1 to 4 use the published `CreateRoundAuth` definitions and `signing`;
checks 5 and 7 use **the SuperEngine fairness kernel, kernelVersion 1**, part of
the public fairness contract (decided by the backend's TPO, 2026-10-18); the
rules below are written in this spec's words, and the kernel's vectors pin them
(VT-2).

**The kernel's vectors.** The kernel's public vector bundle (synced from
se-backend `9294d22`) is vendored into `contracts`, on the test-only entry as
`kernelVectors.v1`, 81 vectors in four sets:

- `kernel/public/v1/seed`:
  `Seed(blockValue, secret) = SHA-256(blockValue || secret)` and
  `SeedHash(seed) = SHA-256(seed)`, with the length errors of both inputs (check
  5's `seedHash` and check 7's seed);
- `kernel/public/v1/shuffle-draw`: ShuffleDraw on its own, each draw with the
  counter it was accepted at, and the input errors. Its description states the
  rule (below);
- `kernel/public/v1/steps-derive`: StepsDerive over ShuffleDraw, each step's
  losers with the draws behind them, and the input errors (check 7's outcome);
- `kernel/public/v1/derive`: the step losers along a path of a config model's
  nodes, each step depending only on the seed, its index, and its `(n, k)`. Coin
  Flip's `(2, 1)` at step 0 is covered by the chains of `n = 2, k = 1`.

**Not covered by a vector yet** (the backend's word): Coin Flip's payouts and
`roundSecretHash`. Until the kernel has such vectors, the page checks
`roundSecretHash = SHA-256(roundSecret)` (check 5) against that definition
alone, and the payout is shown, not recomputed (V-13).
<!-- TODO(fairness kernel): vectors for Coin Flip's payouts and roundSecretHash, vendored when the kernel publishes them. -->

- **V-12a. Kernel version.** The page keys its derivations (checks 5 and 7) on
  the round's kernel version, which the verify API's response carries (the
  Snapshot has no such field). Until the verify API document is published the
  page assumes kernel version 1. A round whose kernel version is not one the
  page implements is shown as not recomputable (V-8): the page never applies one
  kernel version's derivation to a round of another, and never guesses. Checks 1
  to 4 and 6 do not depend on it.
  <!-- TODO(verify API): the name and type of the response's kernel version field; until then, kernel version 1 is assumed. -->

- **V-12. The checks, for a Coin Flip config round.**
  1. **Round id.** `newRound.roundId` is the round id's `bytes32` form (the 16
     UUIDv7 bytes, left-aligned and zero-padded: the Snapshot schema's
     `RoundIdBytes32`), and the id is the one the page asked for.
  2. **Entropy target.** `newRound.randomnessTarget` equals
     `keccak256(abi.encode(bytes32 source, uint256 entropyChainId, uint256 blockNumber))`
     from `randomnessProof.source` and `blockNumber`, with the `entropyChainId`
     the environment configuration pins for that source (`signing`'s
     `hashRandomnessTarget`; a source the configuration does not list fails).
     This binds the round to block N of the entropy chain before the block
     existed.
  3. **The backend's signature.** `created = keccak256(abi.encode(newRound))`
     (`signing`'s `hashNewRound`), the EIP-712 digest of
     `CreateRoundAuth(bytes32 created,uint40 prepareWindow,uint256 expiry)`
     under the **configured** `registryDomain`, a canonical signature that
     recovers to the configured `runtimeSigner` (`signing`'s
     `hashCreateRoundAuth` and `recoverAddress`), as W-26 checks 2 and 4. The
     signed `newRound.roundSecretHash` equals `randomnessProof.roundSecretHash`:
     the commitment was fixed before the block.
  4. **Ready evidence.** `fairnessProof.readyHash` equals
     `keccak256(abi.encode(created, seedHash))` (`signing`'s `hashReady`), as
     W-26 check 5.
  5. **Commitment and reveal.** Under kernel version 1, each commitment is the
     SHA-256 of its revealed value's raw 32 bytes (the `Hash32` hex decoded,
     never its text): `roundSecretHash = SHA-256(roundSecret)` and
     `seedHash = SHA-256(seed)`, with `randomnessProof.roundSecret` and
     `fairnessProof.seed` the reveals. The page computes SHA-256 with Web Crypto
     (`crypto.subtle.digest`), no library. A `won` or `lost` round always
     carries both reveals; their absence is a mismatch. A `canceled` round may
     carry them and is not guaranteed to: when it carries neither, checks 5 and
     7 are shown as "not checked" (V-13), and the round can still reach V-6 on
     the checks that apply.
  6. **Block N.** The page reads block `blockNumber`'s hash from the entropy
     chain itself (D-1), with a **quorum**, under W-26a's and W-26b's rules: it
     asks at least `minRpcQuorum` of the configuration's `rpcEndpoints` for the
     round's source, each for `eth_chainId` and `eth_getBlockByNumber` at
     `blockNumber` as a quantity, with `false` (no transaction bodies), each
     call with the 15 s timeout. The check passes only if no endpoint reports
     another chain id than the pinned `entropyChainId`, at least `minRpcQuorum`
     endpoints answered, and every answering endpoint returned the same hash;
     the first failure in that order is the one shown, and the page never drops
     an outlier or picks a side. When `randomnessProof.blockValue` is present
     (it is optional) it MUST equal the hash the quorum agreed on; when it is
     absent, the agreed hash is the one check 7 uses. A local or preview
     configuration with one endpoint and `minRpcQuorum` 1 is W-26a's exception:
     the page shows a non-dismissable "chain check not independent
     (development)" indicator beside the check. The read is the page's own
     small, read-only JSON-RPC module, never `shell` (the tip check is not
     public API, and the page holds no credential). **Built** (D-1):
     `apps/verify/src/chain-read.ts` (`readBlockHashByQuorum`, with `fetch` and
     the timers injected, and `resolveBlockValue` for the optional
     `blockValue`). It asks every configured endpoint of the source; an endpoint
     answers only with a 32-byte hash for block N itself, and an endpoint that
     gave a block but no chain id, or a chain id but no valid hash for block N,
     fails the read (W-26b: it cannot be shown to agree), so the failures are,
     in order, `other-chain`, `too-few`, `no-chain-id`, `no-block`, and
     `hash-mismatch` (completeness before content, as W-26b puts identity before
     content); an endpoint that said nothing at all within the timeout only
     counts toward `too-few`. A configuration the Wrapper refuses at boot
     (`minRpcQuorum` below 1, below 2 in `production`, or more than the
     endpoints) or an `entropyChainId` that is not a non-negative safe integer
     is refused as `config` and nothing is asked. The page trusts the validated
     configuration for provider independence (V-3); the module does not recheck
     it. W-26b's second pass at `h_low` and its lag margin do not apply: check 6
     reads one fixed block N, not a moving tip. **The page calls it** for every
     round (`block-check.ts`): it shows each endpoint's answer (chain id and
     block hash) and, for W-26a's exception, the degraded indicator beside the
     check; when the read fails, check 6 is "could not be verified" and check 7
     is not run, since it has no agreed block hash.
     <!-- TODO(verify API): the evidence's `blockNumber` type waits for the verify API document; the page assumes a JSON integer, read as `bigint`. -->
  7. **Seed and outcome.** Under kernel version 1:
     - **The seed** is `SHA-256(blockValue || roundSecret)`: a 64-byte preimage,
       block N's 32-byte hash first, then the round secret's 32 bytes.
       `blockValue` is the hash check 6 agreed on, never the API's. The
       recomputed seed MUST equal the revealed `fairnessProof.seed`.
     - **The outcome.** Coin Flip is one step with two options of which one
       loses, `(n = 2, k = 1)`, so
       `losingIndex = StepsDerive(seed, [(2, 1)])[0][0]`, where StepsDerive is
       the kernel's keccak256-based shuffle draw (below). It MUST equal
       `config.steps[0].losingIndex`. The player's pick is
       `config.steps[0].selectedIndex`: the round is `won` when the pick is not
       the losing index and `lost` when it is, and that MUST equal the round's
       status. A pick that is not a whole number in `[0, n)`, so for Coin Flip
       neither 0 nor 1, gives no outcome, so it fails the status comparison, as
       a missing pick does (D-5).
     - For a `canceled` round that carries its reveals, the seed and the outcome
       are recomputed and shown, with no status to compare them with; its
       `config.steps[0].losingIndex` is compared with the recomputed one when
       the evidence carries it.
     - **StepsDerive(seed, steps)**, for steps `(n_j, k_j)` from `j = 0`: the
       seed must be 32 bytes (`seed-length`), then every `n_j` a whole number
       from 1 to 2^32 (`n-out-of-range`), then every `k_j` one from 0 to `n_j`
       (`k-out-of-range`); an empty list derives nothing. Step `j` starts from
       the options `a = [0, 1, …, n_j − 1]` and runs a forward partial
       Fisher–Yates: for `t` from 0 to `k_j − 1`, it draws
       `u = ShuffleDraw(seed, j, t, n_j − t)` and swaps `a[t]` with `a[t + u]`;
       its losers are `a[0 .. k_j)`, in ascending order. The page keeps only the
       positions whose option has moved, so its memory grows with `k_j`, not
       with `n_j` (which may be 2^32).
     - **ShuffleDraw(label, seed, j, t, m)** is a fair draw from 0 to `m − 1`,
       as the vendored set `kernel/public/v1/shuffle-draw` states it. It checks,
       in order: the seed is 32 bytes (`seed-length`); the label is 1 to 32
       bytes with no zero byte (`label-invalid`); `1 ≤ m ≤ 2^64 − 1`
       (`m-out-of-range`). Then `limit = 2^256 − (2^256 mod m)`, and for a
       counter `ctr` from 0 it reads
       `x = uint256(keccak256(abi.encode(bytes32(label), seed, uint256(j), uint256(t), uint256(ctr))))`,
       the hash of five 32-byte words in that order: the label's UTF-8 bytes
       zero-padded on the right, the seed, then `j`, `t`, and `ctr` big-endian;
       keccak256 is Ethereum's Keccak-256, not NIST SHA3-256. The first
       `x < limit` gives `u = x mod m` and that `ctr`. StepsDerive draws with
       the label `steps-v1`. The set has no vector that rejects a hash (every
       vector accepts at counter 0), so the kit's unit tests exercise the limit
       directly (D-7).
     - **What StepsDerive needs:** keccak256 over bytes, which in the kit only
       `signing` has (through its allow-listed hash dependency). `signing`
       exports a raw `keccak256` for it
       ([The cryptography](./client-kit/the-cryptography.md)), and StepsDerive
       is implemented in `apps/verify`, so the app adds no runtime dependency of
       its own.

     The payout is shown, not recomputed.
- **V-13. Shown, not checked.** The page shows, and labels as not checked by
  this page: the payout amount and its terms (`payoutTermsHash` is taken as
  signed, as W-26 does), the on-chain record (`record.txHash`, `chainId`), and a
  ZK proof's `status` and `verifiedBy` (`record` and `zkProof` are optional and
  shown only when present); and, for a `canceled` round without reveals, checks
  5 and 7; and `newRound.actionKey` (A-4: the page has no player key to compare
  it with). Links from the evidence (`blockExplorerUrl`, `explorerUrl`,
  `proofLink`) are shown as text, not as links, in the first release: they come
  from the API the page does not trust.
- **Which package does what.** `signing` for every keccak256 hash and the
  signature recovery (it has no kit dependency at run time); Web Crypto for
  SHA-256; `apps/verify` for StepsDerive and the kernel's rules; the vendored
  schemas in `contracts` (runtime entry) for the round id pattern and the verify
  API document's types; a validator for the API's body, generated from or
  checked against that document like the Snapshot's (`snapshot` if the body
  embeds a Snapshot, otherwise a validator built the same way); the verify API
  read through `play-client`, whose spec already names "the verify API read"
  ([packages](./client-kit/packages.md)), once the verify API document is
  vendored (**interim**, A-1: until then the read and its hand-written validator
  are the app's own module, `apps/verify/src/verify-api.ts`); the chain read
  through the page's own read-only JSON-RPC module (check 6). The page never
  imports `shell`: it holds no credential, and the shell's code does not belong
  in its bundle.
  <!-- TODO(verify API): whether the body embeds an `se.snapshot/1` Snapshot or has its own schema, so which validator applies; it comes with the verify API document. -->
- **Amounts** are strings in the evidence and `bigint` where compared, never a
  JS `number` (the kit's rule).

### What is built

`apps/verify` holds what the Status line lists: checks 1 to 4 and 6, the
configuration read, the page's states and view, and the assumed verify API read,
each with its tests. Its kernel derivations of checks 5 and 7 for a one-step,
two-option config round (Coin Flip's shape) and their tests (VT-1b's kernel
version part, VT-2 for checks 5 and 7, and VT-10's source check) are:

- **Keyed on the kernel version (V-12a).** The kernels the page implements are a
  map from kernel version to derivations; version 1 is the only entry. A check
  asked for any other version (another integer, a fraction, `NaN`) returns "not
  recomputable" with that version, and no hash is computed.
- **Check 5** takes the two commitments and the two reveals (`roundSecretHash`,
  `roundSecret`, `seedHash`, `seed`) and recomputes both commitments. **Check
  7** takes block N's hash, the round secret, the revealed seed, the status
  (`won`, `lost`, or `canceled`), and `config.steps[0]`'s `selectedIndex` and
  `losingIndex` when present; it compares the seed, the losing index, and, for
  `won` and `lost`, the status that the pick gives. A `won` or `lost` round
  without its pick or its losing index, or with a pick outside `[0, 2)`, fails
  that comparison (D-5). A `canceled` round's seed and losing index are
  recomputed and returned; its losing index is compared only when the evidence
  carries one, and it has no status to compare.
- Each check returns every comparison with the two values compared (the
  recomputed one and the evidence's, both as text: `0x` lowercase hex for a
  hash, base 10 for an index) and whether it matches, and every value it
  recomputed. A value the kernel cannot take, not `0x` lowercase hex or of the
  wrong length, is reported as refused, with the kernel's error name
  (`block-value-length`, `secret-length`, `seed-length`) or `not-hex`: a
  mismatch, never a result.
- ShuffleDraw is its own function, `shuffleDraw(label, seed, j, t, m)` in
  `apps/verify/src/steps-derive.ts`, with the vendored set's input checks and
  error names; `j` and `t` are `bigint` values from 0 to 2^256 − 1, and one
  outside that range is a caller's mistake (a `RangeError`, not a kernel error).
  StepsDerive draws through the same code with the label `steps-v1`.
- ShuffleDraw's rejection limit, `2^256 − (2^256 mod m)`, is its own small
  function with unit tests (`m` of 1 and of 2^32 give 2^256, `m` of 3 gives
  2^256 − 1, and a hash at or above the limit is rejected), since no vector
  exercises a rejection (D-7).
- Both checks assume the reveals are present; which reveals a round must carry
  (V-12, check 5) is the caller's (`verify-round.ts`): a `canceled` round with
  neither reveal shows checks 5 and 7 as "not checked", and any other ended
  round missing one fails both.
- VT-10's source check runs over `apps/verify` (D-6), HTML included; the
  `<meta>` policy's `worker-src 'none'` part is checked on the page's own HTML
  in the Wrapper's release test (`apps/wrapper/src/release-verify.test.ts`).
- **The build and release (V-15 to V-17).** `apps/verify` has a Vite build
  (`vite.config.ts`: base `/verify/`, `publicDir: false`, no env files, a
  production build only) of the page's `index.html` (one `#verify-root`, a
  `<noscript>` line for a player without JavaScript, a stylesheet link, a module
  script, no inline script or style, no policy of its own) and its entry
  `src/main.ts`, which calls `startVerifyPage`. The Wrapper's build depends on
  it and copies `apps/verify/dist/` into its output under `verify/`
  (`apps/wrapper/release-verify.ts`), adding the page's `<meta>` policy and SRI
  (`release-sri.ts`, shared with the Wrapper's page), listing its files in the
  integrity manifest, and holding them to the output allow-list with
  `verify/index.html` as the second HTML file. `headers.json` holds the page's
  headers under `/verify/*`, and `verifyContentSecurityPolicyFor`
  (`apps/wrapper/release-headers.ts`) fills their `{{verifyConnectOrigins}}`
  from a validated environment document. The size budget measures "verify
  output" and "verify page, gzip" apart from the Wrapper's
  (`tools/size-budget.ts`); their limits are 150000 bytes (output) and 49152
  bytes (gzip), set by the human on 2026-10-20 about 25 % over the first build's
  119788 and 39199 bytes.

The page around them is built too:

- **The verify API read** (`verify-api.ts`) is the only module that fetches or
  parses the API's answer; everything past it works on the typed evidence
  (`round-evidence.ts`). It is built to an **assumed** body, until the verify
  API document is vendored (A-1). Amounts (`betAmount`, `payout.value`) and
  `blockNumber` are read as `bigint`; a body that fails validation is an API
  error and none of it is used (V-10).
- **Checks 1 to 4** (`auth-checks.ts`) use `signing` and the configured trust
  anchors only. **Check 6** (`block-check.ts`) calls the quorum read for every
  round.
- **The configuration** (`environment-config.ts`, `config-fields.ts`,
  `load-config.ts`) is validated by the Wrapper's rules, spelled again here
  since the page cannot import the Wrapper; `tools/config-parity.test.ts` runs
  one shared set of documents through both validators and requires the same
  verdict (V-3, one schema); the document's path is the Wrapper's, provisional
  like it.
- **The states** (`page-state.ts`): a controller with `fetch`, the timers, the
  address bar, and the offline flag injected, which shows exactly one state; a
  submit or a retry is followed by focus on the new heading, a direct load or
  back and forward never. A read that a newer one replaced is dropped. A valid
  submit adds a history entry for `<verifyBaseUrl>/rounds/{roundId}` on the same
  origin, or loads that URL when `verifyBaseUrl` is on another one.
- **The verdict** (`verify-round.ts`): any failed check gives V-7 and lists
  every failed check (with check 6 when it could not be verified too); check 6
  alone gives V-7's chain wording; then V-8. For a round that has not ended
  (A-2), a check that fails only because the evidence lacks a value it will
  carry later (such as `readyHash`), and check 6 when its read failed as
  `too-few` or `no-block`, are "not checked: it waits for the round's end", not
  a mismatch; any other failure of check 6 still surfaces.
- **The view** (`render.ts`, `report-view.ts`, `view-parts.ts`, `dom.ts`,
  `messages.ts`, `styles.css`): built with DOM calls and text nodes only, no
  markup string and no inline style; one polite live region and one alert
  region, both present from the start; English text. `start-page.ts` wires it to
  the browser for the HTML to come.

### Accessibility (V-14)

- **V-14.** The page targets WCAG 2.2 level AA, as the Wrapper's own UI does
  (W-45 to W-48): every control works by keyboard alone with a visible focus
  indicator and no trap; the form field has a visible label and its error is
  tied to it (`aria-describedby`) and announced; a state change is announced
  through a polite live region, a failure (V-7, V-10, V-11, the configuration
  error) through `role="alert"`; focus moves to the new state's heading after
  the player submits the form or asks to try again, never on its own; match and
  mismatch carry text and an icon with a text alternative, never color alone;
  contrast at least 4.5:1, `prefers-reduced-motion` honored, 200 % zoom without
  loss, targets at least 24 by 24 CSS pixels. Hashes and addresses are shown in
  full, in a monospaced face, wrapped, each with a copy control. The page's
  language is English, the Wrapper's fallback language, in the first release (it
  has no session to take a language from).

### Build and release (V-15 to V-17)

- **V-15. The source** is a new private app, **`apps/verify`**
  (`@intraverse/se-client-verify`, D-2): plain TypeScript and Vite like the
  Wrapper, `publicDir: false`, no runtime dependency outside the kit's
  allow-list. It depends on `signing` and `contracts` (runtime entry); once the
  verify API document is vendored, also on `play-client`, and on `snapshot` if
  the body embeds a Snapshot (until then its verify API read is its own, A-1);
  and it **never depends on `shell`** or the `contracts` test-only entry; the
  import-direction lint refuses both. As a new workspace it passes the
  add-a-package checks, and the packages spec, the dependency direction in
  `AGENTS.md`, the import-direction lint and its test, and the architecture
  memory are updated in the pull request that adds it.
- **V-16. The release artifact.** The page ships **inside** the Wrapper's
  release artifact, under `verify/`, so one digest and one attestation cover
  both and the deploy side has nothing new to pull. The release build extends
  the Wrapper's rules to it: SRI on its `<script src>` and `<link href>`, its
  files in the integrity manifest, the same file-type allow-list (with
  `verify/index.html` as the second allowed HTML file), no symbolic link or
  stray file, and an entry in `headers.json` for `/verify/*` with its own policy
  ([Security](#security)). The release dry run builds it in both copies and the
  digests must match. Its bytes **do not count** toward the Wrapper's budget
  (D-3): the size budget gets two measurements of its own, "verify output"
  (every file under `verify/`, uncompressed) and "verify page, gzip"
  (`verify/index.html` and every `.js` and `.css` file under `verify/`, each
  gzipped at zlib's default level and summed), checked by
  `pnpm check:size-budget`, the release dry run, and the publish step, with the
  same rules as the Wrapper's (a missing measurement fails). Their limits
  (150000 and 49152 bytes) were set by the human on 2026-10-20 from the first
  build's measurement, about 25 % over it, as for the Wrapper
  ([Testing and CI](./client-kit/testing-and-ci.md)).
- **V-17. Same build for every environment.** Like the Wrapper, the page holds
  no environment value; it reads them from the configuration document (V-3).

## Errors and edge cases

| Situation                                                                           | Behavior                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| id with upper-case hex, or white space around it                                    | normalized (V-4), then checked                    |
| id that is a UUID but not v7, or not canonical                                      | refused by the pattern (V-4); no request          |
| unknown round                                                                       | not found (V-9)                                   |
| round not ended                                                                     | not recomputable (V-8), with "check again"        |
| unknown `kernelVersion`                                                             | not recomputable (V-8), no derivation run         |
| `canceled` without reveals                                                          | checks 5 and 7 "not checked" (V-13)               |
| `won` or `lost` without a reveal                                                    | check 5 fails: mismatch (V-7)                     |
| RPC endpoints disagree, or too few answer                                           | check 6 fails: could not verify the chain (V-7)   |
| `blockValue` differs from the chain's hash                                          | check 6 fails: mismatch (V-7)                     |
| body that fails validation                                                          | API error (V-10); nothing of it is shown as fact  |
| a source the configuration does not list                                            | check 2 fails: mismatch (V-7)                     |
| signature that recovers to another signer, or has a high `s` or an out-of-range `r` | check 3 fails: mismatch (V-7)                     |
| signature of the wrong length or with a bad `v`                                     | body fails validation: API error (V-10)           |
| configuration document not fetched or not read                                      | configuration error with "try again" (V-3)        |
| invalid configuration document                                                      | configuration error, no control; no request (V-3) |
| offline, or a request blocked by the policy                                         | API unreachable (V-11)                            |
| two checks fail                                                                     | every failed check is listed (V-7)                |

## Security

- **The page recomputes; it does not trust the API's verdict.** If the API
  returns a verdict field, the page does not show it as the result; the result
  is the page's own checks. The trust anchors are the environment
  configuration's pinned values, as for the Wrapper (OQ-7).
- **No credential.** The page holds no key, no play token, and no launch code,
  and it touches none: it never imports `shell` and never reads the Wrapper's
  session. The round id is public.
- **It shares the Wrapper's origin.** The page is served under `/verify/` on the
  Wrapper's origin, so it shares that origin's Web Locks (the shell's W-14
  signing lock), BroadcastChannel, and storage with the code that holds the key,
  and a script injection on the page is a script injection on that origin. So
  the page is part of that origin's trusted code: it is held to the same review
  and supply-chain bar as the Wrapper (reviewed source, the dependency
  allow-list, SRI, the reproducible build). It MUST NOT use `navigator.locks`,
  `BroadcastChannel`, any storage (`localStorage`, `sessionStorage`, IndexedDB,
  the Cache API, cookies), or workers (dedicated, shared, or service); a source
  check enforces it (VT-10).
- **Policy as strict as the Wrapper's.** A `<meta>` policy with the
  environment-independent part
  (`script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'`),
  and, in `headers.json`, `default-src 'none'`, `'self'` for scripts, styles,
  images, and fonts, `connect-src 'self' {{verifyConnectOrigins}}` (the origins
  of `verifyApiBaseUrl` and of the configured RPC endpoints),
  `frame-src 'none'`, and `frame-ancestors 'none'` (the page is not embedded),
  with the Wrapper's `Referrer-Policy: no-referrer` and `Permissions-Policy`.
  The form is handled by script, so `form-action 'none'` holds. No inline script
  or style; SRI on every script and stylesheet (V-16).
- **No third-party call, no persistence, no telemetry.** The page calls only the
  configuration document, the verify API, and the configured RPC endpoints. It
  writes nothing to `localStorage`, `sessionStorage`, IndexedDB, or cookies; the
  round id lives only in the URL. It emits no log, metric, or event.
- **Untrusted input.** The API's body is untrusted until validated (V-10), and
  every value from it is rendered as text, never as markup (Trusted Types is
  required). Links in it are not followed (V-13).

## Observability

None: the page emits no log, metric, or event. A failure is shown to the reader,
never reported anywhere.

## Test plan

| Row   | Level               | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VT-1  | unit                | the round id: normalization, the schema's pattern (v7 only, canonical), the path parser for `/rounds/{id}` (empty, extra segments, encoded characters), and the URL the Wrapper builds (W-39); `verifyApiBaseUrl`'s rule, and the Wrapper's schema accepting it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| VT-1a | unit                | the chain read (check 6): a quorum that agrees passes; another chain id, too few answering, a timeout, an endpoint with a chain id but no block, and two hashes fail in W-26b's order, and a refused configuration (`config`) asks nothing; `fetch` is called unbound; `blockValue` present and equal, present and different, absent; the one-endpoint degraded indicator                                                                                                                                                                                                                                                                                                                                                                                                 |
| VT-1b | unit                | the kernel version (V-12a): kernel 1 runs the derivations, an unknown one shows V-8 and runs none; a `canceled` round without reveals shows checks 5 and 7 as "not checked"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VT-2  | unit                | each check of V-12 against the vendored vectors, each with a passing case and a case per failure: checks 1 to 4 against `created`, `ready`, and the `signature/` Snapshot vectors' `randomnessTarget` and signature verdicts; checks 5 and 7 (SHA-256, the seed, StepsDerive, Coin Flip's outcome) against the fairness kernel's public vectors (the SuperEngine fairness kernel, kernelVersion 1: `kernel/public/v1/seed`, `kernel/public/v1/shuffle-draw`, `kernel/public/v1/steps-derive`, and `kernel/public/v1/derive`, read through the `contracts` test-only entry as `kernelVectors.v1`), and `roundSecretHash` against its definition until the kernel has a vector for it                                                                                       |
| VT-3  | unit                | the body's validation: a body the verify API document's schema refuses is an API error, never a partial result; amounts read as `bigint`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| VT-4  | component (jsdom)   | every state V-4 to V-11 and the configuration error renders its heading, text, and control, with no inline style; values from the body render as text. jsdom component tests; the axe scan is in the browser rows (VT-7), as for the Wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VT-5  | e2e, browser        | against the e2e fake of the verify API: paste a round id and see it matched; open a round's URL directly; a tampered field gives a mismatch naming the check; not found; an API error; the API unreachable (the route aborted); a round not yet ended; a round of a kernel version the page does not know (V-8)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| VT-6  | e2e, browser        | from the Wrapper: after a round ends, the verify link opens `<verifyBaseUrl>/rounds/{roundId}` in a new context and that page reaches V-6 or V-8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| VT-7  | e2e + audit         | accessibility (V-14): axe on every state, keyboard-only use of the form and the retry, focus after a submit, live regions, 200 % zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VT-8  | e2e + build check   | the policy and SRI: the page loads with the `headers.json` policy and no violation, every script and stylesheet carries `integrity`, and no request leaves the configured origins (the harness's catch-all route records none)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| VT-9  | release dry run     | the page is inside the artifact under `verify/`, two builds give one digest, and its two size measurements are reported and held to their own limits (D-3), apart from the Wrapper's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| VT-10 | unit (source check) | `apps/verify`'s sources never reference `navigator.locks`, `BroadcastChannel`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `document.cookie`, `Worker`, `SharedWorker`, or `serviceWorker` (the shared-origin rule), and its `<meta>` policy carries `worker-src 'none'`. Built: `tools/shared-origin.test.ts` scans every non-test source and HTML file of `apps/verify` as text, comments and strings included, for each name as a whole word (`locks`, `cookie`, and `cookieStore` included), with a case per name; the `<meta>` part is checked in `apps/wrapper/src/release-verify.test.ts`, which feeds the page's `index.html` through the release step, and the source HTML itself is checked for no inline script or style and no policy of its own |

**The e2e fake of the verify API** joins the fake Play API in the e2e harness: a
route at the configured verify API base on a `.test` origin, answering
`GET /verify/v1/rounds/{roundId}` from canned rounds built from the vendored
vectors (a matching round, a tampered copy, an unfinished round, a `canceled`
round without reveals, an unknown kernel version), the not-found answer for an
unknown id, a scripted error, and an abort for the unreachable case; the
harness's RPC routes answer the chain read (agreeing, disagreeing, and silent
endpoints). It is hermetic like the rest of the harness: no real network, and a
request to any other origin fails the test.
<!-- TODO(verify API): the canned bodies follow the verify API document once it is vendored. -->

### The e2e fake of the verify API: built

In `e2e/tests/harness/` (the suite's harness, never shipped):

- `fake-verify-api.ts`: a context route at the configured `verifyApiBaseUrl` (in
  the suite the Wrapper's origin plus `/verify/v1`, a same-origin read as in
  preview, so no CORS) answering `GET <base>/rounds/{roundId}` per round id:
  `round` (200 with a JSON body), `not-found` (404, no body; also the answer for
  an id with no script), `error` (a scripted status), `unreadable` (200, not
  JSON), and `abort` (the request fails: unreachable). Answers can be queued
  (used once, in order) before a standing one, so a retry can differ from the
  first read. Any other method or path is recorded as unexpected and fails the
  test.
- `verify-rounds.ts`: the canned rounds, built at run time from the vendored
  `valid/coinflip-active-ready-hash` vector (the round tests' round) through
  `contracts`' test-only entry. The matching round is that vector as `canceled`
  without reveals (checks 1 to 4 and 6 match, 5 and 7 "not checked"); the
  not-ended round is the vector as it is (`active`); the unknown-kernel round
  adds `kernelVersion: 2`; a tampered round changes one field per check (2:
  `blockNumber`, 3: `prepareWindow`, 4: `readyHash`, 5: both reveals,
  `roundSecret` and `seed`, neither hashing to its commitment, so the comparison
  runs and does not stop at "a reveal is missing", 6: a `blockValue` that is not
  block N's hash); a check 1 case serves the matching round under another round
  id.
- `verify-page.ts`: the page's harness: the bundle's `verify/index.html` served
  for `/verify/` and `/verify/rounds/*` (V-2), the configuration document (the
  round tests' pins, `verifyBaseUrl` the Wrapper's origin plus `/verify`), the
  fake verify API, and the round tests' two fake RPC endpoints (`fake-rpc.ts`:
  agree, disagree, and a silent endpoint) for check 6. The routes carry no
  response headers, so the policy and SRI are not proven here (VT-8).
- `fake-verify-api.spec.ts` tests the fake, the canned rounds, and the RPC
  answers as the page asks them (no page load); `verify-page.spec.ts` is VT-5.
  The browser rows run against the Wrapper's release bundle, which holds the
  page (`apps/wrapper/dist/verify/index.html` with `#verify-root`); a bundle
  without it fails them with a message (they never skip).

Not built here: a `won` or `lost` round that matches (checks 5 and 7
recomputed), because `roundSecretHash` is signed into `newRound`, so a reveal
that hashes to it needs a round the backend signed with that reveal; a check 7
tamper apart from check 5 (it needs the same round); VT-6 (the Wrapper's verify
link after a round ends), VT-7 (axe on every state, keyboard use, zoom), and
VT-8 (the policy and SRI), which need the built page and its `headers.json`.

## Decisions

Decided by the human on 2026-10-18, each the recommended option.

- **D-1. The page reads the chain for block N's hash, with a quorum** (V-12,
  check 6): at least `minRpcQuorum` of the configured `rpcEndpoints` must agree,
  under W-26a's and W-26b's rules, through a small read-only JSON-RPC module
  that is not `shell` (provider independence is the validated configuration's
  job, and no `h_low` pass or lag margin applies to the one fixed block N). A
  verify page that took the entropy from the API it checks would recompute less
  than it claims. Until the read is built, the page (the same build in every
  environment) shows check 6 as "not checked" and says check 7 rests on an
  unchecked block hash; the quorum read lands before the first release.
  Rejected: showing the API's value only, and a single endpoint (one provider
  can lie).
- **D-2. A new private app, `apps/verify`** (V-15), never depending on `shell`:
  the rule that the shell is the only code that touches a credential is easiest
  to prove when the page cannot import it, and the page's policy stays its own.
  Rejected: a second Vite entry inside `apps/wrapper`.
- **D-3. Its own size budget** (V-16), with its own uncompressed and gzip
  measurements, limits set from the first build at about 25 % over, so a
  player's Wrapper download is held to its own limit. Rejected: counting it in
  the Wrapper's 200 KiB (about 42 KiB was free), or raising the Wrapper's
  limits.
- **D-4. A new configuration field, `verifyApiBaseUrl`**, ending with
  `/verify/v1` (V-3), which the Wrapper's schema accepts too and requires
  (built; shipped before, or with, any document that carries it, and with every
  environment's document). Rejected: deriving it from `playApiBaseUrl`.

Decided by the human on 2026-10-19, during the review of the kernel derivations:

- **D-5. A Coin Flip pick outside `[0, n)` fails check 7's status comparison**
  (V-12, check 7): a `selectedIndex` that is not a whole number from 0 to
  `n − 1` gives no outcome, like a missing pick, and is never read as a win.
- **D-6. VT-10's source check is built with the kernel derivations**, not later
  with the page, so `apps/verify` is held to the shared-origin rule from its
  first source file.
- **D-7. ShuffleDraw's rejection limit is tested directly**, as its own
  function: the vendored `kernel/public/v1/shuffle-draw` set states the limit,
  but every one of its vectors accepts at counter 0, so none exercises a
  rejection.
- **D-8. `signing`'s `keccak256` takes and returns bytes** (a `Uint8Array` in,
  32 bytes out), not hex text
  ([The cryptography](./client-kit/the-cryptography.md)).
- **D-9. The verify app has no changesets of its own**: it ships inside the
  Wrapper's release artifact, so its release notes go in the Wrapper's
  changesets, and `.changeset/config.json` ignores
  `@intraverse/se-client-verify` as it does the reference game
  ([Packages](./client-kit/packages.md)).

### Assumptions (decided)

Made while building the page's states (2026-10-20), each the least-claiming
reading of the spec. A-1 (interim) to A-4 were decided by the human on
2026-10-20, as recorded below; nothing is open.

- **A-1. The verify API's body** is assumed to be the Snapshot's fields
  (`roundId`, `status`, `closeReason`, `payout`, `config.steps`, `proofs`) plus
  an optional integer `kernelVersion` (absent: kernel version 1, V-12a); 404 is
  "no such round" (V-9), any other non-2xx an error (V-10). Only `verify-api.ts`
  holds this assumption. **Interim** (decided by the human, 2026-10-20): the
  read and its hand-written validator are app-local in `verify-api.ts`; when the
  verify API document is vendored they move to `play-client`, with a validator
  generated from or checked against that document, and the app then depends on
  `play-client`.
  <!-- TODO(verify API): replace A-1 with the vendored document's schema and its generated types. -->
- **A-2. A round that has not ended** reaches V-8 rather than V-7 when the only
  failures are evidence it does not carry yet, or a chain read of block N that
  failed as `too-few` or `no-block` (block N may not exist yet). Decided by the
  human, 2026-10-20: a `hash-mismatch`, `other-chain`, `no-chain-id`, or
  `config` failure of check 6 still surfaces (V-7's chain wording), whatever the
  round's status.
- **A-3. A round that is not one step of two options** is shown as not
  recomputable (V-8's third reason), with checks 1 to 4 and 6 and no retry; the
  spec's scope names Coin Flip only. Decided by the human, 2026-10-20: the shape
  check stays, but the page does not name the game: the summary says "one step,
  two options", and the not-recomputable text says the page recomputes rounds of
  that shape only. One helper (`isOneStepTwoOptions`, in `round-evidence.ts`)
  holds the test.
- **A-4. Check 3 does not compare `newRound.actionKey`** with anything: the page
  has no player key, so the `signature/create-round-auth-action-key` vector,
  refused by the shell, passes check 3 on the page. Decided by the human,
  2026-10-20: confirmed. The action key is listed under "shown, not checked"
  (V-13).

Also decided by the human, 2026-10-20: a malformed signature (a bad length or
`v`, which the Snapshot schema's `Signature65` pattern refuses) fails the body's
validation and shows V-10, not a check 3 mismatch; only a high `s` or an
out-of-range `r` reaches check 3. The configuration-error state offers "try
again" for a document that could not be fetched or read, and no control for an
invalid one (V-3).

## References

- [wrapper.md](./wrapper.md): W-39 (the verify link), W-26 (the checks this page
  repeats), W-43 (timeouts), W-45 to W-48 (accessibility),
  [Configuration](./wrapper.md#configuration).
- [The game iframe and the controller boundary](./wrapper/the-game-iframe-and-the-controller-boundary.md)
  (W-39).
- [The cryptography](./client-kit/the-cryptography.md) (`hashNewRound`,
  `hashRandomnessTarget`, `hashReady`, `recoverAddress`).
- [client-kit.md](./client-kit.md#how-the-wrapper-reaches-the-superengine-origin)
  (the release artifact, SRI, the policy),
  [Testing and CI](./client-kit/testing-and-ci.md) (the size budget, the e2e
  harness).
- The verify API document (backend, not yet published).
- The SuperEngine fairness kernel, kernelVersion 1 (public fairness contract;
  its public vector sets are vendored into `contracts`:
  [how the kit gets its contracts](./client-kit/how-the-kit-gets-its-contracts.md)).
