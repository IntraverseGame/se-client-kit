import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { release } from "./release-workflow-lines.ts";
import { jobRange, keyLine, scalarAt, stepNamed } from "./workflow-text.ts";

// The release workflow's `github-release` job refuses to create a release
// when one exists for the tag, draft or published, and fails on any API error
// (.github/workflows/release.yml, step "Refuse a release that exists"). This
// test runs that step's own script as Actions runs it
// (`bash --noprofile --norc -eo pipefail`; tools/fixtures/workflow-step.ts)
// with a stub `gh` that serves pages of releases and applies the step's
// `--jq` filter to each page with jq, as `gh api --paginate --jq` does.

const TAG = "@intraverse/se-client-wrapper@1.0.0";

const [from, to] = stepNamed(
  release,
  jobRange(release, "github-release"),
  "Refuse a release that exists",
);
const script = scalarAt(release, keyLine(release, from, to, 8, "run"));

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

type Release = { readonly tag_name: string; readonly draft: boolean };

const releaseOf = (tag: string, draft = false): Release => ({
  tag_name: tag,
  draft,
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
      GITHUB_REPOSITORY: "owner/repository",
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const OLDER = releaseOf("@intraverse/se-client-wrapper@0.9.0");

describe("the github-release job's existing-release guard", () => {
  // The case the earlier `gh release view` script failed under Actions'
  // `-e`: with no release for the tag, the job must go on.
  it("goes on when no release has the tag", () => {
    const outcome = run([
      [OLDER],
      [releaseOf("@intraverse/se-client-wrapper@1.0.0-rc.1", true)],
    ]);
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain(`No release for ${TAG} yet.`);
  });

  it("goes on when the repository has no release at all", () => {
    expect(run([[]]).status).toBe(0);
  });

  it.each<[string, Release]>([
    ["a draft", releaseOf(TAG, true)],
    ["a published release", releaseOf(TAG)],
  ])("refuses %s with the tag", (_, match) => {
    const outcome = run([[OLDER, match]]);
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain("exists already (it may be a draft)");
    expect(outcome.output).toContain('"The github-release job failed"');
  });

  it("refuses a release with the tag on a later page", () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      releaseOf(`@intraverse/se-client-wrapper@0.0.${String(index + 1)}`),
    );
    expect(run([first, [releaseOf(TAG, true)]]).status).toBe(1);
  });

  it("compares the tag exactly, not as a pattern", () => {
    const outcome = run([
      [releaseOf(`${TAG}.1`), releaseOf(`x${TAG}`), releaseOf("@intraverse")],
    ]);
    expect(outcome.status).toBe(0);
  });

  it("fails on an API error instead of reading it as no release", () => {
    const outcome = run([], true);
    expect(outcome.status).not.toBe(0);
    expect(outcome.output).toContain("HTTP 502");
    expect(outcome.output).not.toContain("No release for");
  });
});
