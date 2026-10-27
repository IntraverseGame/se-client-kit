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
  is 7 days to match, for the `npm` and the `github-actions` ecosystems.
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
  Dependabot's pull requests) are pinned.
- **Provenance.** Packages are published from GitHub Actions with npm
  provenance, so each version links to the commit and workflow that built it.
  The release workflow (`.github/workflows/release.yml`) runs by hand only; its
  `publish` job runs in the protected `release` environment, only from `main`,
  only when the repository variable `RELEASE_PUBLISH_ENABLED` is `true`, with
  `contents: read` and `id-token: write`, and publishes the very tarballs the
  release checks inspected
  (`pnpm publish <tarball> --provenance --ignore-scripts`). A published manifest
  carries no lifecycle script (the tarball check refuses one). The Wrapper
  bundle is released as one artifact identified by its digest (below), with a
  SHA-256 manifest of every file and a build-provenance attestation. The release
  jobs restore nothing from a cache (the setup action with `cache: "false"`).
  The publish gate (`tools/release-readiness.ts`) refuses pending changesets, a
  `private` or 0.0.0 library, and a missing or different Wrapper digest; a
  version already on the registry is skipped only when the registry holds the
  same bytes (`dist.integrity`). **A real publish requires a split job**
  (decided): stripping variables from a child's environment is not isolation, so
  the job that holds `id-token: write` runs no repository tooling; it only
  verifies the digests of the tarballs and the artifact a build job without
  `id-token` produced, and publishes them. The workflow's `version` job (only
  from `main`, only with its `version` input, after the dry run) holds no OIDC
  token and names no environment: with `contents: write` and
  `pull-requests: read` it runs `changeset version` with the job's own
  `GITHUB_TOKEN` (for the changelog generator), refuses to push anything but
  what that command writes, as regular files (a modified `package.json`, an
  added or modified `CHANGELOG.md`, neither inside `.changeset/`, a changeset
  deleted directly under `.changeset/`, never its `README.md`; a rename counts
  as a deletion and an addition, and a type or mode change or a path with an
  unusual character is refused; `tools/release-version-guard.test.ts` runs the
  step's script against temporary repositories), and force-pushes, with every
  git command of the check and the push run without hooks or an fsmonitor
  (`core.hooksPath=/dev/null`, `core.fsmonitor=false`, `--no-verify`), the
  result to `changeset-release/main`; a person opens the version pull request,
  so Actions never open or approve one. It never runs with `publish`: a run with
  both inputs fails in its first job. **Accepted residual risk** (by the human,
  2026-10-18): the code `changeset version` loads (changesets, its changelog
  generator, the formatter, and their dependencies) runs with the job's
  `contents: write` token in its environment, and such a token can push to any
  branch no rule protects, create tags, and create releases. The push guard
  limits what the job's own push sends, not what that code could do. Once
  `actions/upload-artifact` is allowed
  ([ADR-005](../../decisions/ADR-005-release-attestation-and-artifact-upload.md),
  Follow-ups), it is split so that the tooling runs with `contents: read` and
  only a job that runs no repository tooling holds `contents: write` and pushes.
  <!-- TODO(release, #134): deferred to #134 (owner: TPO). Split the version job (tooling with a read-only token, push without tooling) once actions/upload-artifact is allowed. Reason: it waits on ADR-005's acceptance. -->
  <!-- TODO(release, #134): deferred to #134 (owner: TPO). The split into a build job and a publish-only job; required before RELEASE_PUBLISH_ENABLED is set (runbook, Bootstrap step 7). Reason: it waits on ADR-005's acceptance, and no real publish happens before the protected `release` environment and the npm scope exist (#3). -->
  <!-- TODO(release, #134): deferred to #134 (owner: TPO). The attestation and the GitHub release that carries the artifact; ADR-005 (proposed) adds `actions/attest-build-provenance` and `actions/upload-artifact`. Reason: it waits on #3 and on ADR-005's acceptance. -->
- **Credentials.** The publishing credential is never in the repository. The
  preferred form is npm trusted publishing from the release workflow (no
  long-lived token); otherwise a token in a protected GitHub environment with
  required
  reviewers. <!-- TODO(infrastructure owner, #3): deferred to #3 (owner: TPO, with the org owners). Which form the npm organization supports, and the rotation procedure. Reason: the npm scope is not claimed yet. -->
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
  variables of each Pages project, never in the repository or CI.
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
