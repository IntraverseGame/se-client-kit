// Runs a workflow step's `run:` script the way GitHub Actions runs a step
// with `shell: bash`: `bash --noprofile --norc -eo pipefail {0}`, the script
// written to a file. Shared by the tests that run release.yml's steps.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Actions' `shell: bash` template, without the script path (`{0}`). */
export const ACTIONS_BASH = ["--noprofile", "--norc", "-eo", "pipefail"];

export type StepResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

/** Run `script` from a file in `directory`, as Actions would. */
export const runStep = (
  script: string,
  directory: string,
  options: { readonly cwd?: string; readonly env: NodeJS.ProcessEnv },
): StepResult => {
  const path = join(directory, "step.sh");
  writeFileSync(path, script);
  const result = spawnSync("bash", [...ACTIONS_BASH, path], {
    cwd: options.cwd ?? directory,
    env: options.env,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
