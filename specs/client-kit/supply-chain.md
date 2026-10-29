# Supply chain

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

The kit publishes code players run and packages others install, so its build is
the attack surface a player cannot see. The rules:

- **Lockfile and install.** `pnpm-lock.yaml` is committed; CI installs with
  `--frozen-lockfile --ignore-scripts` (the local setup action
  `.github/actions/setup`), so no lifecycle script runs in CI, a workspace
  project's own included; nothing in CI needs one (the e2e job installs
  Playwright's browser with an explicit step). Dependency lifecycle scripts are
  disabled by default everywhere else too (only an explicit allow-list may run
  one), and the lockfile and every `package.json` are code-owner paths. A newly
  published dependency version SHOULD wait a configured age before it is
  accepted (pnpm's minimum release age). The age is **7 days**
  (`minimumReleaseAge: 10080` minutes, strict, in `pnpm-workspace.yaml`), no
  lifecycle script is allowed (`allowBuilds` has no `true` entry; `esbuild`,
  brought by `tsx`, and `workerd`, brought by `wrangler`, are denied explicitly
  so the strict check passes), the trust policy is `no-downgrade`, and
  dependencies are saved at an exact version. There is no install hook
  (`.pnpmfile.cjs`) and one TypeScript: the generator of the Play API document's
  types is `openapi-typescript` 6.7.6, the last major without a TypeScript
  compiler-API dependency, since 7.x needs TypeScript 5's
  ([ADR-004](../../decisions/ADR-004-openapi-typescript-6.md)). One override
  exists (`overrides` in `pnpm-workspace.yaml`, checked by `check:deps` like any
  other): the `undici` of `openapi-typescript` 6.7.6, which it declares as
  `^5.28.4`, is held at exactly 6.29.0, outside that range, because every 5.x
  release has published advisories. The selector is scoped
  (`openapi-typescript>undici`), so every other package keeps the `undici` it
  declares (`jsdom` its 8.x); it goes when the generator no longer pulls
  `undici` or declares a range without them (ADR-004). Dependabot's `cooldown`
  is 7 days to match, for the `npm` and the `github-actions` ecosystems. Two
  exceptions exist, each scoped to one exact version, accepted by the human on
  2026-10-28 for the wireit upgrade (#143) and listed with their reason in
  `pnpm-workspace.yaml`; the policies themselves are unchanged:
  - `minimumReleaseAgeExclude: [wireit@0.15.0]`, a one-time waiver of the
    release age: 0.15.0 (published 2026-10-24) carries the fix for
    google/wireit#1536 (google/wireit#1542). Its new transitive dependencies are
    all older than the window. The entry can go after 2026-10-31, when 0.15.0 is
    seven days old.
  - `trustPolicyExclude: [chokidar@4.0.3]`, an exception to `no-downgrade`:
    wireit 0.15.0 needs `chokidar` `^4.0.3`, and 4.0.2 and 4.0.3 were published
    without provenance by the same maintainer who published 4.0.0 and 4.0.1 with
    it. The entry goes when wireit moves off `chokidar` 4.
- **Runtime dependencies are an allow-list**: `@noble/curves` and
  `@noble/hashes`, and nothing else
  ([ADR-001](../../decisions/ADR-001-toolchain-and-signing.md)). Anything else
  needs an ADR first. A CI job (`allow-list`, `pnpm check:deps`) fails if any
  `package.json` declares a dependency outside the list in
  `tools/allowed-dependencies.json`, which a test keeps equal to the ADR's
  table. It checks names and specifiers in `dependencies`, `devDependencies`,
  `peerDependencies`, and `optionalDependencies`, in `overrides`,
  `pnpm.overrides`, `resolutions`, `catalog`, and `catalogs` of every
  `package.json`, and in `overrides`, `catalog`, and `catalogs` of
  `pnpm-workspace.yaml`. A specifier must be an exact registry version (or
  `workspace:` for a kit package, or a `catalog:` reference); git, URL, `file:`,
  `link:`, `npm:` alias, range, and tag specifiers are rejected, as is any
  construct in those YAML sections the check cannot read.
- **Pinned toolchain.** The Node version, the package manager (`packageManager`
  with its hash), and every GitHub Action (**by full commit SHA**, updated by
  Dependabot's pull requests) are pinned. **The Actions allow-list**
  ([ADR-005](../../decisions/ADR-005-release-attestation-and-artifact-upload.md),
  Consequences) is the table below: every external Action a `uses:` line under
  `.github/` names, with its version and the full commit SHA it is pinned to.
  `tools/actions-allow-list.test.ts` (run by `pnpm check` and CI) fails when a
  `uses:` names an Action that is not on the list, is not pinned by a full
  40-character commit SHA, is pinned to another SHA than the list's, or carries
  another version in its trailing comment, and when the list names an Action no
  workflow uses. Local Actions (`./.github/actions/...`) and the repository's
  own reusable workflows (`./.github/workflows/<name>.yml`, called from a job:
  the production deploy, ADR-009) are exempt. Adding an Action needs a recorded
  decision; a Dependabot bump changes the table in the same pull request.

  | Action                             | Version | Commit SHA                                 | Decided in |
  | ---------------------------------- | ------- | ------------------------------------------ | ---------- |
  | `actions/checkout`                 | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` | ADR-001    |
  | `actions/setup-node`               | v7.1.0  | `949feb2413d6458794dcd2491c4babbbce0c15c1` | ADR-001    |
  | `pnpm/action-setup`                | v6.1.0  | `ea17c68df8912ef543352723c149a84f56e3d413` | ADR-001    |
  | `actions/dependency-review-action` | v5.0.0  | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | ADR-001    |
  | `actions/upload-artifact`          | v7.0.2  | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | ADR-005    |
  | `actions/download-artifact`        | v8.0.2  | `9000827ccba6bdab643e8b6fd33ac0654aef8333` | ADR-008    |
  | `actions/attest-build-provenance`  | v4.2.2  | `4d101475d8b20a2381f78447822ac1eab6504dd8` | ADR-005    |
  | `changesets/action`                | v2.1.2  | `ae32849d5ba541f9ae29e40e22a623bc13562f51` | ADR-009    |

  `actions/attest-build-provenance` v4.2.2 is a composite that runs
  `actions/attest` v4.2.1 (`508db95dd578ae2727ebd6217d5ba78e4fbda05d`), pinned
  inside it; pinning the outer SHA fixes both, and a bump is reviewed for that
  inner line too.

- **Provenance.** Packages are published from GitHub Actions with npm
  provenance, so each version links to the commit and workflow that built it.
  The release workflow (`.github/workflows/release.yml`;
  [ADR-009](../../decisions/ADR-009-production-pages-deploy-trigger-and-source.md),
  decided by the human 2026-10-28) runs `changesets/action` on **every push to
  `main`**, starts with `permissions: {}`, and has **no concurrency group**
  (GitHub keeps one pending run per group, so a group would let a later push
  cancel the bump merge's waiting run; each push's run is independent and checks
  out its own commit). Its jobs:
  - `changesets-mode` (`contents: read`, `pull-requests: read`; no environment,
    no secret, no repository tooling: the runner's shell, git, gh, and jq)
    outputs `pending` (a `.changeset/*.md` other than its `README.md` exists)
    and `release-candidate`: `true` only when no changeset is pending, the
    pushed commit is **the bump merge** (a pull request associated with it,
    `GET /repos/{owner}/{repo}/commits/{sha}/pulls`, has head ref
    `changeset-release/main` in this repository, base `main`, was merged, and
    its merge commit is the pushed commit: the repository squash-merges), and at
    least one of the five libraries and the Wrapper has a version above `0.0.0`
    whose tag `<name>@<version>` is missing (`git ls-remote --tags` on the
    public URL; no registry, no token). Otherwise the run ends with a "nothing
    to release" notice, or "publishing was off" for a release candidate while
    `RELEASE_PUBLISH_ENABLED` is not `true` (the recovery is a manual re-run of
    the bump merge's run within 30 days, which keeps its commit and reads the
    current variables). Any API or git error fails it.
  - `version` (only when `pending`; no environment; `contents: write`,
    `pull-requests: write`; no `id-token`) runs the action in version mode with
    the version script `tools/release-version.sh`: `changeset version`, then the
    **version-file guard** `tools/release-version-guard.sh` (only a modified
    `package.json`, an added or modified `CHANGELOG.md`, neither inside
    `.changeset/` nor under `.github/`, and a changeset deleted directly under
    `.changeset/`, never its `README.md`, all regular files; a rename counts as
    a deletion and an addition; a type or mode change or a path with an unusual
    character is refused; every git command without hooks or an fsmonitor). The
    guard runs in the same job as the tooling, so it is a sanity check, not an
    isolation boundary. The action commits the result to
    `changeset-release/main` through the API and opens or updates the pull
    request "chore: bump versions", which, made with the job token, gets no CI
    (accepted).
  - `publish` (only on a release candidate and with `RELEASE_PUBLISH_ENABLED`
    `true`; the protected `release` environment; `contents: write`,
    `id-token: write`; no `pull-requests`) checks out with the tags, checks
    again that a version is still untagged (otherwise it ends with "already
    released" and runs nothing else), runs `pnpm check`, requires npm 11.5.1 or
    later, runs the release dry run, then the action in publish mode
    (`create-github-releases: false`) with the publish command
    `tools/release-publish.ts --publish`: it builds without the task cache,
    packs and checks the five libraries, refuses what is not ready (the publish
    gate, `tools/release-readiness.ts`: pending changesets, a `private` or 0.0.0
    library, a Wrapper at 0.0.0, a Wrapper digest other than the dry run's; and
    the size budget), skips a version the registry already has only when the
    registry holds the same bytes (`dist.integrity`), publishes the checked
    tarballs with the npm CLI of the pinned Node
    (`npm publish <tarball> --provenance --access public --ignore-scripts`; npm
    trusted publishing exchanges the OIDC token itself; decided by the human,
    2026-10-28), and then runs `changeset git-tag`, which tags every package
    whose version has no tag (the Wrapper, which is private and never on npm,
    and a library a failed run published without its tag). The action pushes
    those tags through the API on the run's commit and creates no GitHub release
    (`create-github-releases: false`: v2.1.2 only warns when a tag push fails,
    and a release created for a missing tag would tag the default branch's head;
    decided by the human, 2026-10-28). The job's last step requires every tag
    the action reported to exist on the run's commit (peeled when annotated),
    failing before any release otherwise, then creates each missing release with
    `gh release create <tag> --verify-tag --target <commit>`, its notes the
    package's changelog entry for the version; it also runs when the re-check
    found everything tagged, so "Re-run failed jobs" on the bump merge's run,
    within GitHub's 30 days, finishes a partial release (a full re-run runs
    `changesets-mode` again, which finds every version tagged and ends with
    "nothing to release", so `publish` never runs; "Re-run failed jobs" keeps
    its earlier `release-candidate=true`), and it names the Wrapper's tag while
    its release has no tar attached. Packages that are never released are in the
    changesets `ignore` list, so none gets a `0.0.0` tag.
  - `wrapper-build` (`contents: read`; only when `publish` names the Wrapper's
    tag) runs the release dry run at the run's commit (the Wrapper artifact
    built twice, one digest required, its name the released version) and uploads
    the tar and its `.sha256` (`actions/upload-artifact`, one file each, not
    zipped, kept **14 days**; ADR-005, decision 5).
  - `attest` (its own environment `attest`; `contents: read`, `id-token: write`,
    `attestations: write`; no checkout) attests that name and digest with
    `actions/attest-build-provenance` (`push-to-registry: false`,
    `create-storage-record: false`; ADR-005, decisions 2 and 3). The attestation
    is stored on the repository and in the public Sigstore transparency log; it
    is not a release asset. A dry run never attests.
  - `wrapper-assets` (`contents: write`; no checkout, no repository code)
    downloads the tar and its `.sha256`, checks both against the attested
    digest, requires exactly one release for the Wrapper's tag with neither file
    attached (it lists every release with `gh api --paginate`, compares each
    `tag_name` exactly, and an API error fails the step), and attaches them
    (`gh release upload`). The GitHub release asset is the released Wrapper's
    durable home (ADR-005) and production's source.
  - `production` calls `.github/workflows/pages-prod.yml` with the tag (see The
    Pages deploy, below).

  No job holds both the pull-request write and the OIDC token: `version` has no
  environment and no `id-token`, so the code it runs can never publish or
  attest; `publish` has no `pull-requests`; and `release` covers `publish`
  alone. Both run repository tooling with a write token (accepted by ADR-009,
  superseding ADR-005's rule that no job holding a write or OIDC token runs
  repository tooling). A tag ruleset on `@intraverse/*@*` (#154; until then
  `@intraverse/se-client-wrapper@*`) blocks updating and deleting release tags
  for everyone but the org owners and allows creating them, so a tag reliably
  marks "released".

  **Precondition** (ADR-005, decision 2): every npm trusted publisher of the
  kit's packages, and any other consumer that trusts this repository's OIDC
  tokens, requires the environment `release`, so the `attest` job's token can
  never publish. `RELEASE_PUBLISH_ENABLED` is set only after an org owner has
  confirmed it. A published manifest carries no lifecycle script (the tarball
  check refuses one). The Wrapper bundle is released as one artifact identified
  by its digest (below), with a SHA-256 manifest of every file and a
  build-provenance attestation. The release jobs restore nothing from a cache
  (the setup action with `cache: "false"`).

- **Credentials.** The publishing credential is never in the repository. The
  packages publish to the `intraverse` npm organization (scope `@intraverse`,
  claimed, owned by the org owners) through **npm trusted publishing (OIDC)**
  from `release.yml` in the protected `release` environment (decided by the org
  owners, 2026-10-27): no npm token is stored anywhere, so there is none to
  rotate. Each package's trusted publisher is to be configured on npmjs.com,
  requiring the environment `release` (#154). The environment has two required
  reviewers, self-review allowed, deployments from `main` only. The `attest`
  environment holds no secret, and its deployments are restricted to `main`
  (ADR-005, decision 2).
  <!-- TODO(org owners, #154): configure the trusted publisher of each of the five packages on npmjs.com (runbook, Bootstrap step 6), and create the `attest` environment (Bootstrap step 7). -->
- **The Pages deploy**
  ([ADR-008](../../decisions/ADR-008-pages-deploy-with-wrangler.md),
  `.github/workflows/pages.yml`). The Cloudflare API token and the account id
  are secrets of the protected `pages-stage` environment (deployments from
  `main` only), passed to the deploy step alone; the configuration values are
  secrets there too, so the public logs mask them, and only the config job reads
  them. The job that uses the token runs no repository code: the build job
  (`contents: read`, no secret) builds the Wrapper artifact twice with one
  digest, and the API proxy worker with `tsc` alone; the config job
  (`contents: read`, referencing only the configuration secrets) builds the
  shell and runs the Wrapper's configuration builder and validator. **Accepted
  risk** (the human, 2026-10-27, staging only): the config job runs in the same
  `pages-stage` environment that holds the token. GitHub does not document that
  secrets a job does not reference are withheld from its runner, and a job's
  code has `sudo` on a hosted runner. Before production, configuration moves to
  a separate environment with no deploy credential (ADR-008, Risks accepted).
  The deploy job (`contents: read`) runs `actions/checkout`, the local setup
  composite (`pnpm/action-setup`, `actions/setup-node`, and
  `pnpm install --frozen-lockfile --ignore-scripts`),
  `actions/download-artifact`, the runner's shell with `sha256sum`, `tar`, `cp`,
  and `jq` (it refuses any download whose SHA-256 is not its job's digest, lays
  out the two sites, and writes `_headers` and `_routes.json`), and
  `wrangler pages deploy --no-bundle` (nothing is bundled next to the token),
  pinned by the lockfile, from an empty working directory with metrics off.
  Every job runs on every push to `main` (and by hand from `main`), with no
  repository variable gating it; the workflow reads no `vars.` at all. The
  workflow uses `actions/upload-artifact` and `actions/download-artifact`,
  pinned by full SHA (ADR-008, decision 7). The proxy (`apps/pages-proxy`) has
  no dependency and no import; its upstream origin and path prefixes are
  variables of each Pages project, never in the repository or CI. **Production**
  (`.github/workflows/pages-prod.yml`; ADR-009, decision 3) is called by the
  release workflow's `production` job after a release, or dispatched by hand
  from `main` with a released tag. `release-check` (`actions: read`) refuses a
  dispatch while a run of the release workflow is not completed (the release
  always wins) and resolves the tag's commit; `prod-verify` (`contents: read`,
  `attestations: read`; no secret, no repository code) downloads the tar and its
  `.sha256` from the release by tag, checks them, and runs
  `gh attestation verify` with ADR-005's flags and `--source-digest` the tag's
  commit; only after it, so the attestation proves the commit before any of its
  code runs, `prod-worker` (`contents: read`) builds the worker at that commit
  and `config-prod` builds the configuration in the environment
  `pages-prod-config`, which holds no deploy credential, closing the staging
  risk above for production; and `deploy-prod` (environment `pages-prod`, no
  required reviewer; `contents: read`) runs no repository code, refuses any
  download whose SHA-256 is not its producing job's digest, and deploys the
  Wrapper's and the verifier's sites. Only `deploy-prod` is in the concurrency
  group `pages-prod`. The production project names, token, and account id are
  secrets of `pages-prod`, the configuration values secrets of
  `pages-prod-config`; none is written in the repository.
- **Bundling.** A package's own source is the only thing in its `dist/`; nothing
  from `node_modules` is ever bundled (`deps` in `tsdown.base.ts`). A kit
  package stays an import (`neverBundle` for the `@intraverse/` scope), a
  package's `dependencies` are external by tsdown's default, and any other
  package, a devDependency or one that is not declared at all, fails the build
  (`onlyBundle: []`). tsdown would otherwise inline anything not listed in
  `dependencies`, which could copy another package, a dependency the allow-list
  never saw (a runtime dependency moved to `devDependencies` would ship inside
  the package), or the `contracts` vectors into this one.
  `tools/tsdown-bundling.test.ts` builds a fixture each way.
- **Reproducible build.** The Wrapper build is deterministic for a commit and a
  lockfile, so anyone can rebuild a release and compare its manifest. The
  release artifact is `se-client-wrapper-<version>.tar`, a tar of the release
  output with entries sorted by path, mode 0644, owner 0, mtime 0, no directory
  entries, and no compression (gzip records the operating system), and its
  **digest** is `sha256:` and the SHA-256 of that file
  (`tools/wrapper-artifact.ts`). The release dry run
  (`tools/release-dry-run.ts`) builds it in two scratch copies of different
  paths and time zones and fails unless the digests are equal; it also requires
  the five `pnpm pack` tarballs of both copies to be byte-identical. The Pages
  workflow keeps the two copies (`--keep`) and makes the reference game's
  artifact, `se-client-reference-game.tar` (the same tar rules over
  `apps/reference-game/dist/`, no version in the name;
  `tools/reference-game-artifact-cli.ts`), from each, requiring one digest; the
  game is never released, and only that workflow deploys it (ADR-008). The
  Wrapper's `vite.config.ts` makes the release artifact only ever the production
  build (decided in human review, 2026-10-19): it refuses a build in any mode
  but `production` (Vite's build default), with `VITEST` set, or with `NODE_ENV`
  set to anything but `production` (unset and empty count as unset, since Vite
  sets them to `production` for a build), or with `VITE_USER_NODE_ENV` set to
  any non-empty value, and it reads no env files (`envDir: false`). A
  `NODE_ENV=development` in the environment, a `VITE_USER_NODE_ENV` in the
  environment (Vite applies it after the config loads, when `NODE_ENV` was not
  set), or a `NODE_ENV` in an env file would each make a development build. The
  packages (tsdown) are too: building the same sources twice from a clean state,
  in two different directories, gave byte-identical `dist/` trees (JavaScript,
  its source maps, and declarations; chunk names are content hashes).
- **Vulnerability and license checks** run in CI on every change and on a
  schedule (`pnpm audit` for production dependencies: the CI job fails on high
  and critical advisories only, the weekly scheduled run reports every severity;
  dependency review on pull requests, secret scanning with push protection on
  this public repository).
