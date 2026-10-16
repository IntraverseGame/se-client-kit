import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  uncachedScripts,
  workspaceFiles,
  workspaceProblems,
  type Manifest,
} from "./fixtures/wireit-required.ts";
import { rootRequirements } from "./fixtures/wireit-root-required.ts";
import {
  findInputGaps,
  matchesFiles,
  type WireitScript,
} from "./wireit-inputs.ts";

// Every wireit script that has `files` is skipped when none of them changed, so
// each must list everything its command reads. The lists of what a command reads
// come from the files on disk and from probes for files that do not exist yet
// (tools/fixtures/wireit-required.ts and wireit-root-required.ts); the matcher
// approximates wireit's semantics (tools/wireit-inputs.ts).

const root = join(import.meta.dirname, "..");
const rootManifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as Manifest;

/** Scripts that have a command and no `files`, so they run every time. */
const ALWAYS_RUN = ["check:readmes", "e2e#test", "format"];

describe("the matcher", () => {
  it.each([
    ["src/**", "src/a/b/c.json", true],
    ["src/**", "src/a.css", true],
    ["src/**", "src/.hidden/a", true],
    ["src/**", "other/a.json", false],
    ["src/**/*.ts", "src/a/b.json", false],
    ["*.ts", "vite.config.ts", true],
    ["*.ts", "src/a.ts", false],
    [".env.*", ".env.local", true],
    ["**/*", ".env", true],
    ["**/.gitignore", ".gitignore", true],
    ["../../tsconfig.base.json", "../../tsconfig.base.json", true],
    ["src/**/*.{ts,mts}", "src/a.mts", true],
  ])("pattern %s against %s: %s", (pattern, path, expected) => {
    expect(matchesFiles([pattern], path)).toBe(expected);
  });

  it("lets a ! pattern remove what the others matched", () => {
    const files = ["src/**", "!src/**/*.test.ts", "!src/fixtures/scratch.ts"];
    expect(matchesFiles(files, "src/a.ts")).toBe(true);
    expect(matchesFiles(files, "src/a.test.ts")).toBe(false);
    expect(matchesFiles(files, "src/fixtures/scratch.ts")).toBe(false);
    expect(matchesFiles(files, "src/fixtures/other.ts")).toBe(true);
  });
});

describe("the input check itself", () => {
  // The Wrapper's scripts as they were when wireit skipped them after an edit
  // to a file they read (the three cases of the review).
  const build: WireitScript = {
    files: [
      "index.html",
      "src/**/*.ts",
      "!src/**/*.test.ts",
      "tsconfig.json",
      "vite.config.ts",
      "../../tsconfig.base.json",
      "test-only-entry-guard.ts",
      "!src/fixtures/guard-scratch.ts",
    ],
    packageLocks: ["pnpm-lock.yaml"],
  };
  const test: WireitScript = {
    files: [
      "src/**/*.ts",
      "tsconfig.json",
      "vite.config.ts",
      "../../tsconfig.base.json",
      "test-only-entry-guard.ts",
    ],
    packageLocks: ["pnpm-lock.yaml"],
  };

  it("reports an edit to the guard's text helper (not listed)", () => {
    expect(findInputGaps("test", test, ["guard-text.ts"])).toEqual([
      "test: the command reads guard-text.ts, which files omits",
    ]);
  });

  it("reports an edit to a JSON fixture below src/", () => {
    expect(
      findInputGaps("test", test, ["src/fixtures/html-path-entities.json"]),
    ).toHaveLength(1);
  });

  it.each(["public/copy.json", "src/style.css", "src/logo.svg"])(
    "reports a build that does not list %s",
    path => {
      expect(findInputGaps("build", build, [path])).toHaveLength(1);
    },
  );

  it("reports a script without files and one without the lock file", () => {
    expect(findInputGaps("x", { command: "tsc" }, [])).toHaveLength(1);
    expect(findInputGaps("x", { files: ["a"] }, ["a"])).toEqual([
      "x: does not list pnpm-lock.yaml in packageLocks",
    ]);
  });
});

describe("the workspace scripts list every input", () => {
  it.each(workspaceProblems(root, matchesFiles))("%s", (_name, problems) => {
    expect(problems).toEqual([]);
  });

  it.each([
    ["build", "public/copy.json", true],
    ["build", "src/app.css", true],
    ["build", "src/fixtures/guard-scratch.ts", false],
    ["build", "src/app.test.ts", false],
    ["test", "guard-text.ts", true],
    ["test", "src/fixtures/html-path-entities.json", true],
    ["test", "src/fixtures/guard-scratch.ts", true],
    ["typecheck", "guard-text.ts", true],
  ])("the Wrapper's %s selects %s: %s", (script, path, expected) => {
    expect(
      matchesFiles(workspaceFiles(root, "apps/wrapper", script), path),
    ).toBe(expected);
  });

  it.each([
    "src/schemas/play.json",
    "src/vectors/signing/v1.json",
    "src/generated/types.ts",
    "src/testing.ts",
  ])("the build of contracts selects %s", path => {
    expect(
      matchesFiles(workspaceFiles(root, "packages/contracts", "build"), path),
    ).toBe(true);
  });
});

describe("the root scripts list every input", () => {
  const scripts = rootManifest.wireit ?? {};
  it.each(
    rootRequirements(root).map(
      ([name, required]) =>
        [name, findInputGaps(name, scripts[name], required)] as const,
    ),
  )("%s", (_name, problems) => {
    expect(problems).toEqual([]);
  });

  it("leaves a command without files only where it is declared to run every time", () => {
    expect(uncachedScripts(root, rootManifest)).toEqual(ALWAYS_RUN);
  });
});
