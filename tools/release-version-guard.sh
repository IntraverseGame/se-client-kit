# The version-file guard (ADR-009, Kept; runbook/client-kit-release.md,
# Release): run by tools/release-version.sh after `changeset version`, in the
# release workflow's `version` job, before changesets/action commits the
# working tree to `changeset-release/main`. It runs in the same job as the
# tooling, so it is a sanity check, not an isolation boundary.
#
# Only what `changeset version` writes, as regular files, may change: a
# modified `package.json`, an added or modified `CHANGELOG.md`, and a consumed
# changeset deleted directly under `.changeset/` (never its README.md); no
# `package.json` or `CHANGELOG.md` inside `.changeset/`, which changesets would
# read as a pending changeset, or under `.github/`, where a file can change
# what workflows run. `--no-renames` splits a rename into a deletion and an
# addition, so neither half hides; a type or mode change, a path with any
# character outside [A-Za-z0-9._/@-], and anything else is refused. Every git
# command runs with no hooks and no fsmonitor. The index is left as it was
# found. tools/release-version-guard.test.ts runs this script against
# temporary git repositories.
set -euo pipefail
git -c core.hooksPath=/dev/null -c core.fsmonitor=false add --all
if git -c core.hooksPath=/dev/null -c core.fsmonitor=false diff --cached --quiet; then
  echo "No pending changesets; nothing to push."
  exit 0
fi
versioned='(^|/)(package\.json|CHANGELOG\.md)$'
changelog='(^|/)CHANGELOG\.md$'
consumed='^\.changeset/[A-Za-z0-9._-]+\.md$'
safe='^[A-Za-z0-9._/@-]+$'
changes="$(mktemp)"
git -c core.hooksPath=/dev/null -c core.fsmonitor=false diff --cached --no-renames --raw -z \
  > "$changes"
git -c core.hooksPath=/dev/null -c core.fsmonitor=false reset --quiet
unexpected=0
while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
  read -r old_mode new_mode _ _ status <<< "${meta#:}"
  allowed=0
  if [[ $path =~ $safe ]]; then
    case "$status $old_mode $new_mode" in
      "M 100644 100644")
        [[ $path =~ $versioned && $path != .changeset/* && $path != .github/* ]] &&
          allowed=1
        ;;
      "A 000000 100644")
        [[ $path =~ $changelog && $path != .changeset/* && $path != .github/* ]] &&
          allowed=1
        ;;
      "D 100644 000000")
        [[ $path =~ $consumed && $path != .changeset/README.md ]] &&
          allowed=1
        ;;
    esac
  fi
  if [ "$allowed" -ne 1 ]; then
    printf 'Unexpected change: %s %q\n' "$status" "$path"
    unexpected=1
  fi
done < "$changes"
rm -f "$changes"
if [ "$unexpected" -ne 0 ]; then
  echo "changeset version changed more than it should; nothing pushed."
  exit 1
fi
echo "changeset version changed only versions, changelogs, and consumed changesets."
