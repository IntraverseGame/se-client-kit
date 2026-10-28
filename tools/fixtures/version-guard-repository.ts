// The temporary git repositories of tools/release-version-guard.test.ts: a
// base commit, a change, and the release workflow's guard script run on it,
// directly or through the version job's export and the version-push job's
// apply scripts. Git runs without any user or system configuration.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runStep } from "./workflow-step.ts";

/** The `run:` scripts, read from the workflow by the test. */
export type GuardScripts = {
  readonly guard: string;
  readonly exportScript: string;
  readonly applyScript: string;
};

export const BASE: Readonly<Record<string, string>> = {
  "package.json": "{}\n",
  "packages/a/package.json": '{"version":"0.1.0"}\n',
  "packages/a/CHANGELOG.md": "# a\n",
  ".changeset/one.md": "---\n---\none\n",
  ".changeset/two.md": "---\n---\ntwo\n",
  ".changeset/README.md": "readme\n",
  ".changeset/x/y.md": "nested\n",
  "tools/guard.ts": "export {};\n",
  ".github/CHANGELOG.md": "# workflows\n",
  ".github/actions/x/package.json": "{}\n",
  "packages/odd\nname/package.json": "{}\n",
  'packages/q"uote/package.json': "{}\n",
};

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

export const write = (root: string, path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

export type Outcome = { status: number | null; output: string; result: string };

export type Route = "direct" | "patch";

/**
 * A repository with `BASE` committed, `change` applied, and the guard run. With
 * the `patch` route, the change is made in one repository, exported by the
 * version job's script, and applied by the version-push job's script to a clone
 * of the base commit, where the guard runs.
 */
export const makeGuard =
  (scripts: GuardScripts, directories: string[]) =>
  (
    change: (root: string, git: (...args: string[]) => void) => void,
    route: Route = "direct",
  ): Outcome => {
    const { guard: script, exportScript, applyScript } = scripts;
    const directory = mkdtempSync(join(tmpdir(), "se-client-kit-guard-"));
    directories.push(directory);
    const root = join(directory, "repository");
    const env = environment(directory);
    const gitIn =
      (cwd: string) =>
      (...args: string[]): void => {
        const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
        if (result.status !== 0)
          throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
      };
    const git = gitIn(root);
    mkdirSync(root);
    git("init", "--quiet", "--initial-branch", "main");
    for (const [path, content] of Object.entries(BASE))
      write(root, path, content);
    git("add", "--all");
    git("commit", "--quiet", "--message", "base");
    const pushed = join(directory, "pushed");
    if (route === "patch") gitIn(directory)("clone", "--quiet", root, pushed);
    change(root, git);
    const runnerTemp = join(directory, "runner");
    mkdirSync(runnerTemp);
    const bash = (body: string, cwd: string, output: string) => {
      writeFileSync(output, "");
      return runStep(body, directory, {
        cwd,
        env: { ...env, GITHUB_OUTPUT: output, RUNNER_TEMP: runnerTemp },
      });
    };
    const outputPath = join(directory, "github-output");
    let cwd = root;
    let prefix = "";
    if (route === "patch") {
      const exported = bash(exportScript, root, outputPath);
      if (exported.status !== 0) throw new Error(exported.stderr);
      const changed = readFileSync(outputPath, "utf8");
      if (changed === "changed=false\n") {
        return { status: 0, output: exported.stdout, result: changed };
      }
      const applied = bash(applyScript, pushed, outputPath);
      prefix = `${applied.stdout}${applied.stderr}`;
      if (applied.status !== 0) {
        return { status: applied.status, output: prefix, result: "" };
      }
      cwd = pushed;
    }
    const result = bash(script, cwd, outputPath);
    return {
      status: result.status,
      output: `${prefix}${result.stdout}${result.stderr}`,
      result: readFileSync(outputPath, "utf8"),
    };
  };
