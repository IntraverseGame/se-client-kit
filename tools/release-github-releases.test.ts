import { afterEach, describe, expect, it } from "vitest";

import {
  createOf,
  creates,
  GH,
  notesOf,
  OTHER,
  published,
  ref,
  release,
  SHELL,
  SHELL_NOTES,
  WRAPPER,
  WRAPPER_CHANGELOG,
} from "./fixtures/github-releases-step.ts";
import { cleanup, run, SHA } from "./fixtures/release-mode-checkout.ts";
import {
  jobKey,
  release as workflowLines,
  stepRun,
  stepWith,
} from "./release-workflow-lines.ts";
import {
  jobRange,
  keyLines,
  mappingAt,
  scalarAt,
  stepRanges,
} from "./workflow-text.ts";

// The release workflow's `publish` job creates the GitHub releases itself
// (.github/workflows/release.yml, step "Create the GitHub releases"; ADR-009,
// the human, 2026-10-28): changesets/action v2.1.2 only warns when its tag
// push fails, and a release created for a missing tag would make GitHub tag
// the default branch's head, not the released commit. So the action runs with
// `create-github-releases: false`, and this step first requires every tag the
// action reported to exist on the run's commit (peeled when annotated), then
// creates each missing release with `--verify-tag` (gh never creates a tag)
// and `--target` the run's commit, its notes the package's changelog entry for
// the version, as the action would have written them. A re-run finishes a
// partial release. The step's own script runs in a temporary checkout
// (tools/fixtures/release-mode-checkout.ts) with stub `git` and `gh`.

const STEP = stepRun("publish", "Create the GitHub releases");

afterEach(cleanup);

describe("publish's GitHub releases step", () => {
  it("comes right after the action, which creates no release, as publish's last step, and keys the Wrapper's jobs", () => {
    const names = stepRanges(
      workflowLines,
      jobRange(workflowLines, "publish"),
    ).map(([from, to]) =>
      keyLines(workflowLines, from, to, 8, "name")
        .map(index => scalarAt(workflowLines, index))
        .join(""),
    );
    expect(names.slice(-2)).toEqual([
      "Publish and tag",
      "Create the GitHub releases",
    ]);
    expect(stepWith("publish", "Publish and tag")).toContain(
      "create-github-releases: false",
    );
    expect(mappingAt(workflowLines, jobKey("publish", "outputs"))).toEqual([
      "wrapper-tag: ${{ steps.releases.outputs.wrapper-tag }}",
    ]);
    expect(scalarAt(workflowLines, jobKey("wrapper-build", "needs"))).toBe(
      "publish",
    );
    expect(STEP).not.toContain("${{");
  });

  it("creates each release on the run's commit, never a tag, with its changelog entry as notes", () => {
    const outcome = release();
    expect(outcome.status).toBe(0);
    const made = creates(outcome.calls);
    expect(made).toHaveLength(2);
    expect(made[0]?.startsWith(createOf(SHELL))).toBe(true);
    expect(made[1]?.startsWith(createOf(WRAPPER))).toBe(true);
    expect(outcome.result).toBe(`wrapper-tag=${WRAPPER}\n`);
  });

  it("takes the notes from the version's own section of the CHANGELOG", () => {
    const outcome = release();
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain(`Created the release ${SHELL}.`);
    expect(notesOf(outcome, SHELL)).toBe(SHELL_NOTES);
    expect(notesOf(outcome, WRAPPER)).toBe(
      "### Major Changes\n\n- 0a1b2c: First release.\n",
    );
  });

  it("marks a prerelease version as a prerelease", () => {
    const tag = "@intraverse/se-client-wrapper@2.0.0-rc.1";
    const outcome = release({
      published: published(tag),
      versions: { "@intraverse/se-client-wrapper": "2.0.0-rc.1" },
      refs: [ref(tag)],
      changelogs: {
        "apps/wrapper/CHANGELOG.md": "# w\n\n## 2.0.0-rc.1\n\n- rc\n",
      },
    });
    expect(outcome.status).toBe(0);
    expect(
      creates(outcome.calls)[0]?.startsWith(createOf(tag, " --prerelease")),
    ).toBe(true);
  });

  it("refuses a tag on another commit and creates no release", () => {
    const outcome = release({ refs: [ref(SHELL), ref(WRAPPER, OTHER)] });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain(
      `The tag ${WRAPPER} is on ${OTHER}, not on this run's commit ${SHA}`,
    );
    expect(creates(outcome.calls)).toEqual([]);
    expect(outcome.result).toBe("");
  });

  it("refuses a tag the action failed to push and creates no release", () => {
    const outcome = release({ refs: [ref(SHELL)] });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain(`The tag ${WRAPPER} does not exist`);
    expect(creates(outcome.calls)).toEqual([]);
  });

  it("peels an annotated tag to its commit", () => {
    const outcome = release({
      refs: [
        ref(SHELL),
        ref(WRAPPER, OTHER),
        `${SHA}\trefs/tags/${WRAPPER}^{}`,
      ],
    });
    expect(outcome.status).toBe(0);
    expect(creates(outcome.calls)).toHaveLength(2);
  });

  it("skips the releases that exist and creates the rest", () => {
    const outcome = release({ releases: [{ tag_name: SHELL, assets: [] }] });
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain(`The release ${SHELL} exists; skipped.`);
    const made = creates(outcome.calls);
    expect(made).toHaveLength(1);
    expect(made[0]?.startsWith(createOf(WRAPPER))).toBe(true);
    expect(outcome.result).toBe(`wrapper-tag=${WRAPPER}\n`);
  });

  it("finishes the releases on a re-run that published nothing, and leaves an earlier release alone", () => {
    const outcome = release({
      published: "",
      versions: {
        "@intraverse/se-client-shell": "1.2.0",
        "@intraverse/se-client-signing": "1.0.0",
        "@intraverse/se-client-wrapper": "1.0.0",
      },
      refs: [
        ref(SHELL),
        ref(WRAPPER),
        ref("@intraverse/se-client-signing@1.0.0", OTHER),
      ],
    });
    expect(outcome.status).toBe(0);
    expect(creates(outcome.calls)).toHaveLength(2);
    expect(outcome.result).toBe(`wrapper-tag=${WRAPPER}\n`);
  });

  it("does nothing more for a release that is complete, the Wrapper's files attached", () => {
    const outcome = release({
      published: "",
      releases: [
        { tag_name: SHELL, assets: [] },
        {
          tag_name: WRAPPER,
          assets: [
            "se-client-wrapper-1.0.0.tar",
            "se-client-wrapper-1.0.0.tar.sha256",
          ],
        },
      ],
    });
    expect(outcome.status).toBe(0);
    expect(creates(outcome.calls)).toEqual([]);
    expect(outcome.result).toBe("");
  });

  it("names no Wrapper release when the Wrapper was not released", () => {
    const outcome = release({
      published: published(SHELL),
      refs: [ref(SHELL)],
    });
    expect(outcome.status).toBe(0);
    expect(creates(outcome.calls)).toHaveLength(1);
    expect(outcome.result).toBe("");
  });

  it("refuses a version with no changelog entry", () => {
    const outcome = release({
      changelogs: {
        "packages/shell/CHANGELOG.md": "# shell\n\n## 1.1.0\n\n- old\n",
        "apps/wrapper/CHANGELOG.md": WRAPPER_CHANGELOG,
      },
    });
    expect(outcome.status).not.toBe(0);
    expect(outcome.output).toContain(`No changelog entry for ${SHELL}`);
  });

  it("refuses a reported package that is not a publishable one", () => {
    const outcome = release({
      published: published(SHELL, "@intraverse/se-client-pages-proxy@0.0.0"),
    });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain("is not a publishable package's version");
    expect(creates(outcome.calls)).toEqual([]);
  });

  it.each(["list-error", "create-error"])(
    "fails on an API error (%s)",
    file => {
      const outcome = release({ stubFiles: { [file]: "" } });
      expect(outcome.status).not.toBe(0);
      expect(outcome.result).toBe("");
    },
  );

  it("fails on a git error instead of reading it as a missing tag", () => {
    const outcome = run(STEP, {
      gitError: true,
      gh: GH,
      versions: { "@intraverse/se-client-wrapper": "1.0.0" },
      stubFiles: { "releases.json": "[]" },
      env: { PUBLISHED_PACKAGES: published(WRAPPER) },
    });
    expect(outcome.status).not.toBe(0);
    expect(creates(outcome.calls)).toEqual([]);
  });
});
