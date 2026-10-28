# ADR-008 — Kit CI deploys the Wrapper and the verifier to Cloudflare Pages, with a same-origin API proxy

- Status: accepted
- Date: 2026-10-27 (proposed and accepted the same day, in the pull request that
  builds it; amended 2026-10-27 by the human's deploy policy: staging deploys on
  every push to `main` with no gate, and production deploys when the changesets
  version pull request is merged; amended 2026-10-27: a third staging project,
  `se-games-stage`, serves the reference game; follow-up references updated
  2026-10-28: staging's RPC and lag margin stated, production's moved to #133;
  updated again 2026-10-28: staging's entropy chain moves to Somnia's public
  testnet, read through its public RPC, with a lag margin of 120 blocks)
- Deciders: the TPO (Pages hosting, the push model, the kit-owned proxy, the
  verify page on its own site), the human maintainer (the deploy tool, the
  secrets, the proxy hardening, acceptance), the infrastructure owner (the
  Cloudflare projects, token, and environment)
- Supersedes: [ADR-001](./ADR-001-toolchain-and-signing.md) decision 9 (a pull
  deploy on the SuperEngine side; no deploy credential in this repository)
- Relates to: [ADR-001](./ADR-001-toolchain-and-signing.md) (decision 7, the
  supply-chain minimum; decision 8 and the dependency table),
  [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md) (the build and
  publish split; `actions/upload-artifact`)

## Context

[ADR-001](./ADR-001-toolchain-and-signing.md) decision 9 said a deploy job on
the SuperEngine side pulls a released Wrapper by tag and digest, and that this
repository holds no deploy credential. The SuperEngine side decided otherwise
(issue #133, from the backend's Cloudflare edge work): the Wrapper and the
verify page are hosted on Cloudflare Pages from the start, and **this
repository's CI deploys them from `main`**. The infrastructure owner has
created, in the shared Cloudflare account, two Direct Upload Pages projects with
production branch `main`, `se-wrapper-stage` and `se-verifier-stage`, each on
its own subdomain, and the API token. Production projects come later.

The two sites' hostnames differ from the API's, and the API sends no CORS
headers. The TPO chose a same-origin proxy owned by the kit: each site forwards
its API paths to the API, so the pages call the API on their own origin and the
API stays without CORS. On staging the verify page lives on the verifier's site,
not on the Wrapper's origin (TPO, 2026-10-27).

That puts a deploy credential in a CI job of this public repository, and kit
code on the path of every signed action. The invariants the human set:

- the token exists only as a secret of a protected GitHub environment, never in
  a file or a log;
- the deployed bytes are the reproducible Wrapper artifact, with its digest
  recorded;
- no hostname is written in the repository, and no account id appears in a log.

ADR-005's rule for the release applies here too, for the deploy credential: the
job that uses the token runs no repository tooling. Stripping variables from a
child's environment is not isolation. One job, `config-stage`, runs repository
tooling in the same GitHub environment that holds the token without naming the
token; that is an accepted risk for staging, not an exception to the rule
([Risks accepted](#risks-accepted)).

## Decision

### 1. The deploy tool: `wrangler` from the lockfile

`wrangler` (Cloudflare's CLI, the only supported client of Pages direct upload)
is a root development dependency at an exact version, **4.151.2** (published
2026-10-19, older than the 7-day `minimumReleaseAge`). It is resolved through
the lockfile like every other dependency: integrity-checked, held to the minimum
release age and `trustPolicy: no-downgrade`, installed with lifecycle scripts
off, and covered by dependency review, `pnpm audit`, and Dependabot. It adds 28
packages to the lockfile, among them `workerd`, `miniflare`, `esbuild`, and
`sharp`'s platform binaries. `workerd`'s install script only checks the binary
its platform package delivers and is denied in `allowBuilds`, like `esbuild`'s,
so `strictDepBuilds` stays on. It stays a root development dependency, not a
separate workspace project (decided 2026-10-27).

It runs one command,
`wrangler pages deploy <site> --project-name <name> --branch main --no-bundle`,
from an empty working directory (so it reads no configuration, `.env` file, or
`functions/` directory of the repository), with metrics off. `--no-bundle`
uploads the proxy worker as the build job made it: nothing is bundled in the job
that holds the token. It is on the allow-list (`tools/allowed-dependencies.json`
and ADR-001's dependency table).

### 2. The workflow: `.github/workflows/pages.yml`, three jobs

On a push to `main`, and by hand from `main` (a redeploy). Every job runs only
when the repository variable `PAGES_STAGE_DEPLOY_ENABLED` is `true`, so the
workflow is safe to merge first: until then every job is skipped and the
`pages-stage` environment is never referenced (a run that names an environment
that does not exist creates it, unprotected). One run at a time, never cancelled
half-way (`concurrency: pages`).

Amendment note (2026-10-27, the human's deploy policy): **staging deploys on
every push to `main`, always.** The `PAGES_STAGE_DEPLOY_ENABLED` gate is
removed: every job runs only from `main` (`github.ref == 'refs/heads/main'`),
and the workflow reads no repository variable. The `pages-stage` environment,
its secrets, and the projects' variables exist before this lands (runbook), so
no run creates the environment unprotected. To hold a Pages rollback, the
workflow is disabled (`gh workflow disable pages.yml`) and re-enabled once the
fix is merged, instead of unsetting the variable.

- **`build`**: `contents: read`, no environment, no secret, no cache. It runs
  the release dry run (`tools/release-dry-run.ts`: the Wrapper artifact built
  twice in two scratch copies, one digest required, held to its size budget),
  checks the artifact against its `.sha256`, and builds the proxy worker
  (decision 4) with `tsc` alone, without a source map. It uploads the two files,
  unzipped (`archive: false`), kept one day, and exposes their digests.
- **`config-stage`**: `contents: read`, `environment: pages-stage`, and it
  references only the environment's configuration secrets, never the token or
  the account id. It builds the shell and runs
  `apps/wrapper/pages-config-cli.ts`, which builds the two sites' environment
  configuration documents and validates each with the Wrapper's own validator
  for its site's origin (decision 5). It uploads them, kept one day, and exposes
  their digests. It runs repository code in the environment that holds the
  token: an accepted risk for staging ([Risks accepted](#risks-accepted)).
- **`deploy-stage`**: `contents: read`, `environment: pages-stage`. It runs, in
  order:
  - a check that the token and the account id are set (it names a missing one
    and prints no value);
  - `actions/checkout` (no persisted credentials), for the lockfile;
  - the local setup composite (`.github/actions/setup`, no cache), which runs
    `pnpm/action-setup`, `actions/setup-node`, and
    `pnpm install --frozen-lockfile --ignore-scripts`;
  - `actions/download-artifact` four times, then a check of every download
    against its job's digest;
  - the runner's shell, `sha256sum`, `tar`, `cp`, and `jq`: it unpacks the
    artifact, lays out the two sites (decision 3), adds each site's worker,
    configuration document, and `_routes.json`, and writes each `_headers`
    (decision 6);
  - `wrangler pages deploy`, once per project.

  It runs no repository script: no build, no `tools/` script, no wireit.

**Secrets of `pages-stage`, all read with `secrets.`**: the token
(`CLOUDFLARE_API_TOKEN`) and the account id (`CLOUDFLARE_ACCOUNT_ID`, a secret
so that no log shows it) for the deploy step, and the configuration values for
the config job (decision 5). The project names are public and are written in the
workflow (`se-wrapper-stage`, `se-verifier-stage`).

**Staging only for now.** Production later is a deploy environment
(`pages-prod`, with the token and the account id), a separate configuration
environment that holds no deploy credential ([Risks accepted](#risks-accepted)),
a second gate (`PAGES_PROD_DEPLOY_ENABLED`), and second config and deploy jobs
with the production project names; the build job is shared. If that duplication
grows, the jobs move to a reusable workflow.

Amendment note (2026-10-27, the human's deploy policy): **the production trigger
is decided.** A production deploy runs when the changesets version pull request
is merged into `main` (the versions bumped and the changelogs written): that
release, the merge commit, is deployed to the production projects as well as to
staging. It replaces the second gate (`PAGES_PROD_DEPLOY_ENABLED`) above:
production gets its own trigger, not a repository variable. Not built yet
(#133). Today the release workflow (`.github/workflows/release.yml`) pushes the
version branch (`changeset-release/main`) and publishes only when started by
hand; a person opens the version pull request, and its merge runs nothing but
the staging deploy. How the production job recognizes that merge (for example, a
push to `main` whose changes are those `changeset version` makes) is #133's to
specify.

### 3. The two sites

Amendment note (2026-10-27, the reference game on staging): **a third staging
project, `se-games-stage`** (Direct Upload, production branch `main`, no custom
domain, created by the infrastructure owner), serves the reference game at its
`pages.dev` origin, `https://se-games-stage.pages.dev`, which the backend's
catalog names for `coin-flip-v1`, `cash-or-crash-v1`, and `book-slot-v1`, and
which `PAGES_GAME_ORIGINS` holds. That origin is public and is written in the
repository; the Wrapper's and the verifier's hostnames still are not. Its W-37
comparison key (ADR-007) is `pages.dev`, which the Wrapper's custom hostname
does not share. The build job keeps the release dry run's two scratch copies
(`--keep`) and makes the reference game's artifact
(`se-client-reference-game.tar`, a deterministic tar of its `vite build` output)
from each (`tools/reference-game-artifact-cli.ts`), requiring one digest; the
deploy job downloads it (a fifth download), checks it against that digest,
unpacks it unchanged at the site's root (the Wrapper frames `<game origin>/`,
W-37), refuses one without `index.html` or with a Pages control file or a
configuration document, and uploads it with `--branch main`. The site has no
worker, no `_routes.json`, and no configuration document. Its `_headers`
(decision 6) is the game page's own `<meta>` policy plus `frame-ancestors` the
Wrapper's origin (read from the Wrapper's validated configuration document) and
the operator origins (`frame-ancestors` checks every ancestor, so an operator
that embeds the Wrapper must be listed; the Wrapper alone when there are none),
the Wrapper's own `Permissions-Policy`, `Referrer-Policy: no-referrer`, and
`X-Content-Type-Options: nosniff`; decided by the human, 2026-10-27. The policy
cannot stop a listed operator from framing the game directly; the game's own
parent check (`parentOrigin` against `location.ancestorOrigins`) and the
Wrapper's bridge (W-37, W-38) are what keep such a frame from playing. A
`book-slot-v1` launch is not playable: the Wrapper refuses book rounds in the
first release (W-26) and the reference game plays `steps` only; a separate issue
covers it.

- **`se-wrapper-stage`**: the Wrapper artifact, unpacked unchanged: the Wrapper
  at `/`, and the artifact's copy of the verify page at `/verify/`.
- **`se-verifier-stage`**: the artifact's `verify/` directory, unchanged, and a
  copy of `verify/index.html` at the root. The verify page is built with base
  `/verify/` (its scripts and stylesheets are referenced as `/verify/...`, each
  with SRI), so its files stay under `verify/`. Pages serves the root page for
  every path that is not a file (no `404.html`), so
  `https://<verifier host>/verify/rounds/{roundId}` loads the page, which reads
  its route under `verifyBaseUrl`'s path (`/verify`) and shows the round. A path
  outside `/verify/`, such as `/rounds/{roundId}`, loads the page too but shows
  the empty form.

Building the verify page with base `/` instead would need a second build mode of
`apps/verify` (its `BASE` is pinned and tested), a second release output (the
Wrapper's release step refuses a reference outside `/verify/`), a second
artifact with its own reproducibility check, and its own size budget. Not now.

### 4. The same-origin API proxy: `apps/pages-proxy`

A new app (private, never published, no dependency, no kit import, outside the
dependency graph; the lint forbids importing it). One self-contained module,
`src/worker.ts`, emitted by `tsc` as each site's Pages advanced-mode
`_worker.js`. The module has no import, so nothing is bundled, and `--no-bundle`
uploads exactly the bytes whose digest the build job recorded. The Pages runtime
reads every named export of `_worker.js` as an entry point, so it exports only
functions and types. Its behavior, specified in
[specs/client-kit.md](../specs/client-kit.md#the-pages-api-proxy):

- **Routes.** Each site's `_routes.json` sends only its API paths to the worker:
  `/play/v1/*` and `/verify/v1/*` on the Wrapper's site, `/verify/v1/*` on the
  verifier's. The worker checks again: it forwards only under the prefixes of
  the project's variable `SE_API_PATH_PREFIXES` (each one of `/play/v1/` and
  `/verify/v1/`; missing or anything else is a 502), and hands any other path to
  the static assets. `/operator/v1/*` is never forwarded: no page calls it.
- **Refused paths.** A path with `%2f`, `%5c`, or `%2e` (any case) or an empty
  segment is answered 400 and never forwarded.
- **Pass-through.** The method, the path, the query, and the body are forwarded
  unchanged; the body is the incoming stream, never read, parsed, or re-encoded,
  so a signed action arrives byte for byte. Redirects are returned, not
  followed. The upstream fetch asks for no caching (`cache: "no-store"`).
- **Request headers dropped**: `Host`, the incoming `CF-Connecting-IP`, the
  hop-by-hop headers (`Connection` and every name it lists, `Keep-Alive`, `TE`,
  `Trailer`, `Transfer-Encoding`, `Upgrade`, `Proxy-*`), and `Forwarded`,
  `X-Real-IP`, `True-Client-IP`, `X-Forwarded-Host`, `X-Forwarded-Proto`,
  `X-Original-URL`, `X-Rewrite-URL`, `X-HTTP-Method-Override`. `X-Forwarded-For`
  is replaced with the incoming `CF-Connecting-IP` (dropped when there is none).
  It is trustworthy only if the upstream authenticates the proxy.
- **Answers.** The upstream's status, headers, and body come back, with
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`
  and `X-Content-Type-Options: nosniff` set over the upstream's. The proxy's own
  answers (400, 502) carry the same two headers and no body. Nothing is cached
  and no caching header is added.
- **The upstream** is the project's production variable
  `SE_API_UPSTREAM_ORIGIN`, exactly an `https` origin, never in this repository
  or CI. Missing or malformed, an unreachable upstream, or a failed asset read
  is a 502.

### 5. The sites' environment configuration documents

The deploy writes each site's `environment-config.json` next to its page (the
path both pages read). The artifact's bytes and digest are unchanged: the
documents are separate, deploy-time files. They are built in the `config-stage`
job, not in the deploy job, because validating them means running the Wrapper's
validator (repository code, which imports the shell), and not in the `build`
job, because their values are environment secrets the build job has no access
to. The job references only the configuration secrets (see
[Risks accepted](#risks-accepted) for what that does and does not guarantee).
The two documents are uploaded as workflow artifacts, which any signed-in GitHub
user can download for a day; that is acceptable because they are public once
deployed (each site serves its own).

From the `pages-stage` secrets:

- `PAGES_WRAPPER_ORIGIN`, `PAGES_VERIFIER_ORIGIN`: the two sites' origins;
- `PAGES_CHAIN_PINS`: JSON of `environment`, `runtimeSigner`, `registryDomain`,
  `entropyChainId`, `minRpcQuorum`, `tipLagMargin`, and nothing else;
- `PAGES_RPC_ENDPOINTS`: JSON of `rpcEndpoints`; `PAGES_RPC_ORIGINS` must list
  exactly its URLs' origins (a cross-check);
- `PAGES_GAME_ORIGINS`, `PAGES_OPERATOR_ORIGINS`: the origin lists.

Derived, never configured: `playApiBaseUrl` is the Wrapper's origin plus
`/play/v1` (both documents); `verifyApiBaseUrl` is each site's own origin plus
`/verify/v1`; `verifyBaseUrl` is the verifier's origin plus `/verify` (both
documents), so the Wrapper's verify link opens the verifier's site. The
`tipLagMargin` of staging is the infrastructure owner's value in
`PAGES_CHAIN_PINS`: 120 blocks on Somnia's public testnet, chain id 50312 (the
backend, 2026-10-28; production's is #133's).

### 6. The headers: a `_headers` file per site

From the artifact's `headers.json`, with the CSP lists read from the Wrapper's
configuration document (the verifier's holds the same lists), so the policy and
the configuration cannot disagree:

- **the Wrapper's site**: each rule in order; a more specific rule first
  detaches (`! Name`) every header of the broader rules before it, then sets its
  own, so `/verify/*` replaces the Wrapper's policy (checked with the
  open-source Pages asset server and a local `wrangler pages dev`);
- **the verifier's site**: the `/verify/*` rule's headers, on `/*`;
- **placeholders**: the origins of the RPC endpoints (an empty list leaves
  `connect-src 'self'`), the game origins and the operator origins (`'none'`
  when empty), each an `https` origin, sorted and unique. The APIs are
  same-origin through the proxy, so `'self'` covers them;
- **refusals**: a malformed `headers.json` or one without `/verify/*`, an
  unknown placeholder, a line Pages would misread or over 2,000 characters, and
  a site that already holds a `_headers` file.
- **the game's site** (amended 2026-10-27, decision 3's note): on `/*`, the
  reference game's `<meta>` policy with `frame-ancestors` the origin of the
  Wrapper document's `playApiBaseUrl` (a document without an `https` origin
  there fails the step) followed by the operator origins (the Wrapper's origin
  alone when that list is empty, never `'none'` beside it), the Wrapper's `/*`
  rule's `Permissions-Policy` (refused when missing),
  `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`, under
  the same line checks. Decided by the human, 2026-10-27. It does not stop a
  listed operator from framing the game directly; the game's parent check and
  the Wrapper's bridge do that.

### 7. Two first-party Actions for the hand-off

| Action                      | Version | Commit SHA to pin                          | Released   |
| --------------------------- | ------- | ------------------------------------------ | ---------- |
| `actions/upload-artifact`   | v7.0.2  | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 2026-10-07 |
| `actions/download-artifact` | v8.0.2  | `9000827ccba6bdab643e8b6fd33ac0654aef8333` | 2026-10-07 |

`upload-artifact` is the one ADR-005 proposes, at the same SHA.
`download-artifact` is new: same publisher (`actions`), `node24`, with a bundled
`dist/`; its tag `v8.0.2` resolves to the SHA above, a verified commit, checked
2026-10-27. Its own digest check (`digest-mismatch: error`) runs before the
workflow's.

### 8. Staging runs as `preview`, with a quorum of one

Staging moves no real money (the human, 2026-10-27). While staging reads one RPC
provider (Somnia's public testnet RPC since 2026-10-28; production's providers
are #133's), its configuration is `environment: "preview"` with `minRpcQuorum`
1, accepted by the TPO (2026-10-27): W-26a's local or preview exception applies
(the degraded indicator, `tipCheck: "degraded"`), and the tip check passes with
that one endpoint. Production must be `environment: "production"` with
`minRpcQuorum` of at least 2, which the Wrapper's boot rule already enforces
(W-26a). Recorded in [specs/wrapper.md](../specs/wrapper.md#configuration).

## Alternatives considered

- **`cloudflare/wrangler-action`, pinned by SHA.** Rejected: it installs
  `wrangler` at run time without the kit's lockfile, so every transitive version
  floats, the minimum release age and `no-downgrade` do not apply, and the
  dependencies' install scripts run in the step whose inputs hold the token. A
  strict superset of decision 1.
- **A direct upload against Cloudflare's API, with `curl`.** The smallest
  third-party surface, but Pages direct upload is not a documented REST API (an
  upload JWT, BLAKE3 hashes, bucketed uploads, hash upserts, then the
  deployment). The kit would own a re-implementation of a private protocol.
- **CORS on the API for the two origins.** Not chosen by the TPO: the API stays
  without CORS.
- **Pages Functions from a `functions/` directory**, compiled by `wrangler` at
  deploy. Rejected: `wrangler` would bundle repository code next to the token,
  and the deployed worker would not be the bytes the build job made.
- **The configuration built in the deploy job** with `jq`. Rejected: it could
  not reuse the Wrapper's validator without running repository code next to the
  token.
- **Build in the deploy job.** Rejected: it runs the repository tooling the
  split keeps away from a credential.

## Consequences / tradeoffs

- **A deploy credential in this repository's CI**, a secret of the `pages-stage`
  environment (restricted to `main`), used only by the deploy step, and masked
  in logs. A compromised release of `wrangler`, its dependencies,
  `pnpm/action-setup`, `actions/setup-node`, or `download-artifact` could read
  it; the SHA and lockfile pins, the 7-day age, and reviewed bumps are the
  defence. The token's scope (Pages edit on one account) bounds a leak to the
  Pages deployments.
- **Kit code on the path of every signed action.** The proxy is small, has no
  dependency, and is unit-tested for each rule above. A change to it is reviewed
  like a change to the signing code.
- **The proxy needs a recent compatibility date.** `cache: "no-store"` on a
  worker's `fetch` needs the project's compatibility date on or after 2024-11-11
  (runbook).
- **Every install carries `wrangler`'s graph** (about 50 MB downloaded and 170
  MB installed on one platform), never run outside the deploy job and a local
  `wrangler pages dev`.
- **The deployed bytes**: the reproducible artifact, the worker, and the two
  configuration documents, each digest-checked and printed, and the generated
  `_headers` and `_routes.json`.
- **Rollback is a Pages rollback** of each project. A later merge deploys again
  (amended 2026-10-27: unless the workflow is disabled to hold the rollback).
- **The release workflow is unchanged.** A released Wrapper keeps its tag,
  digest, and (ADR-005) attestation; Pages serves `main`.
- **Follow-ups**: the Actions allow-list of ADR-005 lists `download-artifact`
  when it is built; the first-deploy checks of the runbook. Staging's RPC and
  lag margin are settled (2026-10-28: Somnia's public testnet RPC, one provider;
  a lag margin of 120 blocks); production's are #133's.

## Risks accepted

- **`config-stage` runs repository tooling in the environment that holds the
  token.** It references only the configuration secrets. GitHub documents that a
  job gets the secrets it references; it does not document that the others are
  withheld from the runner, and a job's code has `sudo` on a GitHub-hosted
  runner. So repository code (the Wrapper's validator, the shell it imports, and
  their development dependencies) runs in a job that the token's environment
  covers. Accepted for staging by the human on 2026-10-27. To be revisited
  before production: production must build its configuration in a separate
  environment that holds no deploy credential.

## Decided questions

- `wrangler` from the lockfile, not the Action or a direct upload (decision 1).
- No separate workspace project for `wrangler` (decision 1).
- Staging only for now; production gets its own deploy environment and a
  separate configuration environment (decision 2, Risks accepted).
- One environment, `pages-stage`, for staging's config and deploy jobs (the
  human, 2026-10-27; Risks accepted).
- Staging runs as `preview` with `minRpcQuorum` 1 while it reads one RPC
  provider (decision 8).
- Staging deploys on every push to `main`, with no gate; a rollback is held by
  disabling the workflow (the human, 2026-10-27; decision 2, amendment note).
- Production deploys when the changesets version pull request is merged (the
  human, 2026-10-27; decision 2, amendment note); not built yet (#133).
- The origin lists, the site origins, and the account id are secrets (decisions
  2 and 5).
- Two projects, the verify page on its own site (decision 3).

## References

- [ADR-001](./ADR-001-toolchain-and-signing.md),
  [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md).
- [specs/client-kit.md](../specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin),
  [specs/client-kit/supply-chain.md](../specs/client-kit/supply-chain.md),
  [specs/verify-page.md](../specs/verify-page.md).
- [runbook/client-kit-release.md](../runbook/client-kit-release.md#deploy-to-cloudflare-pages).
- Upstream: Cloudflare Pages `_headers`, `_routes.json`, advanced mode, and
  direct upload documentation; the `actions/upload-artifact` and
  `actions/download-artifact` repositories at the SHAs above.
