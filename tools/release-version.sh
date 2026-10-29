# The version command of the release workflow's `version` job (ADR-009;
# changesets/action's `version-script`, run from the repository root with the
# job token in GITHUB_TOKEN for the changelog generator): the pending
# changesets applied, then the version-file guard
# (tools/release-version-guard.sh). A refusal fails the action before it
# commits anything.
set -euo pipefail
pnpm exec changeset version
bash tools/release-version-guard.sh
