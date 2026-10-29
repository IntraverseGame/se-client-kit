import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { stepRun } from "./release-workflow-lines.ts";

// The release workflow's `wrapper-assets` job attaches the Wrapper's tar and
// its `.sha256` only to the one release the `publish` job's "Create the
// GitHub releases" step created for the tag (changesets/action only pushes
// the tags), and refuses a release that already has those files, a missing
// release, two releases with the tag, and any API error
// (.github/workflows/release.yml, step "Find the Wrapper release"; ADR-009,
// decision 2). The paginated listing is kept from the earlier
// `github-release` guard (#158): `gh release view` failed under Actions' `-e`.
// This test runs the step's own script as Actions runs it
// (`bash --noprofile --norc -eo pipefail`; tools/fixtures/workflow-step.ts)
// with a stub `gh` that serves pages of releases and applies the step's `--jq`
// filter to each page with jq, as `gh api --paginate --jq` does.

const TAG = "@intraverse/se-client-wrapper@1.0.0";
const TAR = "se-client-wrapper-1.0.0.tar";

const script = stepRun("wrapper-assets", "Find the Wrapper release");

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** The stub: checks the call, then filters each page, or fails like the API. */
const STUB = `#!/bin/sh
set -eu
[ "$1" = api ] && [ "$2" = --paginate ] &&
  [ "$3" = "repos/owner/repository/releases?per_page=100" ] &&
  [ "$4" = --jq ] || { echo "unexpected call: $*" >&2; exit 2; }
if [ -e "$STUB_DIR/error" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
for page in "$STUB_DIR"/page-*.json; do
  [ -e "$page" ] || continue
  jq -r "$5" "$page"
done
`;

type Release = {
  readonly tag_name: string;
  readonly draft: boolean;
  readonly assets: readonly { readonly name: string }[];
};

const releaseOf = (
  tag: string,
  assets: readonly string[] = [],
  draft = false,
): Release => ({
  tag_name: tag,
  draft,
  assets: assets.map(name => ({ name })),
});

/** The step's outcome with the stub serving `pages`, or an API error. */
const run = (pages: readonly (readonly Release[])[], error = false) => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-gh-"));
  directories.push(directory);
  writeFileSync(join(directory, "gh"), STUB);
  chmodSync(join(directory, "gh"), 0o755);
  for (const [index, page] of pages.entries()) {
    writeFileSync(
      join(directory, `page-${String(index)}.json`),
      JSON.stringify(page),
    );
  }
  if (error) writeFileSync(join(directory, "error"), "");
  const result = runStep(script, directory, {
    env: {
      PATH: `${directory}:${process.env["PATH"] ?? ""}`,
      STUB_DIR: directory,
      RELEASE_TAG: TAG,
      WRAPPER_FILE_NAME: TAR,
      GITHUB_REPOSITORY: "owner/repository",
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const OLDER = releaseOf("@intraverse/se-client-wrapper@0.9.0", [
  "se-client-wrapper-0.9.0.tar",
  "se-client-wrapper-0.9.0.tar.sha256",
]);

describe("the wrapper-assets job's release guard", () => {
  it("goes on when the one release with the tag has no Wrapper files", () => {
    const outcome = run([
      [OLDER, releaseOf("@intraverse/se-client-shell@1.0.0")],
      [releaseOf(TAG, ["notes.txt"])],
    ]);
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain(
      `The release ${TAG} has no Wrapper files yet.`,
    );
  });

  it.each<[string, readonly string[]]>([
    ["the tar", [TAR]],
    ["the .sha256", [`${TAR}.sha256`]],
    ["both files", [TAR, `${TAR}.sha256`]],
  ])("refuses a release that already has %s", (_, assets) => {
    const outcome = run([[OLDER, releaseOf(TAG, assets)]]);
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain("already has the Wrapper's files");
    expect(outcome.output).toContain('"The wrapper-assets job failed"');
  });

  it("refuses when no release has the tag", () => {
    const outcome = run([[OLDER]]);
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain(
      `Expected one release for ${TAG}, found 0`,
    );
  });

  it("refuses when the repository has no release at all", () => {
    expect(run([[]]).status).toBe(1);
  });

  it("refuses two releases with the tag, a draft among them, across pages", () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      releaseOf(`@intraverse/se-client-wrapper@0.0.${String(index + 1)}`),
    );
    const outcome = run([
      [...first, releaseOf(TAG)],
      [releaseOf(TAG, [], true)],
    ]);
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain(
      `Expected one release for ${TAG}, found 2`,
    );
  });

  it("compares the tag exactly, not as a pattern", () => {
    const outcome = run([
      [
        releaseOf(TAG),
        releaseOf(`${TAG}.1`, [TAR]),
        releaseOf(`x${TAG}`, [TAR]),
        releaseOf("@intraverse"),
      ],
    ]);
    expect(outcome.status).toBe(0);
  });

  it("fails on an API error instead of reading it as no assets", () => {
    const outcome = run([], true);
    expect(outcome.status).not.toBe(0);
    expect(outcome.output).toContain("HTTP 502");
    expect(outcome.output).not.toContain("has no Wrapper files yet");
  });
});
