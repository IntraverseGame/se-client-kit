// Reads contract sources from a local git checkout at a ref, with `git show`
// and `git log`, so the lock names the exact commit and a stale or dirty working
// tree cannot leak into it.

import { execFileSync } from "node:child_process";

import type { GroupSource, SourceReader } from "./contracts-lock.ts";

const FULL_COMMIT = /^[0-9a-f]{40}$/u;

const git = (repo: string, args: readonly string[]): Buffer =>
  execFileSync("git", ["-C", repo, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

export const gitReader: SourceReader = {
  list: (source: GroupSource): string[] =>
    git(source.repo, [
      "ls-tree",
      "-r",
      "--name-only",
      "-z",
      source.ref,
      "--",
      source.path,
    ])
      .toString("utf8")
      .split("\0")
      .filter(name => name !== "")
      .toSorted(),
  read: (source: GroupSource, file: string): Uint8Array =>
    git(source.repo, ["show", `${source.ref}:${file}`]),
  commit: (source: GroupSource, file: string): string => {
    const hash = git(source.repo, [
      "log",
      "-1",
      "--format=%H",
      source.ref,
      "--",
      file,
    ])
      .toString("utf8")
      .trim();
    if (!FULL_COMMIT.test(hash))
      throw new Error(`${source.name}:${file}: no commit at ${source.ref}`);
    return hash;
  },
};
