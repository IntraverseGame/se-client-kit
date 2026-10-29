// The temporary git repositories of tools/release-version-guard.test.ts: a
// base commit, a change, and the version-file guard
// (tools/release-version-guard.sh) run on it, as the release workflow's
// `version` job runs it after `changeset version`. Git runs without any user or
// system configuration.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runStep } from "./workflow-step.ts";

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

export type Outcome = {
  status: number | null;
  output: string;
  /** What the index holds after the guard (`git diff --cached --name-only`). */
  staged: string;
};

/** A repository with `BASE` committed, `change` applied, and the guard run. */
export const makeGuard =
  (script: string, directories: string[]) =>
  (
    change: (root: string, git: (...args: string[]) => void) => void,
  ): Outcome => {
    const directory = mkdtempSync(join(tmpdir(), "se-client-kit-guard-"));
    directories.push(directory);
    const root = join(directory, "repository");
    const env = environment(directory);
    const git = (...args: string[]): string => {
      const result = spawnSync("git", args, {
        cwd: root,
        env,
        encoding: "utf8",
      });
      if (result.status !== 0)
        throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
      return result.stdout;
    };
    mkdirSync(root);
    git("init", "--quiet", "--initial-branch", "main");
    for (const [path, content] of Object.entries(BASE))
      write(root, path, content);
    git("add", "--all");
    git("commit", "--quiet", "--message", "base");
    change(root, (...args) => {
      git(...args);
    });
    const result = runStep(script, directory, { cwd: root, env });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      staged: git("diff", "--cached", "--name-only"),
    };
  };
