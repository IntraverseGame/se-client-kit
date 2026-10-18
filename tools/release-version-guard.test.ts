import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  jobRange,
  keyLine,
  keyLines,
  readLines,
  scalarAt,
  stepNamed,
} from "./workflow-text.ts";

// The release workflow's `version` job refuses to push anything but what
// `changeset version` writes (.github/workflows/release.yml, step "Check what
// changeset version changed"). This test runs that step's own script, read
// from the workflow, with bash against temporary git repositories: each
// change below is made after a base commit, and the script must pass or
// refuse it. Git runs without any user or system configuration.

const STEP = "Check what changeset version changed";
const lines = readLines(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "release.yml"),
    "utf8",
  ),
);
const step = stepNamed(lines, jobRange(lines, "version"), STEP);
const script = scalarAt(lines, keyLine(lines, step[0], step[1], 8, "run"));

const BASE: Readonly<Record<string, string>> = {
  "package.json": "{}\n",
  "packages/a/package.json": '{"version":"0.1.0"}\n',
  "packages/a/CHANGELOG.md": "# a\n",
  ".changeset/one.md": "---\n---\none\n",
  ".changeset/two.md": "---\n---\ntwo\n",
  ".changeset/README.md": "readme\n",
  ".changeset/x/y.md": "nested\n",
  "tools/guard.ts": "export {};\n",
  "packages/odd\nname/package.json": "{}\n",
  'packages/q"uote/package.json': "{}\n",
};

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const environment = (home: string): NodeJS.ProcessEnv => ({
  PATH: process.env["PATH"],
  HOME: home,
  LC_ALL: "C",
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
});

const write = (root: string, path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

type Outcome = { status: number | null; output: string; result: string };

/** A repository with `BASE` committed, `change` applied, and the guard run. */
const guard = (
  change: (root: string, git: (...args: string[]) => void) => void,
): Outcome => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-guard-"));
  directories.push(directory);
  const root = join(directory, "repository");
  const env = environment(directory);
  const git = (...args: string[]): void => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  };
  mkdirSync(root);
  git("init", "--quiet", "--initial-branch", "main");
  for (const [path, content] of Object.entries(BASE))
    write(root, path, content);
  git("add", "--all");
  git("commit", "--quiet", "--message", "base");
  change(root, git);
  const scriptPath = join(directory, "guard.sh");
  const outputPath = join(directory, "github-output");
  writeFileSync(scriptPath, script);
  writeFileSync(outputPath, "");
  const result = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-eo", "pipefail", scriptPath],
    { cwd: root, env: { ...env, GITHUB_OUTPUT: outputPath }, encoding: "utf8" },
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    result: readFileSync(outputPath, "utf8"),
  };
};

const expectRefused = (outcome: Outcome): void => {
  expect(outcome.status).toBe(1);
  expect(outcome.output).toContain("Unexpected change:");
  expect(outcome.output).toContain(
    "changeset version changed more than it should; nothing pushed.",
  );
  expect(outcome.result).toBe("");
};

describe("the version job's push guard", () => {
  it("is a bash script that holds no token", () => {
    expect(scalarAt(lines, keyLine(lines, step[0], step[1], 8, "shell"))).toBe(
      "bash",
    );
    expect(keyLines(lines, step[0], step[1], 8, "env")).toEqual([]);
  });

  it("passes what changeset version writes", () => {
    const outcome = guard(root => {
      write(root, "package.json", '{"private":true}\n');
      write(root, "packages/a/package.json", '{"version":"0.2.0"}\n');
      write(root, "packages/a/CHANGELOG.md", "# a\n\n## 0.2.0\n");
      write(root, "CHANGELOG.md", "# kit\n");
      write(root, "packages/b/CHANGELOG.md", "# b\n");
      unlinkSync(join(root, ".changeset/one.md"));
      unlinkSync(join(root, ".changeset/two.md"));
    });
    expect(outcome.output).not.toContain("Unexpected change:");
    expect(outcome.status).toBe(0);
    expect(outcome.result).toBe("changed=true\n");
  });

  it("pushes nothing when nothing changed", () => {
    const outcome = guard(() => {
      // Nothing changes after the base commit.
    });
    expect(outcome.status).toBe(0);
    expect(outcome.output).toContain("No pending changesets; nothing to push.");
    expect(outcome.result).toBe("changed=false\n");
  });

  it.each<[string, (root: string, git: (...args: string[]) => void) => void]>([
    [
      "a rename onto a CHANGELOG.md",
      (_, git) => git("mv", "tools/guard.ts", "tools/CHANGELOG.md"),
    ],
    [
      "a deleted package.json",
      root => unlinkSync(join(root, "packages/a/package.json")),
    ],
    [
      "a deleted CHANGELOG.md",
      root => unlinkSync(join(root, "packages/a/CHANGELOG.md")),
    ],
    [
      "an added package.json",
      root => write(root, "packages/c/package.json", "{}\n"),
    ],
    [
      "an added changeset",
      root => write(root, ".changeset/new.md", "---\n---\nnew\n"),
    ],
    [
      "an edited changeset",
      root => write(root, ".changeset/one.md", "edited\n"),
    ],
    [
      "a deleted file below .changeset/",
      root => unlinkSync(join(root, ".changeset/x/y.md")),
    ],
    [
      "the deleted .changeset/README.md",
      root => unlinkSync(join(root, ".changeset/README.md")),
    ],
    [
      "an edited source file",
      root => write(root, "tools/guard.ts", "export const x = 1;\n"),
    ],
    [
      "a CHANGELOG.md added inside .changeset/",
      root => write(root, ".changeset/CHANGELOG.md", "# not a changelog\n"),
    ],
    [
      "a CHANGELOG.md added below .changeset/",
      root => write(root, ".changeset/x/CHANGELOG.md", "# not a changelog\n"),
    ],
    [
      "an added workflow",
      root => write(root, ".github/workflows/x.yml", "on: push\n"),
    ],
    [
      "a package.json turned into a symbolic link",
      root => {
        unlinkSync(join(root, "packages/a/package.json"));
        symlinkSync(
          "../../package.json",
          join(root, "packages/a/package.json"),
        );
      },
    ],
    [
      "a package.json made executable",
      root => chmodSync(join(root, "packages/a/package.json"), 0o755),
    ],
    [
      "a CHANGELOG.md added as a symbolic link",
      root =>
        symlinkSync(
          "../../tools/guard.ts",
          join(root, "packages/a/../CHANGELOG.md"),
        ),
    ],
    [
      "a path with a newline",
      root =>
        write(root, "packages/odd\nname/package.json", '{"version":"1"}\n'),
    ],
    [
      "a path with a quote",
      root => write(root, 'packages/q"uote/package.json', '{"version":"1"}\n'),
    ],
  ])("refuses %s", (_, change) => {
    const outcome = guard(change);
    expect(outcome.status).toBe(1);
    expectRefused(outcome);
  });

  it("refuses an allowed change together with a refused one", () => {
    const outcome = guard(root => {
      write(root, "packages/a/package.json", '{"version":"0.2.0"}\n');
      write(root, "tools/guard.ts", "export const x = 1;\n");
    });
    expect(outcome.output).toContain("Unexpected change: M tools/guard.ts");
    expectRefused(outcome);
  });
});
