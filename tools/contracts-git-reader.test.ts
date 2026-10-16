import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { gitReader } from "./contracts-git-reader.ts";
import type { GroupSource } from "./contracts-lock.ts";

// Hermetic: a throwaway repository on local disk, no network, no real clock
// dependence (the commits are compared by hash, not by date).
let repo: string;

// Neither the person's global nor the system git config applies (commit
// signing, hooks, templates): every git call here, the reader's included, sees
// only this repository's own settings.
beforeAll(() => {
  vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const git = (...args: string[]): string =>
  execFileSync(
    "git",
    [
      "-C",
      repo,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      ...args,
    ],
    { encoding: "utf8" },
  ).trim();

const source = (path: string, ref = "main"): GroupSource => ({
  name: "t",
  repo,
  ref,
  path,
});

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "contracts-git-"));
  git("init", "-q", "-b", "main");
  mkdirSync(join(repo, "d"));
  writeFileSync(join(repo, "d", "a.json"), "one\n");
  writeFileSync(join(repo, "d", "b.json"), "two\n");
  git("add", "-A");
  git("commit", "-q", "-m", "first");
  writeFileSync(join(repo, "d", "b.json"), "two changed\n");
  git("commit", "-q", "-am", "second");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("the git reader", () => {
  it("lists the files below a path, sorted", () => {
    expect(gitReader.list(source("d"))).toEqual(["d/a.json", "d/b.json"]);
  });

  it("reads a file as committed at the ref", () => {
    expect(
      new TextDecoder().decode(gitReader.read(source("d"), "d/b.json")),
    ).toBe("two changed\n");
  });

  it("names, per file, the last commit that touched it", () => {
    expect(gitReader.commit(source("d"), "d/a.json")).toBe(
      git("rev-parse", "HEAD~1"),
    );
    expect(gitReader.commit(source("d"), "d/b.json")).toBe(
      git("rev-parse", "HEAD"),
    );
  });

  it("reads the ref, never the working tree", () => {
    writeFileSync(join(repo, "d", "a.json"), "uncommitted\n");
    expect(
      new TextDecoder().decode(gitReader.read(source("d"), "d/a.json")),
    ).toBe("one\n");
  });

  it("lists nothing for a path that is not in the ref", () => {
    expect(gitReader.list(source("nope"))).toEqual([]);
  });

  it("fails on a ref that does not exist", () => {
    expect(() => gitReader.list(source("d", "no-such-ref"))).toThrow(
      /Command failed/u,
    );
  });

  it("fails on a file with no commit at the ref", () => {
    expect(() => gitReader.commit(source("d"), "d/never.json")).toThrow(
      /no commit at main/u,
    );
  });
});
