import { describe, expect, it } from "vitest";

import { prod, release } from "./release-workflow-lines.ts";
import {
  jobNames,
  jobRange,
  keyLine,
  keyLines,
  type Line,
  scalarAt,
  stepRanges,
} from "./workflow-text.ts";

// Every `run:` step of the release workflow and the production deploy
// (.github/workflows/release.yml and pages-prod.yml) names `shell: bash`, so
// Actions runs it as `bash --noprofile --norc -eo pipefail {0}` (the default
// shell has no pipefail), the way tools/fixtures/workflow-step.ts runs their
// scripts in the tests; and a script of more than one line starts with
// `set -euo pipefail`.

/** Whether job `job` of `lines` has steps (a reusable-workflow call has none). */
const hasSteps = (lines: readonly Line[], job: string): boolean => {
  const [start, end] = jobRange(lines, job);
  return keyLines(lines, start, end, 4, "steps").length === 1;
};

type ScriptStep = {
  readonly where: string;
  readonly shell: string;
  readonly script: string;
};

/** Every step of both workflows that has a `run:` script. */
const scriptSteps = (): ScriptStep[] =>
  [release, prod].flatMap(lines =>
    jobNames(lines)
      .filter(job => hasSteps(lines, job))
      .flatMap(job =>
        stepRanges(lines, jobRange(lines, job))
          .filter(
            ([from, to]) => keyLines(lines, from, to, 8, "run").length > 0,
          )
          .map(([from, to]) => ({
            where: `${job}:${String(from)}`,
            shell: keyLines(lines, from, to, 8, "shell")
              .map(index => scalarAt(lines, index))
              .join(""),
            script: scalarAt(lines, keyLine(lines, from, to, 8, "run")),
          })),
      ),
  );

describe("the release and production workflows' scripts", () => {
  const steps = scriptSteps();

  it("are found", () => {
    expect(steps.length).toBeGreaterThan(10);
  });

  it("all run with bash, so with -eo pipefail", () => {
    expect(steps.filter(step => step.shell !== "bash")).toEqual([]);
  });

  it("start with set -euo pipefail when they have more than one line", () => {
    const first = new Set(
      steps
        .filter(step => step.script.includes("\n"))
        .map(step => step.script.split("\n")[0]),
    );
    expect([...first]).toEqual(["set -euo pipefail"]);
  });
});
