import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { release, stepEnv, stepRun } from "./release-workflow-lines.ts";
import { jobRange, keyLines, scalarAt, stepRanges } from "./workflow-text.ts";

// The release workflow's `wrapper-assets` job, after it attaches the tar and
// its `.sha256`, appends the `gh attestation verify` command (ADR-005,
// decision 4; runbook, Verify before and after) to the Wrapper release's
// notes, keeping the version's CHANGELOG section that the `publish` job's
// "Create the GitHub releases" step wrote as the notes
// (.github/workflows/release.yml, step "Add the verify command to the release
// notes"; the human, 2026-10-28). This test runs the step's own script as
// Actions runs it (`bash --noprofile --norc -eo pipefail`;
// tools/fixtures/workflow-step.ts) with a stub `gh` that serves the release's
// notes by tag and records what an edit writes.

const STEP = "Add the verify command to the release notes";
const script = stepRun("wrapper-assets", STEP);

const TAG = "@intraverse/se-client-wrapper@1.0.0";
const TAR = "se-client-wrapper-1.0.0.tar";
const DIGEST = `sha256:${"d".repeat(64)}`;
const SHA = "a".repeat(40);
const REPOSITORY = "owner/repository";
const CHANGELOG = "### Minor Changes\n\n- abc123: The Wrapper does a thing.";

/**
 * `gh release view <tag> --repo <r> --json body --jq .body` prints the notes of
 * the release whose tag is exactly <tag>; `gh release edit <tag> --repo <r>
 * --notes-file <f>` copies <f> to `edited` and logs the tag; a file `fail-<sub
 * command>` makes that call fail like the API.
 */
const GH = `#!/bin/sh
set -eu
echo "gh $*" >> "$STUB_DIR/calls"
[ "$1" = release ] && [ "$4" = --repo ] && [ "$5" = "$GITHUB_REPOSITORY" ] ||
  { echo "unexpected call: $*" >&2; exit 2; }
if [ -e "$STUB_DIR/fail-$2" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
case "$2" in
  view)
    [ "$6 $7 $8 $9" = "--json body --jq .body" ] || exit 2
    [ -e "$STUB_DIR/notes/$3" ] || { echo "release not found" >&2; exit 1; }
    cat "$STUB_DIR/notes/$3" ;;
  edit)
    [ "$6" = --notes-file ] || exit 2
    cp "$7" "$STUB_DIR/edited"
    echo "$3" > "$STUB_DIR/edited-tag" ;;
  *) exit 2 ;;
esac
`;

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const read = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

/** The step's outcome for a release whose notes are `notes` under `tag`. */
const run = (
  options: {
    readonly tag?: string;
    readonly notes?: Readonly<Record<string, string>>;
    readonly fail?: "view" | "edit";
  } = {},
) => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-notes-"));
  directories.push(directory);
  const bin = join(directory, "bin");
  const temp = join(directory, "runner");
  mkdirSync(join(bin, "notes", "@intraverse"), { recursive: true });
  mkdirSync(temp);
  writeFileSync(join(bin, "gh"), GH);
  chmodSync(join(bin, "gh"), 0o755);
  for (const [tag, body] of Object.entries(
    options.notes ?? { [TAG]: CHANGELOG },
  )) {
    writeFileSync(join(bin, "notes", tag), body);
  }
  if (options.fail !== undefined) {
    writeFileSync(join(bin, `fail-${options.fail}`), "");
  }
  const result = runStep(script, directory, {
    env: {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      STUB_DIR: bin,
      RUNNER_TEMP: temp,
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_SHA: SHA,
      GH_TOKEN: "unused",
      RELEASE_TAG: options.tag ?? TAG,
      WRAPPER_DIGEST: DIGEST,
      WRAPPER_FILE_NAME: TAR,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    edited: read(join(bin, "edited")),
    editedTag: read(join(bin, "edited-tag")),
  };
};

const VERIFY = [
  `Wrapper artifact \`${TAR}\`, digest \`${DIGEST}\`.`,
  "",
  "Verify it (runbook/client-kit-release.md, Verify before and after):",
  "",
  "```sh",
  `gh attestation verify ${TAR} \\`,
  `  --repo ${REPOSITORY} \\`,
  `  --signer-workflow ${REPOSITORY}/.github/workflows/release.yml \\`,
  "  --source-ref refs/heads/main \\",
  `  --source-digest ${SHA} \\`,
  "  --deny-self-hosted-runners",
  "```",
  "",
].join("\n");

describe("the wrapper-assets job's release notes step", () => {
  it("runs after the upload, as the job's last step, with the job token and the build's outputs", () => {
    const names = stepRanges(release, jobRange(release, "wrapper-assets")).map(
      ([from, to]) =>
        keyLines(release, from, to, 8, "name")
          .map(index => scalarAt(release, index))
          .join(""),
    );
    expect(names.slice(-2)).toEqual(["Attach the Wrapper artifact", STEP]);
    expect(stepEnv("wrapper-assets", STEP).join(" ")).toBe(
      [
        "GH_TOKEN: ${{ github.token }}",
        "RELEASE_TAG: ${{ needs.wrapper-build.outputs.release-tag }}",
        "WRAPPER_DIGEST: ${{ needs.wrapper-build.outputs.wrapper-digest }}",
        "WRAPPER_FILE_NAME:",
        "${{ needs.wrapper-build.outputs.wrapper-file-name }}",
      ].join(" "),
    );
    expect(script).not.toContain("${{");
  });

  it("appends the verify command to the CHANGELOG section the releases step wrote", () => {
    const outcome = run();
    expect(outcome.status).toBe(0);
    expect(outcome.edited).toBe(`${CHANGELOG}\n\n${VERIFY}`);
    expect(outcome.editedTag).toBe(`${TAG}\n`);
  });

  it("appends to empty notes too", () => {
    const outcome = run({ notes: { [TAG]: "" } });
    expect(outcome.status).toBe(0);
    expect(outcome.edited).toBe(`\n\n${VERIFY}`);
  });

  it("reads and edits the release by its exact tag, never another", () => {
    const outcome = run({
      notes: {
        [TAG]: CHANGELOG,
        "@intraverse/se-client-wrapper@1.0.0.1": "other",
      },
    });
    expect(outcome.editedTag).toBe(`${TAG}\n`);
    expect(outcome.edited?.startsWith(CHANGELOG)).toBe(true);
    const missing = run({ tag: "@intraverse/se-client-wrapper@2.0.0" });
    expect(missing.status).not.toBe(0);
    expect(missing.edited).toBeNull();
  });

  it.each(["view", "edit"] as const)(
    "fails the job when gh release %s fails, and never writes notes from an error",
    fail => {
      const outcome = run({ fail });
      expect(outcome.status).not.toBe(0);
      expect(outcome.output).toContain("HTTP 502");
      expect(outcome.edited).toBeNull();
    },
  );
});
