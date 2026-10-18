# ADR-005 — Two GitHub Actions for the release: the Wrapper's build-provenance attestation and the dry run's artifact

- Status: proposed
- Date: 2026-10-17
- Relates to: [ADR-001](./ADR-001-toolchain-and-signing.md) (decision 3, GitHub
  Actions for the release; decision 7, the supply-chain minimum, Actions pinned
  by full commit SHA; decision 9, the Wrapper bundle released with an
  attestation and pulled by digest)

## Context

The kit already promises an attestation for the Wrapper.
[ADR-001](./ADR-001-toolchain-and-signing.md) decision 9 says the Wrapper bundle
is released with an integrity manifest and an attestation, and that a deploy job
on the SuperEngine side pulls a released version by digest and verifies it. The
[supply-chain spec](../specs/client-kit/supply-chain.md) says the bundle is
released "with a build-provenance attestation". The
[release runbook](../runbook/client-kit-release.md#verify-before-and-after) says
to verify it with `gh attestation verify`. Nothing produces that attestation
yet.

The release workflow is being added on a separate branch (`ci/release-dry-run`,
not merged; this ADR does not depend on its details). In that workflow:

- a `dry-run` job (`contents: read`) builds the Wrapper twice into one
  deterministic tar, `se-client-wrapper-<version>.tar`. The tar is identified by
  its SHA-256 (`sha256:<hex>`), which is written next to it as a `.sha256` file
  and exposed as the job output `wrapper-digest`. Decision 3 adds a second
  output for the file name;
- a `publish` job (`contents: read`, `id-token: write` for npm trusted
  publishing and provenance) rebuilds the artifact, refuses a digest that
  differs from the dry run's, and publishes the packages;
- the attestation and the upload are left as `TODO`s that wait on this ADR.

The kit uses five external Actions today (`actions/checkout`,
`actions/setup-node`, `actions/dependency-review-action`, `pnpm/action-setup`,
`google/wireit`), each pinned by full commit SHA. ADR-001 asks for SHA pinning
but keeps **no list of allowed Actions**: its allow-list
(`tools/allowed-dependencies.json` and the dependency table) covers npm packages
only. An Action runs in the release job, which holds the job's OIDC token, so
adding one is a supply-chain decision (CONTRIBUTING, Route).

The human chose to propose these two Actions through this ADR. The other option
was to attach the artifact with the `gh` CLI and drop the attestation.

## Decision

### 1. The two Actions, pinned by full commit SHA

| Action                            | Version | Commit SHA to pin                          | Released (GitHub release) | Runs as                                                    |
| --------------------------------- | ------- | ------------------------------------------ | ------------------------- | ---------------------------------------------------------- |
| `actions/attest-build-provenance` | v4.2.2  | `4d101475d8b20a2381f78447822ac1eab6504dd8` | 2026-08-06                | composite; calls `actions/attest` v4.2.1, pinned inside it |
| `actions/upload-artifact`         | v7.0.2  | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 2026-10-07                | `node24`, a bundled `dist/upload/index.js`                 |

Written as
`uses: actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8 # v4.2.2`
and
`uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`.
The SHA is the pin. The comment is for people and for Dependabot.

`actions/attest-build-provenance` v4 is a composite Action with one step:
`actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4.2.1`. That inner
Action is also pinned by full SHA, so pinning the outer SHA fixes both. The
inner pin is not the newest `actions/attest`: v4.2.2 was released on 2026-08-04,
but the composite still pins v4.2.1, and the kit runs whatever the composite
pins. Called with no predicate input, `actions/attest` generates the SLSA v1
build provenance.

**How these were verified** (2026-10-17, read-only calls against the public
repositories of the `actions` organization):

- `git ls-remote --tags` listed each repository's tags.
  - `attest-build-provenance`: `v4.2.2` is a lightweight tag on `4d10147…`. The
    moving `v4` is an annotated tag: its tag object `8beda2b…` peels to the same
    commit, `4d10147…`.
  - `upload-artifact`: `v7.0.2` and the moving `v7` are both lightweight tags on
    `cf430e0…`.
- `gh api repos/actions/<repo>/commits/<tag>` returned the same SHAs, each
  reported by GitHub as a verified (signed) commit.
- `gh api repos/actions/<repo>/releases` showed both as the newest non-draft,
  non-prerelease release, published on the dates above. Both are older than the
  7-day cooldown of Dependabot's `github-actions` ecosystem, the only age rule
  that applies to Actions. pnpm's `minimumReleaseAge` covers npm packages only.
- The `action.yml` of each at the pinned SHA was read. That confirmed the
  composite wrapper and its inner `actions/attest` SHA (whose tag `v4.2.1`
  resolves to the same commit), and the `node24` runtime of `upload-artifact`.
  The inputs used below were read there too.

The implementer checks the SHAs again on the day the workflow change is made. If
a newer release exists by then and is older than seven days, it is pinned
instead, and the new SHA is recorded in the pull request.

### 2. Where each one runs, and its permissions

The workflow keeps `permissions: {}` at the top. Each job asks for its own.

- **`dry-run` job: `actions/upload-artifact`. Permissions unchanged
  (`contents: read`).** The upload uses the runner's own Actions-runtime token,
  so it needs no `permissions` entry. This job gets no `id-token` and no
  `attestations`.
- **A new `attest` job, after `publish`: `actions/attest-build-provenance`.
  Permissions: `contents: read`, `id-token: write` and `attestations: write`,
  and nothing else. It runs in its own environment, `attest`.**
  - `id-token: write` mints the OIDC token. Sigstore's certificate authority
    exchanges it for a short-lived signing certificate.
  - `attestations: write` stores the attestation on the repository.
  - `contents: read` is granted from the start (decided by the human,
    2026-10-17). The job does not check out the repository. It attests the
    digest the run already proved (`subject-digest`, decision 3). On a public
    repository, read access exposes nothing more. Leaving it out could fail the
    first publish's attestation, and that failure could not be fixed by
    re-running the same run.
  - `artifact-metadata: write` is **not** granted. The Action needs it only to
    write a storage record, and it writes one only with
    `push-to-registry: true`, for a container registry. The kit pushes to no
    registry, and `push-to-registry` stays `false`.
  - The `attest` job `needs: [dry-run, publish]` and runs only when `publish`
    succeeded. It shares `publish`'s condition (dispatched from `main`, publish
    enabled). The npm publish job therefore never holds `attestations: write`.
  - A dry run never attests. An attestation of this public repository goes to
    the public Sigstore transparency log permanently, so only a published
    artifact gets one.
  - **Its own environment, `attest`** (decided by the human, 2026-10-17). An
    OIDC token's subject names the job's environment
    (`repo:IntraverseGame/se-client-kit:environment:attest`). It can therefore
    never match a binding that requires the `release` environment. The `attest`
    environment holds no secret, and deployments to it are restricted to `main`.
    An org owner creates it, as a Bootstrap step of the release runbook (#3).

The `publish` job keeps its own permissions (`contents: read`,
`id-token: write`) and its `release` environment.

**Precondition: every OIDC consumer of this repository requires
`environment: release`** (decided by the human, 2026-10-17). The `attest` job's
token comes from the same repository and the same workflow file as the `publish`
job's. npm trusted publishing checks the repository and the workflow, and
checking the environment is optional there. A trusted publisher configured
without the environment would therefore accept a token minted by the `attest`
job. So:

- every npm trusted publisher of the kit's packages is configured with the
  environment `release`;
- any other consumer that trusts this repository's OIDC tokens (for example a
  cloud role on the SuperEngine deploy side) also requires
  `environment: release` in the token's subject, or a stricter claim;
- this is part of the publish gate. `RELEASE_PUBLISH_ENABLED` is set to `true`
  only after an org owner has confirmed both points. The precondition is checked
  again whenever a trusted publisher or another OIDC consumer is added.

### 3. What the attestation binds

Inputs: `subject-name: <the dry run's wrapper-file-name>` and
`subject-digest: <the dry run's wrapper-digest>`, in the `sha256:<hex>` form the
Action accepts. The `attest` job has no checkout and no copy of the tar, so it
cannot derive the name itself. The `dry-run` job therefore exposes a second job
output, `wrapper-file-name` (`se-client-wrapper-<version>.tar`), next to
`wrapper-digest`. The same value names the two uploads (decision 5). The digest
is attested only after the `publish` job has rebuilt the artifact and found the
same digest. The result is an in-toto statement with an SLSA v1 provenance
predicate, signed by a Sigstore certificate. It binds:

- **the artifact**: the tar's file name and its SHA-256. The digest is the
  identity: the attestation holds for any copy of those bytes, wherever they are
  downloaded from;
- **the workflow**: the certificate's identity is the release workflow file at
  the ref it ran from (`.github/workflows/release.yml` on `refs/heads/main`).
  The predicate also records the trigger event, the run, and that the runner was
  GitHub-hosted;
- **the commit**: the source repository (`IntraverseGame/se-client-kit`) and the
  commit SHA the run was built from.

It does not bind the integrity manifest or `headers.json` separately. Both are
inside the tar, so the tar's digest covers them.

### 4. How the consumer verifies it

The SuperEngine pull-deploy downloads the tar, recomputes its SHA-256, checks
that it equals the digest named for that release, and then runs:

```sh
gh attestation verify se-client-wrapper-<version>.tar \
  --repo IntraverseGame/se-client-kit \
  --signer-workflow IntraverseGame/se-client-kit/.github/workflows/release.yml \
  --source-ref refs/heads/main \
  --deny-self-hosted-runners
```

It adds `--source-digest <commit>` when the release's commit is known from its
tag. The default `--predicate-type` (`https://slsa.dev/provenance/v1`) and the
default OIDC issuer (GitHub Actions) are kept. Verification fails on a different
repository, a different workflow, another branch, a self-hosted runner, or bytes
whose digest has no attestation. For an offline check, the deploy downloads two
things once, while online: the attestation bundle (`gh attestation download`)
and the Sigstore trusted root (`gh attestation trusted-root`, saved as a
`trusted_root.jsonl` file). It then passes them with `--bundle` and
`--custom-trusted-root`. After the attestation passes, the deploy checks the
integrity manifest file by file
([specs/client-kit.md](../specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin)).

Verifying needs no credential the kit holds. The deploy side's own `gh`
authentication is used only to read the attestation.

### 5. What the upload keeps, and for how long

In the `dry-run` job, after the build, two uploads:

- the tar (`wrapper-file-name`), with `archive: false`. The downloaded file is
  then the same bytes as the attested subject, not a zip around it;
- its `.sha256` file (`<wrapper-file-name>.sha256`), with `archive: false`.

Each upload uses `if-no-files-found: error` and the default
`include-hidden-files: false`. Each names one file exactly, never a directory or
a glob, so nothing else from the scratch output (tarballs, reports, a copied
configuration) is uploaded.

**Retention: `retention-days: 14`, set explicitly.** The workflow artifact is a
convenience for review: someone can download the dry run's Wrapper and compare
it with a local rebuild before deciding to publish. It is not the released
artifact. The deploy pulls a released version, and its trust comes from the
digest and the attestation, never from where the file was kept. Fourteen days
covers a release review. The repository default (up to 90 days) would only keep
stale builds.

Workflow artifacts of a public repository can be downloaded by any signed-in
GitHub user. The tar holds only the public Wrapper bundle, so that is
acceptable. It is also why each upload names exactly one file.

The attestation itself has no retention setting. It stays on the repository and
in the public transparency log.

## Supply-chain risk

- **Maintainer.** Both Actions belong to GitHub's first-party `actions`
  organization, the same publisher as the `actions/checkout`,
  `actions/setup-node`, and `actions/dependency-review-action` the kit already
  runs. This is a publisher the kit already trusts, not a new one.
- **Their own dependencies.** Neither Action installs anything when it runs:
  each ships a committed, bundled `dist/`, and SHA pinning fixes those bytes.
  - `upload-artifact` 7.0.2 declares `@actions/artifact`, `@actions/core`,
    `@actions/github`, `@actions/glob`, `@actions/io` and `minimatch`.
  - `attest-build-provenance` 4.2.2 adds one more Action, `actions/attest`
    (pinned inside it). `actions/attest` declares `@actions/attest`,
    `@actions/core`, `@actions/github`, `@actions/glob`, `@sigstore/oci` and
    `csv-parse`, and through `@actions/attest` the Sigstore client libraries.
  - These are never npm dependencies of the kit and never reach a bundle or a
    tarball. The kit's allow-list and `pnpm audit` do not cover them. What the
    kit relies on is the SHA pin, the publisher, and Dependabot's update pull
    requests, which a person reviews.
- **What a compromised Action could do.**
  - `upload-artifact` runs in a job with `contents: read` and no OIDC token. At
    worst it could upload something other than the tar. The deploy's digest
    check and the attestation would reject that.
  - `attest-build-provenance` holds an OIDC token, `attestations: write` and
    `contents: read` in a job with no stored credential and no checkout. It
    could attest a digest the run never built. It could also mint OIDC tokens
    for any audience. Such a token carries this repository and the release
    workflow, but the `attest` environment.
    - It cannot publish to npm, or reach another consumer of this repository's
      tokens, as long as the precondition of decision 2 holds: every such
      consumer requires `environment: release`.
    - Without that precondition, the separate job would not be enough. npm's
      trusted publishing would accept the token, because by default it checks
      only the repository and the workflow.
    - A forged attestation still carries the release workflow's identity, so
      verifying it by identity alone cannot catch it. What does catch it is the
      deploy's check that the tar's digest is the one named for the release.
- **Updates.** Dependabot's `github-actions` ecosystem (7-day cooldown) proposes
  SHA bumps for both. A bump of `attest-build-provenance` can also move its
  inner `actions/attest` pin, and the reviewer reads that line too.

## Alternatives considered

- **The `gh` CLI with no attestation.** Attach the tar and its `.sha256` to a
  GitHub release with `gh release upload` (already on the runner, so no new
  Action), and let the deploy trust the digest named in the release. Rejected:
  it breaks ADR-001 decision 9 and the supply-chain spec. A digest published by
  the same release only proves the bytes were not changed after the release. It
  does not prove which workflow and commit built them. A stolen write credential
  could publish a release with any tar and its matching digest. The attestation
  does not fully close that gap either. A credential that can push to `main` can
  change `release.yml`, or the build it runs, and get a genuine attestation for
  any bytes. Branch protection on `main` (required review, no direct or force
  push, no bypass) is what keeps the attestation meaningful.
- **Sigstore `cosign` directly.** Install `cosign`, sign the tar keylessly with
  the job's OIDC token, and verify with `cosign verify-blob`. Rejected: it adds
  a binary download and an installer Action (or a hand-written download and
  checksum step). The kit would have to build the SLSA predicate itself and
  store the bundle somewhere. The verify command would also differ from the one
  the runbook already names. `attest-build-provenance` produces the same
  Sigstore-signed statement, stores it with the repository, and `gh` verifies
  it.
- **`actions/attest` directly instead of `actions/attest-build-provenance`.**
  The upstream README of v4 calls `attest-build-provenance` "simply a wrapper"
  and points new workflows at `actions/attest`. Calling it directly removes one
  layer. It is not chosen here because the human asked for
  `attest-build-provenance`, and the inner Action is pinned by SHA either way.
  This is an open question for acceptance, below.
- **`actions/download-artifact` to hand the tar from `dry-run` to the `attest`
  job.** Not needed: the attestation takes the digest (`subject-digest`), and
  `publish` has already proved the rebuild matches it. It would be a third
  Action.
- **Doing nothing.** The spec's attestation stays a promise, the runbook's
  verify step has nothing to verify, and the dry run's artifact is lost with the
  runner. Rejected.

## Consequences / tradeoffs

- **Two more Actions in the release path,** both first-party and SHA-pinned. One
  of them holds an OIDC token, in a job and an environment of its own. That
  token is safe only while every OIDC consumer requires `environment: release`
  (decision 2). This is a standing rule for anyone who configures a trusted
  publisher or another consumer.
- **Each published Wrapper is publicly and permanently attested.** That includes
  the repository, workflow, ref, commit, and run, all already public. No secret
  and no internal name goes into it.
- **A failed attestation after a successful publish** leaves the npm packages
  published and the Wrapper not deployable, because the deploy refuses an
  unattested digest. It is fixed by re-running the `attest` job of the same run,
  never by attesting from elsewhere.
- **Follow-ups**, each in its own change, through the normal review gates:
  - **Workflow** (`.github/workflows/release.yml`, after `ci/release-dry-run`
    merges):
    - the `wrapper-file-name` output of `dry-run` (decision 3);
    - the two uploads in `dry-run` (decision 5);
    - the `attest` job, with exactly `contents: read`, `id-token: write` and
      `attestations: write`, and `environment: attest` (decision 2);
    - the `TODO`s that wait on this ADR, resolved;
    - the split of the `version` job (#12). Today it runs `changeset version`,
      which is repository tooling, with a `contents: write` token in its
      environment; the human accepted that for now (2026-10-18). Once
      `actions/upload-artifact` is allowed, a job with `contents: read` and
      `pull-requests: read` runs `changeset version` and uploads the result, and
      a job with `contents: write` that runs no repository tooling downloads it
      and pushes `changeset-release/main`, so no repository tooling holds a
      write token.

    Attaching the tar to a GitHub release (`contents: write`, with `gh`, no new
    Action) stays with #12.

  - **Spec**: [supply-chain.md](../specs/client-kit/supply-chain.md)
    (Provenance) names the attestation's subject (the tar's digest), the signer
    workflow, the verify command, and the precondition that every OIDC consumer
    requires `environment: release`.
    [client-kit.md](../specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin)
    step 2 says the deploy verifies with the flags of decision 4.
  - **Runbook**: [client-kit-release.md](../runbook/client-kit-release.md).
    - Bootstrap gets two settings, both for an org owner (#3): the `attest`
      environment (no secret, deployments restricted to `main`), and the check
      that every npm trusted publisher, and any other OIDC consumer, requires
      `environment: release`. The check comes before `RELEASE_PUBLISH_ENABLED`
      is set.
    - Verify before and after, step 2, gets the exact `gh attestation verify`
      flags.
    - Troubleshooting gets "the attest job failed after publish" (re-run it).
    - Release, step 3, today says the attestation is "attached to the GitHub
      release". It is corrected: the attestation is made by the `attest` job and
      is stored on the repository (GitHub's attestations API) and in the public
      Sigstore transparency log. It is not a release asset. Only the tar and its
      `.sha256` are attached to the release (#12).
  - **The Actions allow-list** (decided by the human, 2026-10-17). The list
    lives in [supply-chain.md](../specs/client-kit/supply-chain.md), as a table
    of every Action the workflows use: the five in use today plus these two,
    each with its version and full commit SHA. A `tools/` check, run by
    `pnpm check` and CI, fails when a `uses:` line in `.github/**/*.yml` names
    an external Action that is not on the list, or is not pinned by a full
    40-character commit SHA. Local Actions (`./.github/actions/...`) are exempt.
    This ADR records the decision. ADR-001 is not rewritten or amended for it;
    its decision 7 (pin by full SHA) stays as it is, and the list carries it
    out.
  - **Memories**: `.ai/memories/development-workflow.md` notes the release's
    Actions and the `attest` job.
- **Exit criterion.** If the attestation moves to another mechanism (for example
  `actions/attest` directly, or a different signer), a new ADR supersedes this
  one.

## Open questions (for acceptance)

1. **`attest-build-provenance` or `actions/attest` directly?** Recommended:
   accept `attest-build-provenance` as proposed, since it is what was asked and
   the inner pin fixes both. Moving to `actions/attest` would then be a separate
   decision, taken when Dependabot or upstream deprecation calls for it.
2. **Retention of the dry run's upload: 14 days?** Alternatives are 30 days, or
   the repository default.
3. **The durable home of the released tar** for the pull-deploy. The spec
   assumes a GitHub release asset (with #12). The infrastructure owner confirms
   it.

<!-- TODO(infrastructure owner): where the deploy pulls the released Wrapper from -->

Decided by the human on 2026-10-17, and folded into the decision above:

- the `attest` environment and the `environment: release` precondition (decision
  2);
- `contents: read` on the `attest` job (decision 2);
- the Actions allow-list in the supply-chain spec, with a `tools/` check
  (Consequences).

## References

- [ADR-001](./ADR-001-toolchain-and-signing.md) (decisions 3, 7, and 9).
- [specs/client-kit/supply-chain.md](../specs/client-kit/supply-chain.md),
  [specs/client-kit.md](../specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin).
- [runbook/client-kit-release.md](../runbook/client-kit-release.md).
- Upstream: the `actions/attest-build-provenance`, `actions/attest`, and
  `actions/upload-artifact` repositories at the SHAs above; the GitHub CLI
  manual for `gh attestation verify`; the SLSA v1 provenance specification.
