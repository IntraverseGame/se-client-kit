import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { release } from "./release-workflow-lines.ts";
import { jobRange, keyLine, scalarAt, stepNamed } from "./workflow-text.ts";

// The release workflow's `publish` job requires npm 11.5.1 or later, the
// first npm with trusted publishing (.github/workflows/release.yml, step
// "Require npm 11.5.1 or later"). This test runs that step's own script as
// Actions runs it (tools/fixtures/workflow-step.ts) with a stub `npm` that
// reports a given version.

const [from, to] = stepNamed(
  release,
  jobRange(release, "publish"),
  "Require npm 11.5.1 or later",
);
const script = scalarAt(release, keyLine(release, from, to, 8, "run"));

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** The step's exit status with a stub npm that prints `version`. */
const statusWith = (version: string): number | null => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-npm-"));
  directories.push(directory);
  const npm = join(directory, "npm");
  writeFileSync(npm, `#!/bin/sh\necho '${version}'\n`);
  chmodSync(npm, 0o755);
  return runStep(script, directory, {
    env: { PATH: `${directory}:${process.env["PATH"] ?? ""}` },
  }).status;
};

describe("the publish job's npm version check", () => {
  it.each(["11.5.1", "11.5.2", "11.6.0", "11.19.0", "12.0.0"])(
    "accepts npm %s",
    version => {
      expect(statusWith(version)).toBe(0);
    },
  );

  it.each(["11.5.0", "11.4.9", "10.9.4", "9.99.99", "not a version"])(
    "refuses npm %s",
    version => {
      expect(statusWith(version)).toBe(1);
    },
  );
});
