import { afterEach, describe, expect, it } from "vitest";

import {
  BUMP,
  cleanup,
  ENABLED,
  type Outcome,
  OTHER_SHA,
  type Pull,
  REPOSITORY,
  run,
  type Setup,
  WRAPPER_1,
  WRAPPER_TAG,
} from "./fixtures/release-mode-checkout.ts";
import { stepRun } from "./release-workflow-lines.ts";

// The release workflow's `changesets-mode` decision
// (.github/workflows/release.yml, "Decide what this push releases"; ADR-009,
// decision 1): pending changesets, the squash merge of the bump pull request,
// the untagged versions, and the notices. The step's own script runs in a
// temporary checkout with stub `gh` and `git`
// (tools/fixtures/release-mode-checkout.ts).

const MODE = stepRun("changesets-mode", "Decide what this push releases");

afterEach(cleanup);

const decide = (setup: Setup): Outcome => run(MODE, { env: ENABLED, ...setup });

describe("changesets-mode's decision", () => {
  it("reports pending changesets without asking the API", () => {
    const outcome = decide({ changesets: ["one.md"], pulls: [BUMP] });
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe("pending=true\nrelease-candidate=false\n");
    expect(outcome.output).toContain("the version job opens or updates");
    expect(outcome.calls).toBe("");
  });

  it("counts only .changeset/*.md files other than its README.md as pending", () => {
    const outcome = decide({ versions: WRAPPER_1 });
    expect(outcome.result).toBe("pending=false\nrelease-candidate=false\n");
    expect(outcome.output).toContain("::notice::Nothing to release");
  });

  it("finds a release candidate on the squash merge of the bump pull request", () => {
    const outcome = decide({ pulls: [BUMP], versions: WRAPPER_1 });
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe("pending=false\nrelease-candidate=true\n");
    expect(outcome.output).toContain(
      "Release candidate, untagged: @intraverse/se-client-wrapper@1.0.0",
    );
    expect(outcome.calls).toContain(
      `ls-remote --tags https://github.com/${REPOSITORY}.git ${WRAPPER_TAG}`,
    );
  });

  it("ends with the publishing-was-off notice when RELEASE_PUBLISH_ENABLED is not true", () => {
    for (const env of [{}, { RELEASE_PUBLISH_ENABLED: "false" }]) {
      const outcome = run(MODE, { pulls: [BUMP], versions: WRAPPER_1, env });
      expect(outcome.status).toBe(0);
      expect(outcome.result).toBe("pending=false\nrelease-candidate=true\n");
      expect(outcome.output).toContain(
        "::notice::Publishing was off: nothing was published for @intraverse/se-client-wrapper@1.0.0.",
      );
    }
  });

  it.each<[string, Pull]>([
    [
      "a fork's branch of the same name",
      {
        ...BUMP,
        head: { ...BUMP.head, repo: { full_name: "fork/repository" } },
      },
    ],
    [
      "a deleted head repository",
      { ...BUMP, head: { ...BUMP.head, repo: null } },
    ],
    [
      "another head branch",
      { ...BUMP, head: { ...BUMP.head, ref: "feature" } },
    ],
    [
      "a branch named like it under a prefix",
      { ...BUMP, head: { ...BUMP.head, ref: "x/changeset-release/main" } },
    ],
    ["another base", { ...BUMP, base: { ref: "next" } }],
    ["an unmerged pull request", { ...BUMP, merged_at: null }],
    [
      "a pull request merged as another commit",
      { ...BUMP, merge_commit_sha: OTHER_SHA },
    ],
  ])("is no release candidate for %s", (_, pull) => {
    const outcome = decide({ pulls: [pull], versions: WRAPPER_1 });
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe("pending=false\nrelease-candidate=false\n");
    expect(outcome.output).toContain("::notice::Nothing to release");
    expect(outcome.calls).not.toContain("ls-remote");
  });

  it("is a release candidate when the bump merge is one of several associated pull requests", () => {
    const other = {
      ...BUMP,
      head: { ...BUMP.head, ref: "feature" },
      number: 3,
    };
    expect(decide({ pulls: [other, BUMP], versions: WRAPPER_1 }).result).toBe(
      "pending=false\nrelease-candidate=true\n",
    );
  });

  it("never counts a version 0.0.0", () => {
    const outcome = decide({ pulls: [BUMP] });
    expect(outcome.result).toBe("pending=false\nrelease-candidate=false\n");
    expect(outcome.calls).not.toContain("ls-remote");
  });

  it.each([
    ["a lightweight tag", [WRAPPER_TAG]],
    ["an annotated tag", [WRAPPER_TAG, `${WRAPPER_TAG}^{}`]],
  ])("is no release candidate when every version has %s", (_, refs) => {
    const outcome = decide({ pulls: [BUMP], versions: WRAPPER_1, refs });
    expect(outcome.result).toBe("pending=false\nrelease-candidate=false\n");
    expect(outcome.output).toContain("::notice::Nothing to release");
  });

  it("compares a tag exactly, not by the tail a ref pattern matches", () => {
    const outcome = decide({
      pulls: [BUMP],
      versions: WRAPPER_1,
      refs: [`refs/tags/x/${WRAPPER_TAG}`],
    });
    expect(outcome.result).toBe("pending=false\nrelease-candidate=true\n");
  });

  it("is a release candidate when one library of several is untagged", () => {
    const outcome = decide({
      pulls: [BUMP],
      versions: { ...WRAPPER_1, "@intraverse/se-client-shell": "1.2.0" },
      refs: [WRAPPER_TAG],
    });
    expect(outcome.result).toBe("pending=false\nrelease-candidate=true\n");
    expect(outcome.output).toContain(
      "untagged: @intraverse/se-client-shell@1.2.0",
    );
  });

  it("fails on an API error instead of reading it as no bump merge", () => {
    const outcome = decide({
      pulls: [BUMP],
      versions: WRAPPER_1,
      ghError: true,
    });
    expect(outcome.status).not.toBe(0);
    expect(outcome.output).toContain("HTTP 502");
    expect(outcome.result).toBe("");
  });

  it("fails on a git error instead of reading it as untagged", () => {
    const outcome = decide({
      pulls: [BUMP],
      versions: WRAPPER_1,
      gitError: true,
    });
    expect(outcome.status).not.toBe(0);
    expect(outcome.result).toBe("");
  });

  it("refuses a manifest whose version is not a version", () => {
    const outcome = decide({
      pulls: [BUMP],
      versions: { "@intraverse/se-client-wrapper": "1.0.0; rm -rf /" },
    });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain("Unexpected name or version");
  });
});
