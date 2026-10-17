# Supply chain

Part of the [Client kit spec](../client-kit.md), section
[Contract](../client-kit.md#contract).

The kit publishes code players run and packages others install, so its build is
the attack surface a player cannot see. The rules:

- **Lockfile and install.** `pnpm-lock.yaml` is committed; CI installs with
  `--frozen-lockfile`. Dependency lifecycle scripts are disabled by default
  (only an explicit allow-list may run one), and the lockfile and every
  `package.json` are code-owner paths. A newly published dependency version
  SHOULD wait a configured age before it is accepted (pnpm's minimum release
  age). The age is **7 days** (`minimumReleaseAge: 10080` minutes, strict, in
  `pnpm-workspace.yaml`), no lifecycle script is allowed (`allowBuilds` has no
  `true` entry; `esbuild`, brought by `tsx`, is denied explicitly so the strict
  check passes), the trust policy is `no-downgrade`, and dependencies are saved
  at an exact version. There is no install hook (`.pnpmfile.cjs`) and one
  TypeScript: the generator of the Play API document's types is
  `openapi-typescript` 6.7.6, the last major without a TypeScript compiler-API
  dependency, since 7.x needs TypeScript 5's
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
  The Wrapper bundle is released with a build-provenance attestation and a
  SHA-256 manifest of every file.
- **Credentials.** The publishing credential is never in the repository. The
  preferred form is npm trusted publishing from the release workflow (no
  long-lived token); otherwise a token in a protected GitHub environment with
  required
  reviewers. <!-- TODO(infrastructure owner): which form the npm organization supports, and the rotation procedure. -->
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
  packages (tsdown) are too: building the same sources twice from a clean state,
  in two different directories, gave byte-identical `dist/` trees (JavaScript,
  its source maps, and declarations; chunk names are content hashes).
- **Vulnerability and license checks** run in CI on every change and on a
  schedule (`pnpm audit` for production dependencies: the CI job fails on high
  and critical advisories only, the weekly scheduled run reports every severity;
  dependency review on pull requests, secret scanning with push protection on
  this public repository).
