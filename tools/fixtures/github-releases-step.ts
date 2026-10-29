// The temporary checkout of tools/release-github-releases.test.ts: the release
// workflow's step "Create the GitHub releases" run in a checkout with the six
// publishable manifests and their CHANGELOG.md files
// (tools/fixtures/release-mode-checkout.ts), a stub `git` whose refs carry
// their own commits, and a stub `gh` that serves the releases through jq and
// records each `gh release create` and its notes.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stepRun } from "../release-workflow-lines.ts";
import { type Outcome, run, type Setup, SHA } from "./release-mode-checkout.ts";

const STEP = stepRun("publish", "Create the GitHub releases");

export const SHELL = "@intraverse/se-client-shell@1.2.0";
export const WRAPPER = "@intraverse/se-client-wrapper@1.0.0";
export const OTHER = "b".repeat(40);
export const ref = (tag: string, commit = SHA): string =>
  `${commit}\trefs/tags/${tag}`;

/**
 * `gh api --paginate .../releases?per_page=100 --jq F` applies F to
 * `releases.json`; `gh release create <tag> ...` copies its notes file to
 * `notes-<tag with / and @ as _>`. A file `list-error` or `create-error` makes
 * that call fail like the API.
 */
export const GH = `#!/bin/sh
set -eu
echo "gh $*" >> "$STUB_DIR/calls"
case "$1 $2" in
  "api --paginate")
    [ "$3" = "repos/$GITHUB_REPOSITORY/releases?per_page=100" ] && [ "$4" = --jq ] ||
      { echo "unexpected call: $*" >&2; exit 2; }
    if [ -e "$STUB_DIR/list-error" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
    jq -r "$5" "$STUB_DIR/releases.json" ;;
  "release create")
    if [ -e "$STUB_DIR/create-error" ]; then echo "HTTP 422" >&2; exit 1; fi
    tag="$3"
    notes=""
    while [ $# -gt 0 ]; do
      if [ "$1" = --notes-file ]; then notes="$2"; fi
      shift
    done
    cp "$notes" "$STUB_DIR/notes-$(printf '%s' "$tag" | tr '/@' '__')" ;;
  *) echo "unexpected call: $*" >&2; exit 2 ;;
esac
`;

export const SHELL_CHANGELOG = [
  "# @intraverse/se-client-shell",
  "",
  "## 1.2.0",
  "",
  "### Minor Changes",
  "",
  "- abc123: Adds a thing.",
  "",
  "```sh",
  "## 9.9.9",
  "```",
  "",
  "## 1.1.0",
  "",
  "### Patch Changes",
  "",
  "- def456: An older fix.",
  "",
].join("\n");

export const SHELL_NOTES =
  "### Minor Changes\n\n- abc123: Adds a thing.\n\n```sh\n## 9.9.9\n```\n";

export const WRAPPER_CHANGELOG =
  "# @intraverse/se-client-wrapper\n\n## 1.0.0\n\n### Major Changes\n\n- 0a1b2c: First release.\n";

export type Release = { readonly tag_name: string; readonly assets: string[] };

export const published = (...tags: string[]): string =>
  JSON.stringify(
    tags.map(tag => {
      const at = tag.lastIndexOf("@");
      return { name: tag.slice(0, at), version: tag.slice(at + 1) };
    }),
  );

export const release = (
  options: {
    readonly published?: string;
    readonly refs?: readonly string[];
    readonly releases?: readonly Release[];
    readonly versions?: Readonly<Record<string, string>>;
    readonly changelogs?: Readonly<Record<string, string>>;
    readonly stubFiles?: Readonly<Record<string, string>>;
  } = {},
) => {
  const setup: Setup = {
    gh: GH,
    versions: options.versions ?? {
      "@intraverse/se-client-shell": "1.2.0",
      "@intraverse/se-client-wrapper": "1.0.0",
    },
    refs: options.refs ?? [ref(SHELL), ref(WRAPPER)],
    files: options.changelogs ?? {
      "packages/shell/CHANGELOG.md": SHELL_CHANGELOG,
      "apps/wrapper/CHANGELOG.md": WRAPPER_CHANGELOG,
    },
    stubFiles: {
      "releases.json": JSON.stringify(
        (options.releases ?? []).map(entry => ({
          tag_name: entry.tag_name,
          assets: entry.assets.map(name => ({ name })),
        })),
      ),
      ...options.stubFiles,
    },
    env: {
      GH_TOKEN: "unused",
      PUBLISHED_PACKAGES: options.published ?? published(SHELL, WRAPPER),
    },
  };
  return run(STEP, setup);
};

/** The notes file `gh release create` was given for `tag`. */
export const notesOf = (outcome: Outcome, tag: string): string =>
  readFileSync(
    join(outcome.stubs, `notes-${tag.replaceAll(/[/@]/gu, "_")}`),
    "utf8",
  );

/** The `gh release create` calls an outcome made. */
export const creates = (calls: string): string[] =>
  calls.split("\n").filter(line => line.startsWith("gh release create "));

export const createOf = (tag: string, extra = ""): string =>
  `gh release create ${tag} --repo owner/repository --verify-tag --target ${SHA} --title ${tag}${extra} --notes-file `;
