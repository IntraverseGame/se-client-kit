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
verify API read, built to the vendored verify API document
(`GET /verify/v1/rounds/{roundId}`) and confined to its own modules; the page's
HTML and module entry (`index.html`, `src/main.ts`, mounting at `#verify-root`),
and the build and release (V-15 to V-17); and the e2e fake of the verify API
with its browser rows VT-5 to VT-8
([The e2e fake](#the-e2e-fake-of-the-verify-api-built)). The verify API document
is vendored into `contracts` (`schemas/verify.v1.openapi.yaml`, with its
generated types); what it does not yet carry (the on-chain record and the
proofs) is still marked `TODO(verify API)`, deferred to #155. The request is
`play-client`'s `getRoundVerification` (A-1). Its four design decisions were
made by the human on 2026-10-18, and five more on the kernel derivations on
2026-10-19 ([Decisions](#decisions)). **Book rounds** (#156,
[Book rounds](#book-rounds-v-18-to-v-21), V-18 to V-21) are built: their seven
questions were decided by the human on 2026-10-29
([Decisions](#decisions-book-rounds-156)); what the kit cannot check yet (the
draw, the table, and the payout) is shown as not checked and marked
`TODO(kernel vectors, #156)` and `TODO(verify API, #156)`.

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
- book rounds (`playback`, W-50): the checks the kit can recompute from the
  verify API's body, with the draw itself shown as not checked until the kernel
  publishes vectors for it ([Book rounds](#book-rounds-v-18-to-v-21), #156);
- recomputation with the kit's own code (`signing`, the round id and its
  `bytes32` form, the pinned values of the environment configuration) and a
  quorum read of the entropy chain;
- its build, its place in the Wrapper's release artifact, and its tests.

Out of scope:

- the verify API itself and its response body (the backend's, by name: the
  verify API document);
- recomputing a book round's weighted draw, its table (`merkleRoot`,
  `entryCount`, `totalWeight`), and its payout: shown, never claimed as checked,
  until the kernel has public vectors for them and the page can read the table
  (V-19, check 8);
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
- **Consumes:** the verify API document (vendored into `contracts` with its
  generated types, as
  [the contracts package](./client-kit/the-contracts-package.md) describes); the
  Snapshot schema's `RoundId` and `RoundIdBytes32` definitions; the environment
  configuration document the Wrapper reads
  ([wrapper.md](./wrapper.md#configuration)).

## Contract

### Vocabulary

- **Round id:** the Snapshot's `roundId`, a UUIDv7 in canonical lowercase text
  (the Snapshot schema's `RoundId`).
- **Evidence:** the round's public fields the verify API returns: the document's
  `RoundVerification`, in the page's own names
  ([The evidence](#the-evidence-from-the-verify-api-document)). Where this spec
  names a field of the evidence (`newRound`, `randomnessProof`, `fairnessProof`,
  `config.steps`), it is the page's name for it, and that section maps it to the
  document's field.
- **Recomputed:** every check of
  [What the page recomputes](#what-the-page-recomputes) that applies to the
  round ran in the browser and passed.

### The URL and where the page is served (V-1, V-2)

- **V-1.** The page is a set of static files under the path `/verify/` of the
  origin that serves it. `verifyBaseUrl` (the environment configuration's field)
  is that origin plus `/verify`, with no trailing slash. In preview the page is
  served next to the built Wrapper, on the Wrapper's origin, and `verifyBaseUrl`
  is the Wrapper's origin plus `/verify` (decided by the backend's TPO,
  2026-10-18, and recorded in the backend's documentation at b6e1e48, which
  names `verifyBaseUrl` as this configuration field). On staging the page lives
  on its own site, the verifier's Pages project (TPO, 2026-10-27;
  [client-kit.md](./client-kit.md#how-the-wrapper-reaches-the-superengine-origin)),
  not on the Wrapper's origin: `verifyBaseUrl` is the verifier site's origin
  plus `/verify`, and a round's page is
  `https://<verifier host>/verify/rounds/{roundId}`. That site serves the page
  for every path that is not a file, so this URL loads it; a path outside
  `/verify/` (such as `/rounds/{roundId}`) loads the page too, but it is not
  under `verifyBaseUrl`, so the page shows the empty form.
  <!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). The production verifier site's origin, so production's `verifyBaseUrl`; a configuration value, never written in this repository. Reason: ADR-008 deploys staging only; production is to come. -->
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
  - On staging's verifier site there is no rewrite rule: Pages serves the same
    page, copied to the site's root, for every path that is not a file
    (`/verify/rounds/*` included), with the page's headers, and the site's API
    proxy forwards `/verify/v1/` to the verify API
    ([client-kit.md](./client-kit.md#the-pages-api-proxy)).
  - The rewritten path is served with the same headers as the page (this spec's
    rule, V-16 and Security).
  - **The verify API is read from the page's own origin only** (D-10, decided by
    the TPO, 2026-10-27): it sends no CORS headers on any surface, so
    `verifyApiBaseUrl` is always the page's own origin plus `/verify/v1`, a read
    that needs no CORS. In preview the edge routes `/verify/v1/` on the
    backend's origin (b6e1e48); on the Pages sites each site's API proxy
    forwards it ([client-kit.md](./client-kit.md#the-pages-api-proxy)). A
    cross-origin `verifyApiBaseUrl` is not supported: the configuration's
    validation refuses it (V-3a).
  <!-- TODO(hosting, #133): deferred to #133 (owner: infrastructure owner). The same `/verify/v1/` route and `/verify/rounds/*` serving, with the page's headers, on production's sites. Reason: ADR-008 deploys staging only (done there by each site's proxy and Pages' fallback); production is to come. -->

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
  derived or defaulted, and its origin is the page's own (V-3a). The field is
  part of the one configuration schema: the Wrapper's validator accepts it and
  does not use it ([wrapper.md](./wrapper.md#configuration)), and refuses a
  document without it (`invalid-verify-api-base`). Before this change the
  Wrapper refused it as an unknown field, so **the Wrapper's acceptance of the
  field ships before, or in the same release as, any configuration document that
  carries it**; and, the field being required, the configuration document of
  every environment is updated in that same release, since the Wrapper that
  accepts the field refuses a document without it.
- **V-3a. The verify API base is on the page's own origin.** The verify API
  sends no CORS headers, so a same-origin read is the only one (V-2, D-10). Both
  validators refuse a document whose `verifyApiBaseUrl` has an origin (scheme,
  host, and port) other than the origin of the page that reads it: the verify
  page's validator compares it with the page's `location.origin`, and the
  Wrapper's with its own (the SE origin), each given to the validator by its
  caller, never read inside it. The refusal is the field's own,
  `invalid-verify-api-base` at `verifyApiBaseUrl`, naming the field and never
  the value. Every configuration document sets the field to the page's own
  origin plus `/verify/v1` (staging's are written so by the Pages deploy, from
  each site's own origin). The verify page's header policy
  (`verifyContentSecurityPolicyFor`) is built from a validated document only, so
  the origin it names for the verify API is always the page's own.

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
  politely. A request times out after 15 s (as W-43's SHOULD). A read that a
  newer one replaces (a new submit, a retry, back or forward to another round or
  to the form) is aborted, not just ignored: its API request and, once the round
  is found, its chain requests (V-12, check 6) end, and nothing of it is shown,
  not even an error. An abort is never V-10 or V-11, never a failed or
  unverified check, and never an endpoint that disagreed or did not answer; a
  chain request that times out is still "no answer" (D-1).
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
  recompute it, for one of five reasons:
  - the round has not ended (`won`, `lost`, and `canceled` are the ended
    statuses): the page shows what it could check, says the rest waits for the
    round's end, and offers to check again;
  - the round's kernel version is one this page does not know (V-12a): the page
    says it cannot recompute rounds of that kernel version, names it, runs no
    derivation, and offers no retry;
  - the round was voided or refused (A-5): the page says so, and offers no retry
    (below);
  - the round is not a one-step, two-option config round (A-3): the page says it
    recomputes rounds of that shape only, shows checks 1 to 4 and 6, runs no
    derivation of checks 5 and 7, and offers no retry;
  - the round is a book round that has ended and its draw (check 8) could not be
    recomputed (V-20): the page shows the checks it ran, the result and the
    payout as the verify API reports them, says the draw, the multiplier, and
    the payout are not checked, and offers no retry. A book round never reaches
    this state with a failed check (that is V-7).

  A **voided** round (`idle` with a `voidReason`) and a **refused** round
  (`idle` with a `rejectCode`, refused before any money moved) will never be
  played, so they are not "not ended": the page's heading says "This round was
  voided" or "This round was refused", the text says it will not change and
  there is nothing to wait for, there is no "check again", and it shows the
  checks that could be made. It shows only that wording: the `voidReason` and
  the `rejectCode` are the backend's codes and are not shown. A failed check
  still makes the verdict V-7, before this.

- **V-9. Not found.** The API answered that it has no such round: `404`, with an
  `application/problem+json` body whose `code` is `NOT_FOUND`. The page says so,
  shows the id it looked for, and offers the form. It branches on the status,
  not on the body.
- **V-10. API error.** The API answered with an error (any other 4xx or 5xx), or
  with a body that does not validate against the verify API document's schema.
  The page says the verification service could not answer, offers to try again,
  and claims nothing about the round. A body that fails validation is never
  partly used. The document's errors are `400` (`INVALID_ARGUMENT`: the round id
  is not a UUIDv7 in lowercase, which the page's own check (V-4) keeps from
  being sent), `429` (`RATE_LIMITED`, with `Retry-After`), `500` (`INTERNAL`),
  and `503` (`UNAVAILABLE`), each an `application/problem+json` body with a
  `code` and a `retryable` hint; the page treats every one of them alike and
  does not read the body, so a `code` added later changes nothing.
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
  the round's kernel version, which the verify API's response carries as
  `kernel.version` (an integer from 1; `kernel` also names the kernel and lists
  its public vector sets, which the page does not use; the Snapshot has no such
  field). A round whose kernel version is not one the page implements is shown
  as not recomputable (V-8): the page never applies one kernel version's
  derivation to a round of another, and never guesses. Checks 1 to 4 and 6 do
  not depend on it.

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
     is not run, since it has no agreed block hash. The block number is
     `entropy.block`, an `int64` in the document: the page reads a JSON integer
     as `bigint`, and a value that is not a safe integer (above 2^53 − 1, which
     `JSON.parse` would already have rounded) fails the body's validation.
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
  shown only when present; the verify API document has no field for them, its
  `onchain_record` and `proofs` checks being "not available yet", so today none
  is present); and, for a `canceled` round without reveals, checks 5 and 7; and
  `newRound.actionKey` (A-4: the page has no player key to compare it with). For
  a book round (V-20), also: the drawn row and its multiplier (check 8), the
  mode's table (`merkleRoot`, `entryCount`, `totalWeight`), its `cost`, the
  game's `packageHash`, the payout, and that the round's commitment and block N
  were fixed before block N existed (a book round has no signed authorization in
  the document, so the binding of checks 2 and 3 does not apply). Links from the
  evidence (`blockExplorerUrl`, `explorerUrl`, `proofLink`) are shown as text,
  not as links, in the first release: they come from the API the page does not
  trust.
  <!-- TODO(verify API, #155): deferred to #155 (owner: backend). The on-chain record and the proofs, when the document carries them (its `onchain_record` and `proofs` checks); they stay "not available yet" until the backend's on-chain anchoring lands. Reason: the vendored verify API document does not carry them yet. -->
- **Which package does what.** `signing` for every keccak256 hash and the
  signature recovery (it has no kit dependency at run time); Web Crypto for
  SHA-256; `apps/verify` for StepsDerive and the kernel's rules; the vendored
  schemas in `contracts` (runtime entry) for the round id pattern and the verify
  API document's types; a validator for the API's body, which has a schema of
  its own and embeds no Snapshot (so `snapshot` does not apply), hand-written
  over the document's generated types and held to the document's patterns by a
  test (`tools/verify-api-patterns.test.ts`); the verify API request, through
  `play-client`'s `getRoundVerification` (A-1), whose body stays `unknown` until
  the page's validator (`verify-body.ts`) reads it; the chain read through the
  page's own read-only JSON-RPC module (check 6). The page never imports
  `shell`: it holds no credential, and the shell's code does not belong in its
  bundle.
- **Amounts** are strings in the evidence and `bigint` where compared, never a
  JS `number` (the kit's rule).

### The evidence, from the verify API document

`GET <verifyApiBaseUrl>/rounds/{roundId}` answers `RoundVerification`. The page
validates the fields it uses, and the ones the document requires of the rest
(`closed`, `bet`, `game`, `actions`, `checks`, and the shapes inside them), and
maps them to the evidence its checks take. A field that is present and malformed
fails the whole body (V-10); a field the page does not know is ignored. The page
never reads the document's own verdict: `checks` and `recomputed.kind` are
validated and unused, and the result is the page's own (Security). The map:

| The page's evidence                                     | The document's field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roundId`, `status`, `closeReason`                      | `roundId`, `status` (`idle`, `starting`, `active`, `resolving`, `won`, `lost`, `canceled`), `closeReason` (`expired`)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `kernelVersion`                                         | `kernel.version` (V-12a)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `newRound`                                              | `commitment.createRoundAuth.newRound`: `abi.encode(NewRound)`, 352 bytes, decoded by the page (below)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `createRoundAuth.prepareWindow`, `expiry`, `signature`  | `commitment.createRoundAuth.prepareWindow`, `expiryUnix` (read as a decimal string), `signature`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `createRoundAuth.domain`, `signer`                      | `commitment.registryChainId`, `registryAddress` (the `verifyingContract`), `commitment.adminSigner`; compared with the configuration (check 3); the digest uses the configured domain, never these                                                                                                                                                                                                                                                                                                                                        |
| `createRoundAuth.entropyChainId`                        | `entropy.chainId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `randomnessProof.source`, `blockNumber`, `blockValue`   | `entropy.source`, `entropy.block` (read as `bigint`), `entropy.value` (optional)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `randomnessProof.roundSecretHash`, `roundSecret`        | `commitment.roundSecretHash`, `reveal.roundSecret`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `fairnessProof.seedHash`, `readyHash`, `seed`           | `seedHash`, `readyHash`, `reveal.seed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `terms`                                                 | `game.terms.nodes` (`options`, `losers`, `next`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `steps` (`optionCount`, `selectedIndex`, `losingIndex`) | `recomputed.steps` (`node`, `option`, `losers`): the API's replay of the round, which the page compares with its own (check 7); `optionCount` is the node's `options`; `losingIndex` is the only entry of `losers` and is absent when the replay names none or several                                                                                                                                                                                                                                                                    |
| `payout` (`formatted`, `value`, `unit`)                 | `payout` (`amount`, `currency`, `decimals`); `formatted` is written by the page from the base units and `decimals` by `bigint` arithmetic (`1.94 EUR`), as the document carries no formatted string                                                                                                                                                                                                                                                                                                                                       |
| `book` (`mode`, `drawn`, `cost`, `table`, `apiDraw`)    | `book` (`BookVerification`): `mode`, `drawn` (`DrawnRow`: `index`, `multiplierMilli`), `cost`, and the table's `merkleRoot`, `entryCount`, `totalWeight` (V-21); with what a book round's checks read elsewhere in the body: `game.packageHash`, `recomputed.draw` as `apiDraw` (the API's own redraw, never the page's result; compared with `book.drawn` for consistency only, V-19 check 8), `entropy.chainId` (check 6), and `reveal.seed` (check 7: a book round has no `seedHash`, so no `fairnessProof`); a book round only (V-18) |

The page also validates, and does not use, `bet`, `game`'s other fields, `shape`
beyond A-3, `transcriptHash`, `reveal.configuration`, `actions` (the signed
actions and their transcript), `voidReason`, `rejectCode`, and `closed`. The
document's `transcript`, `action_signatures`, `configuration`, and `payout`
checks (the kernel's replay of a round from its signed actions) are not among
this page's checks; they are a later increment, not claimed.

**`newRound`.** The document carries it as bytes. The page decodes the eleven
32-byte words in `NewRound`'s order (`roundId`, `playerRef`, `currency` as ASCII
`bytes32`, `betAmount` as a `uint128`, `gameId`, `gameVersion`, `circuitVersion`
as `uint32`, `roundSecretHash`, `randomnessTarget`, `actionKey`,
`payoutTermsHash`), encodes the decoded fields again with `signing`'s
`hashNewRound`, and requires that hash to equal the `keccak256` of the bytes it
was given. Bytes that are not the canonical encoding of what they decode to
(non-zero padding, a unit that is not ASCII, a length other than 352) fail the
body's validation (V-10), so no check reads a field the signed bytes do not
carry. Check 3's `created` is the same hash.

**What a round may not carry.** `commitment`, `entropy`, `reveal`, `seedHash`,
`readyHash`, `payout`, and `recomputed` are optional in the document (a round
not yet bound, one refused before money moved, a voided one, a `ROOT_LOST` one).
The page then has no `randomnessProof` (it needs `entropy.source`,
`entropy.block`, and `commitment.roundSecretHash`) or no `fairnessProof` (it
needs `seedHash`), and each check that needs what is missing fails on an ended
round and waits on a round that has not ended (A-2). A `createRoundAuth` without
`registryChainId`, `registryAddress`, `adminSigner`, or `entropy.chainId` is a
malformed body (V-10), since the authorization cannot be read without them.

### Book rounds (V-18 to V-21)

Built (#156; [What is built](#what-is-built)). Written to the vendored verify
API document only: its `BookVerification`, `DrawnRow`, and `Recomputation.draw`
schemas and its `Check` descriptions for a book round. The document sets `book`
for every book round, with `mode` always; `drawn` on `won` and `lost`; `cost`,
`merkleRoot`, `entryCount`, and `totalWeight` once the round is closed with a
seed; and `recomputed.draw`, the API's own redraw, for a book round closed with
a seed. It says a book round has no `newRound`, `seedHash`, `readyHash`, or
signed actions, so its `randomness_target`, `ready_hash`, `transcript`, and
`action_signatures` checks are `not_applicable`. The Wrapper keeps its verify
link after a book round ends (W-39), so the page answers every valid book body
with a round, never with V-10.

**What the kernel's public vectors cover for a book round.** The vendored sets
are `kernel/public/v1/seed`, `shuffle-draw`, `steps-derive`, and `derive`
([The kernel's vectors](#what-the-page-recomputes-v-12-v-13)). Of what a book
round needs, only `kernel/public/v1/seed` applies: its vectors give both
`Seed(blockValue, secret)` and `SeedHash(seed)` for 32-byte inputs, so they
replay the seed (check 7) and the SHA-256 of a 32-byte value that both
commitments of check 5 use. There is no vector for the weighted draw over a book
mode's table, for the table's Merkle root, or for the payout rule.
<!-- TODO(kernel vectors, #156): deferred (owner: backend, the fairness kernel). Public kernel vectors for a book round: the weighted draw from a seed over a mode's table (the drawn row and its multiplier), the table's Merkle root, entry count, and total weight, and the payout rule `floor(bet / cost × multiplierMilli / 1000)`; and a `roundSecretHash` vector. Reason: kernel/public/v1 has seed, shuffle-draw, steps-derive, and derive only; until such vectors are vendored, check 8 and the payout are shown as not checked (V-19). -->
<!-- TODO(verify API, #156): deferred (owner: backend). A way for the page to read a book mode's table (its rows, weights, and multipliers) and prove it against `merkleRoot`: the verify API's body carries only the root, the entry count, and the total weight, so even with a vector the page cannot redraw. Reason: the vendored verify API document does not carry the table or a Merkle proof of the drawn row, and its `SimpleMerkleTree` leaf encoding is not stated. -->

- **V-18. A book round is a body that carries `book`.** A body without `book` is
  a config round and is read as before. A body that carries `book` together with
  `commitment.createRoundAuth`, `readyHash`, or a non-empty `actions` is
  contradictory (the document says a book round has none of them) and fails the
  body's validation (V-10): the page never picks a kind of round for the API, so
  a config round cannot be passed off as a book round to skip checks 2 to 4.
  A-3's shape test does not apply to a book round: `game.terms` and `shape` are
  validated as before and not read. Kernel versions are read as for a config
  round (V-12a): a book round of a kernel version the page does not implement is
  V-8, and check 7 is not run.

- **V-19. The checks for a book round.** The page runs checks 1 to 8 in the same
  numbering as V-12; each is shown as "matches", "mismatch", "not checked" (with
  its reason), or "does not apply" (with its reason). "Does not apply" and "not
  checked" are never shown or counted as passed.
  - **Check 1, round id.** The body's `roundId` is the id the page asked for.
    The `bytes32` half does not apply: there is no `newRound`.
  - **Checks 2 to 4** (entropy target, the backend's signature, ready evidence):
    do not apply. The round has no signed creation authorization and no ready
    evidence in the document; the page says so, and lists the binding they would
    have given under V-13.
  - **Check 5, commitment and reveal.** Recomputed:
    `commitment.roundSecretHash = SHA-256(reveal.roundSecret)`, the same rule
    and code as V-12's check 5 (the SHA-256 of a 32-byte value that
    `kernel/public/v1/seed`'s `seedHash` results replay; there is no
    `roundSecretHash` vector, as for a config round). The `seedHash` half
    applies only when the body carries `seedHash` (the document says a book
    round has none): when present it is recomputed as `SHA-256(reveal.seed)`,
    when absent it does not apply. A `won` or `lost` book round always carries
    `roundSecretHash`, `roundSecret`, and `seed`; a missing one is a mismatch.
  - **Check 6, block N.** As V-12's check 6: the quorum read of `entropy.block`
    on the chain the configuration pins for `entropy.source`, and
    `entropy.value`, when present, equal to the hash the quorum agreed on. A
    source the configuration does not list fails check 6 (`config`), since check
    2, which refuses it for a config round, does not apply. When
    `entropy.chainId` is present it MUST equal the chain id the configuration
    pins for the source.
  - **Check 7, seed.** Recomputed: `SHA-256(blockValue || roundSecret)`, with
    `blockValue` the hash check 6 agreed on, never the API's, MUST equal
    `reveal.seed`; replayed against `kernel/public/v1/seed`. The outcome half of
    V-12's check 7 (StepsDerive and the pick) does not apply.
  - **Check 8, the draw** (book rounds only). What it would check: the kernel's
    weighted draw from the seed over the mode's table gives `book.drawn` (its
    `index` and `multiplierMilli`), and the round's `won` or `lost` follows from
    that row. **Not checked**, with the reason "the kit has no public kernel
    vector for the weighted draw, and the verify API does not carry the mode's
    table" (the two TODOs above). The page also compares `book.drawn` with
    `recomputed.draw` when both are present: this is the API's two values
    agreeing with each other, not a redraw, so agreement is shown as "the verify
    API's recorded and redrawn rows agree (not recomputed by this page)" and
    leaves check 8 "not checked"; disagreement makes check 8 a mismatch (V-7),
    naming both rows.

  **The payout** of a book round is shown, not checked (V-13): the document's
  rule is `floor(bet / cost × multiplierMilli / 1000)` over the drawn row's
  multiplier, which the page has not recomputed, and the kernel has no vector
  for it (the TODO above). When it is checked, it is computed in `bigint` as
  `floor(bet × den × multiplierMilli / (num × 1000))` for a `cost` of `num/den`
  (`den` is 1 when `cost` has no `/`).

- **V-20. What the page shows for a book round.** The summary names the kind of
  round, not a game: "a drawn round, mode `<mode>`" (the mode as text).
  - **Not ended** (`idle` with no `voidReason` or `rejectCode`, `starting`, and
    `active` or `resolving`, which the Snapshot never shows for a book round but
    the document allows): V-8, "not ended", with "check again", A-2's rules for
    evidence it does not carry yet.
  - **Voided or refused**: V-8 as for a config round (A-5 (b)).
  - **Unknown kernel version**: V-8 as for a config round.
  - **`won` or `lost`**: a failed check is V-7 (V-7's chain wording when check 6
    is the only one); otherwise V-8's book reason: heading "This round's draw
    was not recomputed"; the text says the page recomputed the round secret's
    commitment, block N, and the seed, and that the drawn row, its multiplier,
    and the payout are the verify API's and not checked. It shows the result
    (`won` or `lost`) and the payout's `formatted` text, each labeled "as the
    verify API reports it", never as established, and offers no retry. When a
    later increment can run check 8, a book round whose checks all pass or do
    not apply reaches V-6.
  - **`canceled`** (the Snapshot refuses it for a book round; the document does
    not): read, not refused. Checks 1 and 5 to 7 run under V-12's rules for a
    `canceled` round (reveals not guaranteed: without them checks 5 and 7 are
    "not checked"); check 8 does not apply (no row was drawn); with no failed
    check it is V-6, showing `canceled`.
  - **Shown, not checked** (V-13), each labeled so: `mode`, the drawn row
    (`index`, and `multiplierMilli` written as a decimal multiplier with three
    places, `1.940×`, by string or `bigint` arithmetic, never a JS `number`),
    `recomputed.draw`, `cost` as its text, `merkleRoot`, `entryCount`,
    `totalWeight`, and `game.packageHash`. A field the body does not carry
    (`drawn` before the draw, the table before the close) is shown as "not
    reported", never as an error.

- **V-21. Validating the book fields.** Under the evidence's rules (a field
  present and malformed fails the whole body, V-10; a field the page does not
  know is ignored):
  - `book`: an object with `mode`, a string (shown as text); `drawn`, `cost`,
    `merkleRoot`, `entryCount`, and `totalWeight` are optional, and their
    absence on any status is not a validation failure.
  - `DrawnRow` (`book.drawn` and `recomputed.draw`): `index`, an integer
    (`int64`) from 0, read as `bigint`; a value that is not a safe integer
    fails, as `entropy.block` does; `multiplierMilli`, a string matching
    `^(0|[1-9][0-9]*)$` of at most 78 digits (an amount's limit), read as
    `bigint` only where compared (check 8) or formatted (V-20).
  - `cost`: a string matching `^[1-9][0-9]*(/[1-9][0-9]*)?$`, kept as text; its
    numerator and denominator are read as `bigint` when used. A fraction not in
    lowest terms is accepted: the payout rule gives the same floor for any
    scaling of `num/den`.
  - `merkleRoot`: `Hex32`. `entryCount`: an integer (`int64`) from 1, read as
    `bigint`, a value that is not a safe integer failing. `totalWeight`: a
    string matching `^[1-9][0-9]*$` of at most 78 digits, read as `bigint`. A
    longer multiplier or weight fails the body, so no unbounded text is read as
    `bigint`.
  - The patterns are the document's, held to it by
    `tools/verify-api-patterns.test.ts` as the others are.
  - No amount, weight, count, or multiplier of a book round is ever a JS
    `number`.

### What is built

`apps/verify` holds what the Status line lists: checks 1 to 4 and 6, the
configuration read, the page's states and view, and the verify API read, each
with its tests. Its kernel derivations of checks 5 and 7 for a one-step,
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
- **Book rounds** (V-18 to V-21, #156), with VT-11's unit tests
  (`book-body.test.ts`, `book-checks.test.ts`, `book-verdict.test.ts`) and
  VT-4's (`render-book.test.ts`):
  - `verify-book.ts` validates `book` and `DrawnRow` (V-21) and builds the book
    round's evidence (`round-evidence.ts`'s `BookEvidence`: the book's fields,
    `game.packageHash`, `recomputed.draw` as `apiDraw`, `entropy.chainId`, and
    `reveal.seed`); a body with `book` and `createRoundAuth`, `readyHash`, or a
    signed action is refused there (V-18). Indexes, counts, and weights are
    `bigint`; `multiplierMilli` stays its base-10 text and is read as `bigint`
    where check 8 compares it.
  - `verifyRound` hands a body with `book` to `verifyBookRound`
    (`book-checks.ts`), which runs V-19's checks and V-20's verdict:
    `bookVerdictOf`, and the new V-8 reason `book-draw`. Checks 5 and 7 use the
    kernel's code through `book-fairness.ts` (`checkBookCommitments`,
    `checkSeed`); check 7 is titled "Seed" for a book round. A check that does
    not apply has its own status, `not-applicable` ("does not apply"), never
    shown or counted as passed. Check 5 needs `roundSecretHash` and
    `roundSecret` (and `reveal.seed` only when the body has a `seedHash`); check
    7 needs `roundSecret` and `reveal.seed`; an ended round missing one fails
    that check with what is missing.
  - Check 8's two rows are labelled in the view as the verify API's
    (`recomputed.draw (the verify API's redraw)` and
    `book.drawn (the verify API's record)`), never as "recomputed" and
    "evidence" (a `Comparison` may carry its own `labels`).
  - The verdict's types and the parts both kinds of round share (the kernel
    check's result, the ended statuses, A-2's wait, the verdict of failed
    checks, and `isKnownKernel`) are in `round-report.ts`.
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

- **The verify API read** (`verify-api.ts`, over `play-client`'s
  `getRoundVerification`: one attempt, no credential, the 15 s timeout, and its
  typed errors mapped to V-9 to V-11: a `ProblemError` or `ProtocolError` with
  status `404` is not found, any other is an API error, a `NetworkError` is
  unreachable, except one the caller aborted, which is `aborted`, neither V-10
  nor V-11). `readRound(roundId, signal?)` takes the read's `AbortSignal` and
  passes it to `play-client`'s `signal` request option; `play-client` already
  has that option (its request layer spec: "a request may carry the caller's
  abort signal", `specs/client-kit/the-play-client-request-layer.md`), so its
  API does not change. The port's answers are `found`, `not-found`, `error`,
  `unreachable`, and `aborted`) and **the body's validation** (`verify-body.ts`,
  with `verify-readers.ts`, `verify-amount.ts`, and `verify-new-round.ts`) are
  the only modules that fetch or parse the API's answer; everything past them
  works on the typed evidence (`round-evidence.ts`). They are built to the
  vendored verify API document
  ([The evidence](#the-evidence-from-the-verify-api-document)); the read is the
  the app's own validation of what `play-client` returns as `unknown` (A-1).
  Amounts (`betAmount`, `payout.value`) and `blockNumber` are read as `bigint`;
  a body that fails validation is an API error and none of it is used (V-10).
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
  back and forward never. A read that a newer one replaced is aborted through
  its `AbortController` (one per read, replaced by the next read and by the
  form), and its answer is dropped if it arrives anyway (a generation number):
  the `aborted` answer shows nothing and is not a state. The checks that follow
  a found round (V-12, the chain read) take the same signal
  (`verify(config, evidence, asked, signal)`, `verifyRound`, `checkBlock`, and
  `readBlockHashByQuorum`, each with an optional trailing `signal`): the
  caller's abort and the 15 s timer both end a request through one internal
  controller, and a call tells them apart by the caller's signal. A timeout is
  `undefined`, no answer, as before; an abort makes the call, the quorum read,
  and `verifyRound` reject with an `AbortError` (`verifyRound` checks the signal
  again after its recompute, so an abort that lands there rejects too), so no
  report exists for an aborted run and no endpoint is counted as silent or as
  disagreeing. The controller shows nothing for that rejection (the generation
  has moved), where any other rejection of the checks is an API error. A valid
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
  allow-list. It depends on `signing`, `contracts` (runtime entry), and
  `play-client` (the verify API read, A-1); it does not need `snapshot`, since
  the verify API's body embeds no Snapshot; and it **never depends on `shell`**
  or the `contracts` test-only entry; the import-direction lint refuses both. As
  a new workspace it passes the add-a-package checks, and the packages spec, the
  dependency direction in `AGENTS.md`, the import-direction lint and its test,
  and the architecture memory are updated in the pull request that adds it.
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

| Situation                                                                           | Behavior                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| id with upper-case hex, or white space around it                                    | normalized (V-4), then checked                                    |
| id that is a UUID but not v7, or not canonical                                      | refused by the pattern (V-4); no request                          |
| unknown round                                                                       | not found (V-9)                                                   |
| round not ended                                                                     | not recomputable (V-8), with "check again"                        |
| unknown `kernelVersion`                                                             | not recomputable (V-8), no derivation run                         |
| `canceled` without reveals                                                          | checks 5 and 7 "not checked" (V-13)                               |
| `won` or `lost` without a reveal                                                    | check 5 fails: mismatch (V-7)                                     |
| RPC endpoints disagree, or too few answer                                           | check 6 fails: could not verify the chain (V-7)                   |
| `blockValue` differs from the chain's hash                                          | check 6 fails: mismatch (V-7)                                     |
| body that fails validation                                                          | API error (V-10); nothing of it is shown as fact                  |
| a source the configuration does not list                                            | check 2 fails: mismatch (V-7)                                     |
| signature that recovers to another signer, or has a high `s` or an out-of-range `r` | check 3 fails: mismatch (V-7)                                     |
| signature of the wrong length or with a bad `v`                                     | body fails validation: API error (V-10)                           |
| configuration document not fetched or not read                                      | configuration error with "try again" (V-3)                        |
| invalid configuration document                                                      | configuration error, no control; no request (V-3)                 |
| offline, or a request blocked by the policy                                         | API unreachable (V-11)                                            |
| a read replaced by a newer one (submit, retry, back, forward, the form)             | the older API and chain requests are aborted; nothing of it shows |
| two checks fail                                                                     | every failed check is listed (V-7)                                |
| a book round that ended, every check it can run passing                             | V-8's book reason: the draw is not recomputed (V-20)              |
| `book` with `createRoundAuth`, `readyHash`, or signed actions                       | body fails validation: API error (V-10, V-18)                     |
| a book round without `drawn` or the table fields                                    | read; shown as "not reported" (V-21)                              |
| `book.drawn` differs from `recomputed.draw`                                         | check 8 fails: mismatch (V-7)                                     |
| a book round whose `entropy.chainId` is not the configured one                      | check 6 fails: mismatch (V-7)                                     |

## Security

- **The page recomputes; it does not trust the API's verdict.** If the API
  returns a verdict field, the page does not show it as the result; the result
  is the page's own checks. The trust anchors are the environment
  configuration's pinned values, as for the Wrapper (OQ-7).
- **No credential.** The page holds no key, no play token, and no launch code,
  and it touches none: it never imports `shell` and never reads the Wrapper's
  session. The round id is public.
- **It shares the Wrapper's origin** where it is served there (preview; on
  staging it is on its own site, V-1, and the rules below hold all the same).
  The page is served under `/verify/` on the Wrapper's origin, so it shares that
  origin's Web Locks (the shell's W-14 signing lock), BroadcastChannel, and
  storage with the code that holds the key, and a script injection on the page
  is a script injection on that origin. So the page is part of that origin's
  trusted code: it is held to the same review and supply-chain bar as the
  Wrapper (reviewed source, the dependency allow-list, SRI, the reproducible
  build). It MUST NOT use `navigator.locks`, `BroadcastChannel`, any storage
  (`localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies), or
  workers (dedicated, shared, or service); a source check enforces it (VT-10).
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

| Row   | Level               | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VT-1  | unit                | the round id: normalization, the schema's pattern (v7 only, canonical), the path parser for `/rounds/{id}` (empty, extra segments, encoded characters), and the URL the Wrapper builds (W-39); `verifyApiBaseUrl`'s rule, and the Wrapper's schema accepting it; V-3a in both validators: the page's own origin accepted, another host, scheme, or port refused (`environment-config.test.ts` of each app, and the shared documents of `tools/config-parity.test.ts`), and the verify page's policy built only from a same-origin value (`release.test.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| VT-1a | unit                | the chain read (check 6): a quorum that agrees passes; another chain id, too few answering, a timeout, an endpoint with a chain id but no block, and two hashes fail in W-26b's order, and a refused configuration (`config`) asks nothing; `fetch` is called unbound; `blockValue` present and equal, present and different, absent; the one-endpoint degraded indicator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| VT-1b | unit                | the kernel version (V-12a): kernel 1 runs the derivations, an unknown one shows V-8 and runs none; a `canceled` round without reveals shows checks 5 and 7 as "not checked"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| VT-2  | unit                | each check of V-12 against the vendored vectors, each with a passing case and a case per failure: checks 1 to 4 against `created`, `ready`, and the `signature/` Snapshot vectors' `randomnessTarget` and signature verdicts; checks 5 and 7 (SHA-256, the seed, StepsDerive, Coin Flip's outcome) against the fairness kernel's public vectors (the SuperEngine fairness kernel, kernelVersion 1: `kernel/public/v1/seed`, `kernel/public/v1/shuffle-draw`, `kernel/public/v1/steps-derive`, and `kernel/public/v1/derive`, read through the `contracts` test-only entry as `kernelVectors.v1`), and `roundSecretHash` against its definition until the kernel has a vector for it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| VT-3  | unit                | the body's validation: a body the verify API document's schema refuses is an API error, never a partial result; amounts read as `bigint`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| VT-3a | unit                | the abort of a read: the verify API port sends the read's signal, ends the request when it aborts, and answers `aborted` (neither V-10 nor V-11); the controller aborts the earlier read when a newer one starts or the form replaces it, shows nothing for an `aborted` answer, and drops a late answer of a replaced read; it is passed to `fetch` as a signal that is not aborted for the read that stands; the same signal reaches the checks of a found round (`verify`, `verifyRound`, `checkBlock`, the chain read): a newer read or the form ends the chain requests in flight, an aborted run shows nothing and is neither a failed check nor an `api-error`, an aborted chain call is not counted as an endpoint that disagreed or did not answer (it rejects with an `AbortError`, not `too-few` or `hash-mismatch`), a call is not sent when the signal is already aborted, an abort during the recompute of checks 5 and 7 rejects too, the caller's signal keeps no listener after a call resolves, fails, times out, or aborts, and a timeout stays "no answer"                                                                                                                                                              |
| VT-4  | component (jsdom)   | every state V-4 to V-11 (V-8's voided, refused, and book reasons included, the book reason with the result and payout labeled as the API's) and the configuration error renders its heading, text, and control, with no inline style; values from the body render as text. jsdom component tests; the axe scan is in the browser rows (VT-7), as for the Wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| VT-5  | e2e, browser        | against the e2e fake of the verify API: paste a round id and see it matched; open a round's URL directly; a tampered field gives a mismatch naming the check; not found; an API error; the API unreachable (the route aborted); a round not yet ended; a round of a kernel version the page does not know (V-8); a book round's `won` and `lost` (V-20, #156) reach V-8's book reason, never V-10, and a tampered copy names check 5, 6, 7, or 8 (built: `verify-page-book.spec.ts`); the backend's recorded `won` and `lost` rounds match with checks 5 and 7 recomputed, and a tampered copy of each names check 5 or 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| VT-6  | e2e, browser        | from the Wrapper: after a round ends, the verify link opens `<verifyBaseUrl>/rounds/{roundId}` in a new page and that page reaches V-6; after a book round ends (T-24's round, #156), the link's page reaches V-8's book reason, never V-10. Built: `verify-link.spec.ts` (a win, and T-24's round won; the configuration points `verifyBaseUrl` at the Wrapper's origin plus `/verify`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| VT-7  | e2e + audit         | accessibility (V-14): axe on every state, keyboard-only use of the form and the retry, focus after a submit, live regions, 200 % zoom. Built: `verify-page-accessibility.spec.ts` (axe in 15 cases), `verify-page-book.spec.ts` (axe on V-8's book reason) and `verify-page-keyboard.spec.ts` (keyboard, focus, live regions, indicator, zoom)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VT-8  | e2e + build check   | the policy and SRI: the page loads with the `headers.json` policy and no violation, every script and stylesheet carries `integrity`, and no request leaves the configured origins. Built: `verify-page-policy.spec.ts` against the built bundle's own `headers.json` (see the e2e section)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| VT-9  | release dry run     | the page is inside the artifact under `verify/`, two builds give one digest, and its two size measurements are reported and held to their own limits (D-3), apart from the Wrapper's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VT-11 | unit                | book rounds (V-18 to V-21, #156; built: `book-body.test.ts`, `book-checks.test.ts`, `book-verdict.test.ts`, and the book patterns in `tools/verify-api-patterns.test.ts`): a body with `book` is a book round and one with `book` and `createRoundAuth`, `readyHash`, or signed actions is an API error; each book field's validation (V-21), a present and malformed one failing the body, an absent one not, `int64` values above 2^53 − 1 failing, and `index`, `entryCount`, and `totalWeight` a `bigint`, and `multiplierMilli` kept as base-10 text, read as `bigint` only where compared (check 8) or formatted (V-20); `multiplierMilli` and `totalWeight` capped at 78 digits; checks 2 to 4 "do not apply" and never counted as passed; check 5 (`roundSecretHash`, and `seedHash` only when present) and check 7's seed against `kernel/public/v1/seed`; check 6 with an unlisted source and with another `entropy.chainId`; check 8 "not checked" with its reason, its agreement with `recomputed.draw` leaving it so, and a disagreement failing it; the verdicts of V-20 (not ended, voided, refused, unknown kernel, `won` and `lost` with V-8's book reason, `canceled` at V-6); the result and payout labeled as the API's |
| VT-10 | unit (source check) | `apps/verify`'s sources never reference `navigator.locks`, `BroadcastChannel`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `document.cookie`, `Worker`, `SharedWorker`, or `serviceWorker` (the shared-origin rule), and its `<meta>` policy carries `worker-src 'none'`. Built: `tools/shared-origin.test.ts` scans every non-test source and HTML file of `apps/verify` as text, comments and strings included, for each name as a whole word (`locks`, `cookie`, and `cookieStore` included), with a case per name; the `<meta>` part is checked in `apps/wrapper/src/release-verify.test.ts`, which feeds the page's `index.html` through the release step, and the source HTML itself is checked for no inline script or style and no policy of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**The e2e fake of the verify API** joins the fake Play API in the e2e harness: a
route at the configured verify API base on a `.test` origin, answering
`GET /verify/v1/rounds/{roundId}` from canned rounds, in the vendored verify API
document's shape, built from the vendored vectors (a matching round, a tampered
copy, an unfinished round, a `canceled` round without reveals, an unknown kernel
version, a game of one step with three options, and, for #156, a book round
`won` and `lost` and a tampered copy of each), the not-found answer for an
unknown id, a scripted error, and an abort for the unreachable case; the
harness's RPC routes answer the chain read (agreeing, disagreeing, and silent
endpoints). It is hermetic like the rest of the harness: no real network, and a
request to any other origin fails the test.

### The e2e fake of the verify API: built

In `e2e/tests/harness/` (the suite's harness, never shipped):

- `fake-verify-api.ts`: a context route at the configured `verifyApiBaseUrl` (in
  the suite the Wrapper's origin plus `/verify/v1`, a same-origin read as in
  preview, so no CORS) answering `GET <base>/rounds/{roundId}` per round id:
  `round` (200 with a JSON body), `not-found` (404 with the document's
  `application/problem+json` body, `NOT_FOUND`; also the answer for an id with
  no script), `error` (a scripted status, with a `Problem` body of that status's
  code), `unreadable` (200, not JSON), and `abort` (the request fails:
  unreachable). Answers can be queued (used once, in order) before a standing
  one, so a retry can differ from the first read. Any other method or path is
  recorded as unexpected and fails the test.
- `verify-rounds.ts`: the canned rounds, built at run time from the vendored
  `valid/coinflip-active-ready-hash` vector (the round tests' round) through
  `contracts`' test-only entry and written as the document's `RoundVerification`
  body, the Snapshot's signed values placed in its fields (no vendored vector is
  a verify API body). The matching round is that vector as `canceled` without
  reveals (checks 1 to 4 and 6 match, 5 and 7 "not checked"); the not-ended
  round is the vector as it is (`active`); the unknown-kernel round has
  `kernel.version` 2; a tampered round changes one field per check (2:
  `entropy.block`, 3: `commitment.createRoundAuth.prepareWindow`, 4:
  `readyHash`, 5: both reveals, `reveal.roundSecret` and `reveal.seed`, neither
  hashing to its commitment, so the comparison runs and does not stop at "a
  reveal is missing", 6: an `entropy.value` that is not block N's hash); a check
  1 case serves the matching round under another round id.
- `verify-page.ts`: the page's harness: the bundle's `verify/index.html` served
  for `/verify/` and `/verify/rounds/*` (V-2), the configuration document (the
  round tests' pins, `verifyBaseUrl` the Wrapper's origin plus `/verify`), the
  fake verify API, and the round tests' two fake RPC endpoints (`fake-rpc.ts`:
  agree, disagree, and a silent endpoint) for check 6. The routes carry no
  response headers unless a test sets `verifyPolicy` (VT-8, below).
- `fake-verify-api.spec.ts` tests the fake, the canned rounds, and the RPC
  answers as the page asks them, and `fake-recorded-rounds.spec.ts` the recorded
  rounds (no page load); `verify-page.spec.ts` and
  `verify-page-recorded.spec.ts` are VT-5. The browser rows run against the
  Wrapper's release bundle, which holds the page
  (`apps/wrapper/dist/verify/index.html` with `#verify-root`); a bundle without
  it fails them with a message (they never skip).

- **Book rounds (#156): built.** `verify-book-rounds.ts` builds the canned book
  rounds at run time from the vendored `valid/book-lifecycle-won` and `-lost`
  Snapshot vectors (their `roundId`, `randomnessProof`, `payout`, and draw),
  written as the document's `RoundVerification` body with `book` and
  `recomputed.draw` (no vendored vector is a verify API body). The harness
  computes two values with SHA-256: `reveal.seed` as
  `SHA-256(blockValue || roundSecret)`, and `commitment.roundSecretHash` as
  `SHA-256(roundSecret)`, since the vector's own `roundSecretHash` is a
  placeholder that its `roundSecret` does not hash to (a round whose check 5
  fails could not show V-8's book reason). The mode's `cost` and the table's
  `merkleRoot`, `entryCount`, and `totalWeight` are made-up values of the right
  shape (no vector carries them; the page shows them without checking). A
  tampered copy changes one field per check (5: `commitment.roundSecretHash`, 6:
  `entropy.chainId`, 7: `reveal.seed`, 8: `recomputed.draw.index`). The
  `verifyRounds: "book"` option of `verify-page.ts` (resolved by
  `verify-round-sets.ts`, with `canned` and `recorded`) has the fake RPC
  endpoints give block N the vector's `blockValue`; VT-6 builds the round over
  the hash the round fixtures' fake RPC endpoints give block N instead.
  `fake-verify-book-rounds.spec.ts` tests the canned book rounds (no page load),
  with `json-paths.ts`'s `changedPaths` shared with `fake-verify-api.spec.ts`;
  `verify-page-book.spec.ts` is VT-5's book rows and an axe scan of the book
  reason. No book round is recorded: none had closed on staging when this was
  written.

- `recorded-rounds.ts` and `recorded-rounds/*.json`: two real Coin Flip rounds,
  one `won` (payout 194) and one `lost`, that the backend recorded on its local
  preview stack on 2026-10-20 (anvil, chain id 31337, block 335, ephemeral
  development keys), each the verify API's response as recorded, never edited by
  hand (the formatter ignores them; `recorded-rounds/README.md` says where they
  come from). They are e2e fixtures, not `contracts` vectors. With their reveals
  the page recomputes checks 5 and 7 and every check matches. The
  `verifyRounds: "recorded"` option of `verify-page.ts` configures the page with
  what the recordings carry (`commitment.adminSigner` as `runtimeSigner`, the
  registry address and chain id, the entropy source and chain id; all in the
  response, public) and has the fake RPC endpoints give block N the recorded
  `entropy.value`, so check 6 agrees and check 7 runs over the recorded block
  hash. A tampered copy changes one field: the replay's loser (check 7), or the
  round secret (check 5). The payout amount is never recomputed (V-13), so a
  payout tamper is not a check's failure.

VT-6 to VT-8 are built, each in a spec file of its own:

- `verify-link.spec.ts` (VT-6): the Wrapper plays a win (the round fixtures),
  its verify link (`target="_blank"`, `rel="noopener noreferrer"`) points at
  `<verifyBaseUrl>/rounds/{roundId}`, and clicking it opens a new page, which is
  the bundle's verify page against the fake verify API and the fake RPC
  endpoints and reaches V-6. The configuration for this test puts
  `verifyBaseUrl` on the Wrapper's origin, as in preview. The V-8 outcome is not
  repeated here (it is VT-5's).
- `verify-page-accessibility.spec.ts` and `verify-page-keyboard.spec.ts` (VT-7):
  axe (the Wrapper's `auditAccessibility`, WCAG 2.2 A and AA) on the form, its
  refused submit, a match, a mismatch, a chain that could not be verified, a
  round not ended, voided, refused, of an unknown kernel, of a shape other than
  one step of two options (A-3), not found, an API error, an unreachable
  service, and the configuration error with and without a retry; then
  keyboard-only use of the form and of the retry, focus on the new heading after
  a submit and a retry (and none moved on its own), the polite region (a match,
  a refused submit's error) and `role="alert"` (a failure), the focus indicator,
  and a 640 by 360 viewport (200 % zoom) with no horizontal scroll.
- `verify-page-policy.spec.ts` (VT-8): the `verifyPolicy` option of
  `verify-page.ts` serves the page with the `/verify/*` entry of the built
  `apps/wrapper/dist/headers.json`, its `{{verifyConnectOrigins}}` placeholder
  filled with the origins of `verifyApiBaseUrl` and the RPC endpoints as the
  deploy side does. The page loads and recomputes with no
  `securitypolicyviolation`; the policy is enforced (a `fetch` to another origin
  is refused by `connect-src`); every script and stylesheet has `integrity`, no
  inline script or style exists, and a script with changed bytes does not run
  (the browser enforces the hash); and every request went to the Wrapper's
  origin or a configured RPC endpoint. This is the e2e half; the build half (the
  release step puts `integrity` on every tag and refuses what the policy would
  have to be loosened for, and `headers.json` holds the `/verify/*` entry) is
  `release-sri`'s and `release-verify.test.ts`'s unit tests and
  `pnpm check:build-output`. No new build check was added.

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

Decided by the backend's TPO on 2026-10-27 (#136):

- **D-10. The verify API is read same-origin only** (V-2, V-3): it sends no CORS
  headers on any surface, so the page reads it on its own origin, through the
  edge route in preview and each Pages site's API proxy on staging. Rejected: a
  cross-origin `verifyApiBaseUrl` with CORS headers on the verify API. The human
  decided on 2026-10-28 to enforce it in both validators (V-3a), not only in the
  way the documents are written.

### Assumptions (decided)

Made while building the page's states (2026-10-20), each the least-claiming
reading of the spec. A-1 (interim) to A-4 were decided by the human on
2026-10-20, as recorded below; A-5 was made when the page was built on the
vendored document; (c) was accepted and (b) decided on 2026-10-20.

- **A-1. The verify API's body and its read.** The body was assumed to be the
  Snapshot's fields plus a `kernelVersion`; the verify API document is now
  vendored, and the body is its `RoundVerification`
  ([The evidence](#the-evidence-from-the-verify-api-document)). The read was
  interim and app-local (decided by the human, 2026-10-20); it has moved, as
  decided: the request is `play-client`'s `getRoundVerification` (a public entry
  of that package, which returns the body as `unknown` like its other reads),
  the app depends on `play-client`, and the validation of the body stays in
  `apps/verify` (`verify-body.ts`), since the page, not the transport, decides
  what it accepts. 404 is `NOT_FOUND` (V-9) and any other non-2xx an error
  (V-10). Closed.

- **A-2. A round that has not ended** reaches V-8 rather than V-7 when the only
  failures are evidence it does not carry yet, or a chain read of block N that
  failed as `too-few` or `no-block` (block N may not exist yet). Decided by the
  human, 2026-10-20: a `hash-mismatch`, `other-chain`, `no-chain-id`, or
  `config` failure of check 6 still surfaces (V-7's chain wording), whatever the
  round's status.
- **A-3. A round that is not one step of two options** is shown as not
  recomputable (its own V-8 reason), with checks 1 to 4 and 6 and no retry; the
  spec's scope names Coin Flip only. Decided by the human, 2026-10-20: the shape
  check stays, but the page does not name the game: the summary says "one step,
  two options", and the not-recomputable text says the page recomputes rounds of
  that shape only. One helper (`isOneStepTwoOptions`, in `round-evidence.ts`)
  holds the test; with the verify API document it reads the game's payout terms
  (`game.terms.nodes`: one last node of two options of which one loses) and the
  config `shape` (empty, or `[2]`), not the steps the replay played.
- **A-4. Check 3 does not compare `newRound.actionKey`** with anything: the page
  has no player key, so the `signature/create-round-auth-action-key` vector,
  refused by the shell, passes check 3 on the page. Decided by the human,
  2026-10-20: confirmed. The action key is listed under "shown, not checked"
  (V-13).

- **A-5. Made building the page on the vendored document (2026-10-20); (b) and
  (c) settled by the human the same day:** (a) the document's `Commitment`,
  `Entropy`, and `Reveal` fields are all optional, so a round without them is
  read, not refused: the page has no `randomnessProof` (or no `fairnessProof`),
  its checks fail on an ended round and wait on one that has not ended (A-2); an
  authorization without its registry chain, registry address, admin signer, or
  entropy chain is refused as malformed. (b) The document has no `closeReason`
  but `expired`, no per-round "voided" status (a voided or refused round is
  `idle` with a `voidReason` or `rejectCode`) and no formatted amount. Decided
  by the human, 2026-10-20: such a round is its own V-8 state (voided, refused),
  not "not ended": the page says it was voided or refused, offers no "check
  again", and never waits for it; it shows only that wording, not the codes. The
  page writes the payout text itself (`1.94 EUR`) from the base units and
  `decimals`. (c) (accepted) The pick and the loser come from the API's replay
  (`recomputed.steps`), as `config.steps` did, and are compared with the page's
  own derivation (check 7). (d) `newRound` is decoded from its bytes and checked
  against its own hash (above).

Also decided by the human, 2026-10-20: a malformed signature (a bad length or
`v`, which the Snapshot schema's `Signature65` pattern refuses) fails the body's
validation and shows V-10, not a check 3 mismatch; only a high `s` or an
out-of-range `r` reaches check 3. The configuration-error state offers "try
again" for a document that could not be fetched or read, and no control for an
invalid one (V-3).

### Decisions (book rounds, #156)

Decided by the human on 2026-10-29, each the recommended option (asked as OQ-B1
to OQ-B7; the spec above was written to them).

- **OQ-B1. Check 5 for a book round** (`roundSecretHash`, no kernel vector):
  recomputed as plain SHA-256 (V-19). It is the same function on a 32-byte input
  that `kernel/public/v1/seed`'s `seedHash` results replay, the page's code for
  it is already that code, and config rounds already check it against its
  definition (V-12). Rejected: "not checked" until a vector exists.
- **OQ-B2. The payout** (`floor(bet / cost × multiplierMilli / 1000)`, no
  vector): not checked until a vector exists (V-13, V-19). Its `multiplierMilli`
  is the API's drawn row, which the page has not recomputed (check 8), so a
  "matches" would read as a payout check while proving only arithmetic over an
  unchecked value; and the rule's rounding has no vector. Coin Flip's payout is
  shown, not recomputed, for the same reason. Rejected: recomputing it in
  `bigint` now.
- **OQ-B3. `book.drawn` against `recomputed.draw`**: compared for consistency,
  one-sided: a disagreement fails check 8 (V-7), agreement leaves it "not
  checked" (V-19). Rejected: only showing both.
- **OQ-B4. The verdict of an ended book round**: V-8's new book reason, so a
  round whose outcome the page did not recompute never reads "matches" (V-8,
  V-20). Rejected: V-6 with check 8 "not checked".
- **OQ-B5. A body with `book` and `createRoundAuth`, `readyHash`, or signed
  actions**: an API error (V-10, V-18), so the API cannot drop checks 2 to 4 by
  adding `book`. Rejected: reading it as a book round and ignoring them.
- **OQ-B6. `entropy.chainId` of a book round** is compared with the chain id the
  configuration pins for the source, in check 6 (V-19).
- **OQ-B7. A `canceled` book round** is read under V-12's `canceled` rules, not
  refused (V-20). Rejected: refusing it as the Snapshot does.

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
- The verify API document (backend; vendored in `contracts` as
  `schemas/verify.v1.openapi.yaml`, its public name
  `verify/v1 OpenAPI document`; `GET /verify/v1/rounds/{roundId}`).
- The SuperEngine fairness kernel, kernelVersion 1 (public fairness contract;
  its public vector sets are vendored into `contracts`:
  [how the kit gets its contracts](./client-kit/how-the-kit-gets-its-contracts.md)).
