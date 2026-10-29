import { createHash } from "node:crypto";
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
import { prod, stepRun } from "./release-workflow-lines.ts";

// The production deploy's scripts (.github/workflows/pages-prod.yml; ADR-009,
// decision 3), run as Actions runs them (tools/fixtures/workflow-step.ts) with
// stub `gh` and `git`: `release-check`, which refuses a dispatch while a
// release run is not completed (the release always wins) and resolves the
// tag's commit, and `prod-verify`, which checks the release's tar against its
// `.sha256` and verifies its attestation from the tag's commit.

const REPOSITORY = "owner/repository";
const SHA = "a".repeat(40);
const TAG = "@intraverse/se-client-wrapper@1.0.0";
const TAR = "se-client-wrapper-1.0.0.tar";
const REF = `refs/tags/${TAG}`;

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const stub = (directory: string, name: string, body: string): void => {
  writeFileSync(join(directory, name), body);
  chmodSync(join(directory, name), 0o755);
};

type Outcome = {
  readonly status: number | null;
  readonly output: string;
  readonly result: string;
  readonly calls: string;
};

const runWith = (
  script: string,
  stubs: Readonly<Record<string, string>>,
  files: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string>>,
): Outcome => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-prod-"));
  directories.push(directory);
  const bin = join(directory, "bin");
  const temp = join(directory, "runner");
  mkdirSync(bin);
  mkdirSync(temp);
  for (const [name, body] of Object.entries(stubs)) stub(bin, name, body);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(bin, name), content);
  }
  const output = join(directory, "github-output");
  writeFileSync(output, "");
  const summary = join(directory, "summary");
  const result = runStep(script, directory, {
    env: {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      STUB_DIR: bin,
      RUNNER_TEMP: temp,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_SHA: SHA,
      ...env,
    },
  });
  let calls = "";
  try {
    calls = readFileSync(join(bin, "calls"), "utf8");
  } catch {
    calls = "";
  }
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    result: readFileSync(output, "utf8"),
    calls,
  };
};

describe("release-check", () => {
  const script = stepRun("release-check", "Check the release", prod);

  // `gh api .../runs?status=<s>&per_page=1 --jq .total_count`: the count of
  // runs in status <s>, from the file `runs-<s>` (0 when missing).
  const GH = `#!/bin/sh
set -eu
echo "gh $*" >> "$STUB_DIR/calls"
[ -e "$STUB_DIR/gh-error" ] && { echo "HTTP 502" >&2; exit 1; }
case "$2" in
  "repos/$GITHUB_REPOSITORY/actions/workflows/release.yml/runs?status="*"&per_page=1") ;;
  *) echo "unexpected call: $*" >&2; exit 2 ;;
esac
[ "$3" = --jq ] && [ "$4" = .total_count ] || exit 2
status="\${2#*status=}"; status="\${status%%&*}"
if [ -e "$STUB_DIR/runs-$status" ]; then cat "$STUB_DIR/runs-$status"; else echo 0; fi
`;
  const GIT = `#!/bin/sh
set -eu
echo "git $*" >> "$STUB_DIR/calls"
touch "$STUB_DIR/refs"
cat "$STUB_DIR/refs"
`;

  const check = (
    options: {
      readonly event?: string;
      readonly tag?: string;
      readonly refs?: string;
      readonly runs?: Readonly<Record<string, string>>;
      readonly ghError?: boolean;
    } = {},
  ): Outcome =>
    runWith(
      script,
      { gh: GH, git: GIT },
      {
        refs: options.refs ?? `${SHA}\t${REF}\n`,
        ...Object.fromEntries(
          Object.entries(options.runs ?? {}).map(([status, count]) => [
            `runs-${status}`,
            `${count}\n`,
          ]),
        ),
        ...(options.ghError === true ? { "gh-error": "" } : {}),
      },
      {
        EVENT_NAME: options.event ?? "workflow_dispatch",
        RELEASE_TAG: options.tag ?? TAG,
        GH_TOKEN: "unused",
      },
    );

  it("goes on for a dispatch while no release run is open, with the tag's commit", () => {
    const outcome = check();
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe(`tag=${TAG}\ncommit=${SHA}\n`);
    expect(
      outcome.calls.split("\n").filter(line => line.startsWith("gh ")),
    ).toHaveLength(5);
  });

  it.each(["requested", "queued", "pending", "waiting", "in_progress"])(
    "refuses a dispatch while a release run is %s",
    status => {
      const outcome = check({ runs: { [status]: "1" } });
      expect(outcome.status).toBe(1);
      expect(outcome.output).toContain(`A release run is ${status}`);
      expect(outcome.output).toContain("the release always wins");
      expect(outcome.result).toBe("");
    },
  );

  it("fails on an API error instead of reading it as no release run", () => {
    const outcome = check({ ghError: true });
    expect(outcome.status).not.toBe(0);
    expect(outcome.result).toBe("");
  });

  it("never asks about release runs when the release itself calls it", () => {
    const outcome = check({ event: "push", runs: { in_progress: "1" } });
    expect(outcome.status).toBe(0);
    expect(outcome.calls).not.toContain("gh ");
  });

  it("refuses, when the release calls it, a tag that is not on the run's commit", () => {
    const outcome = check({
      event: "push",
      refs: `${"b".repeat(40)}\t${REF}\n`,
    });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain("is not on this run's commit");
  });

  it("takes an annotated tag's commit, not the tag object", () => {
    const outcome = check({
      refs: `${"c".repeat(40)}\t${REF}\n${SHA}\t${REF}^{}\n`,
    });
    expect(outcome.result).toBe(`tag=${TAG}\ncommit=${SHA}\n`);
  });

  it("refuses a tag that does not exist, or exists only under another name", () => {
    for (const refs of ["", `${SHA}\trefs/tags/x/${REF}\n`]) {
      const outcome = check({ refs });
      expect(outcome.status).toBe(1);
      expect(outcome.output).toContain(`No tag ${TAG}.`);
    }
  });

  it.each([
    "@intraverse/se-client-shell@1.0.0",
    "@intraverse/se-client-wrapper@1.0",
    "@intraverse/se-client-wrapper@1.0.0 --repo x",
    "v1.0.0",
  ])("refuses %s, which is not a Wrapper release tag", tag => {
    const outcome = check({ tag });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain("Not a Wrapper release tag");
    expect(outcome.calls).toBe("");
  });
});

describe("prod-verify", () => {
  const script = stepRun(
    "prod-verify",
    "Download and verify the release",
    prod,
  );
  const BYTES = "the Wrapper's tar\n";
  const HEX = createHash("sha256").update(BYTES).digest("hex");

  // `gh release download` copies the release's files into the working
  // directory; `gh attestation verify` fails when the file `attest-fails`
  // exists.
  const GH = `#!/bin/sh
set -eu
echo "gh $*" >> "$STUB_DIR/calls"
case "$1 $2" in
  "release download")
    cp "$STUB_DIR/asset.tar" "./${TAR}"
    cp "$STUB_DIR/asset.sha256" "./${TAR}.sha256" ;;
  "attestation verify")
    [ -e "$STUB_DIR/attest-fails" ] && { echo "verification failed" >&2; exit 1; }
    echo "verified" ;;
  *) echo "unexpected call: $*" >&2; exit 2 ;;
esac
`;

  const verify = (files: Readonly<Record<string, string>> = {}): Outcome =>
    runWith(
      script,
      { gh: GH },
      {
        "asset.tar": BYTES,
        "asset.sha256": `${HEX}  ${TAR}\n`,
        ...files,
      },
      { RELEASE_TAG: TAG, COMMIT: SHA, GH_TOKEN: "unused" },
    );

  it("downloads the tar by tag, checks it, verifies its attestation from the tag's commit, and outputs its digest", () => {
    const outcome = verify();
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe(
      `wrapper-digest=sha256:${HEX}\nwrapper-file-name=${TAR}\n`,
    );
    expect(outcome.calls.split("\n").filter(Boolean)).toEqual([
      `gh release download ${TAG} --repo ${REPOSITORY} --pattern ${TAR} --pattern ${TAR}.sha256`,
      `gh attestation verify ${TAR} --repo ${REPOSITORY} --signer-workflow ${REPOSITORY}/.github/workflows/release.yml --source-ref refs/heads/main --source-digest ${SHA} --deny-self-hosted-runners`,
    ]);
  });

  it("refuses a .sha256 that names another file", () => {
    const outcome = verify({ "asset.sha256": `${HEX}  other.tar\n` });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain(`${TAR}.sha256 does not name ${TAR}.`);
    expect(outcome.calls).not.toContain("attestation");
  });

  it("refuses a tar that does not match its .sha256", () => {
    const outcome = verify({ "asset.tar": "other bytes\n" });
    expect(outcome.status).not.toBe(0);
    expect(outcome.calls).not.toContain("attestation");
    expect(outcome.result).toBe("");
  });

  it("refuses a tar whose attestation does not verify", () => {
    const outcome = verify({ "attest-fails": "" });
    expect(outcome.status).not.toBe(0);
    expect(outcome.output).toContain("verification failed");
    expect(outcome.result).toBe("");
  });
});
