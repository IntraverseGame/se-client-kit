import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { prod, stepRun } from "./release-workflow-lines.ts";

// Peeling a release tag to its commit with `git ls-remote` (pages-prod.yml's
// `release-check`; release.yml's "Create the GitHub releases"), against real
// git and a local bare repository (no network, no user or system git
// configuration). git lists a ref when `/<ref>` matches `*/<pattern>`, so with
// the pattern `refs/tags/X` alone it never lists the peeled `refs/tags/X^{}`
// line, and an annotated tag would resolve to its tag object: the scripts ask
// for both patterns. The stub `git` of tools/pages-prod-scripts.test.ts and
// tools/fixtures/release-mode-checkout.ts answers as checked here.

const REPOSITORY = "owner/repository";
const ANNOTATED = "@intraverse/se-client-wrapper@1.0.0";
const LIGHTWEIGHT = "@intraverse/se-client-wrapper@1.0.1";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const gitEnvironment = (home: string): NodeJS.ProcessEnv => ({
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

type Remote = {
  readonly directory: string;
  readonly url: string;
  readonly commit: string;
  readonly tagObject: string;
  readonly env: NodeJS.ProcessEnv;
  readonly git: (...args: string[]) => string;
};

/**
 * A bare repository at `<directory>/owner/repository.git` with one commit, an
 * annotated and a lightweight tag on it.
 */
const remote = (): Remote => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-peel-"));
  directories.push(directory);
  const bare = join(directory, `${REPOSITORY}.git`);
  mkdirSync(bare, { recursive: true });
  const env = gitEnvironment(directory);
  const git = (...args: string[]): string => {
    const result = spawnSync("git", args, { cwd: bare, env, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  git("init", "--quiet", "--bare");
  const tree = git("mktree");
  const commit = git("commit-tree", tree, "-m", "release");
  git("tag", "--annotate", "--message", "annotated", ANNOTATED, commit);
  git("tag", LIGHTWEIGHT, commit);
  return {
    directory,
    url: `file://${bare}`,
    commit,
    tagObject: git("rev-parse", `refs/tags/${ANNOTATED}`),
    env,
    git,
  };
};

describe("git ls-remote, as the release scripts use it", () => {
  it("lists an annotated tag's peeled line only when its ^{} pattern is asked for", () => {
    const { url, commit, tagObject, git } = remote();
    const ref = `refs/tags/${ANNOTATED}`;
    expect(tagObject).not.toBe(commit);
    expect(git("ls-remote", "--tags", url, ref)).toBe(`${tagObject}\t${ref}`);
    expect(git("ls-remote", "--tags", url, ref, `${ref}^{}`)).toBe(
      `${tagObject}\t${ref}\n${commit}\t${ref}^{}`,
    );
  });

  it("lists a lightweight tag on one line, both patterns asked for", () => {
    const { url, commit, git } = remote();
    const ref = `refs/tags/${LIGHTWEIGHT}`;
    expect(git("ls-remote", "--tags", url, ref, `${ref}^{}`)).toBe(
      `${commit}\t${ref}`,
    );
  });
});

describe("release-check against real git", () => {
  const script = stepRun("release-check", "Check the release", prod);

  it.each([
    ["an annotated tag", ANNOTATED],
    ["a lightweight tag", LIGHTWEIGHT],
  ])("resolves %s to its commit", (_, tag) => {
    const { directory, commit, env } = remote();
    const output = join(directory, "github-output");
    writeFileSync(output, "");
    const result = runStep(script, directory, {
      env: {
        ...env,
        EVENT_NAME: "push",
        RELEASE_TAG: tag,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: REPOSITORY,
        GITHUB_SERVER_URL: `file://${directory}`,
        GITHUB_SHA: commit,
      },
    });
    expect(result.stdout + result.stderr).not.toContain("::error::");
    expect(result.status).toBe(0);
    expect(readFileSync(output, "utf8")).toBe(`tag=${tag}\ncommit=${commit}\n`);
  });
});
