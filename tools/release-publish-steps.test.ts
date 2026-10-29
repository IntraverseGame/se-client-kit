import { afterEach, describe, expect, it } from "vitest";

import {
  cleanup,
  run,
  WRAPPER_1,
  WRAPPER_TAG,
} from "./fixtures/release-mode-checkout.ts";
import { stepRun } from "./release-workflow-lines.ts";

// The release workflow's `publish` job's tag re-check
// (.github/workflows/release.yml; ADR-009, decision 1): "Check that a version
// is still untagged", which stops a re-run or a duplicate before anything is
// published. The step's own script runs in a temporary checkout with a stub
// `git` (tools/fixtures/release-mode-checkout.ts). The step that creates the
// GitHub releases runs in tools/release-github-releases.test.ts.

const RECHECK = stepRun("publish", "Check that a version is still untagged");

afterEach(cleanup);

describe("publish's tag re-check", () => {
  it("goes on while a version is untagged", () => {
    const outcome = run(RECHECK, { versions: WRAPPER_1 });
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe("release=true\n");
  });

  it("stops with the already-released notice when every version is tagged", () => {
    const outcome = run(RECHECK, { versions: WRAPPER_1, refs: [WRAPPER_TAG] });
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe("release=false\n");
    expect(outcome.output).toContain("::notice::Already released");
  });

  it("stops when every version is 0.0.0", () => {
    expect(run(RECHECK).result).toBe("release=false\n");
  });

  it("fails on a git error instead of publishing", () => {
    const outcome = run(RECHECK, { versions: WRAPPER_1, gitError: true });
    expect(outcome.status).not.toBe(0);
    expect(outcome.result).toBe("");
  });
});
