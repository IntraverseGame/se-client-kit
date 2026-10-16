import { describe, expect, it } from "vitest";

import {
  isIgnored,
  parseGitignore,
  UninterpretableGitignoreLine,
} from "./gitignore.ts";

const ignored = (rules: string, path: string): boolean =>
  isIgnored(parseGitignore(rules), path);

describe("the .gitignore matcher", () => {
  it.each([
    ["dist\n", "dist/index.js", true],
    ["dist\n", "packages/a/dist/index.js", true],
    ["node_modules/\n", "node_modules/x/index.js", true],
    ["node_modules/\n", "node_modules", false],
    ["*.tsbuildinfo\n", "packages/a/tsconfig.tsbuildinfo", true],
    ["/root-only\n", "root-only/a", true],
    ["/root-only\n", "nested/root-only/a", false],
    ["**/cache/\n", "a/b/cache/x", true],
    ["a/**/z\n", "a/b/c/z", true],
    ["report.[0-9]*.json\n", "report.12.json", true],
    ["report.[0-9]*.json\n", "report.ab.json", false],
    ["!keep.log\n*.log\n", "keep.log", true],
    ["*.log\n!keep.log\n", "keep.log", false],
    ["# a comment\n\n", "anything", false],
    ["build/\n!build/keep.txt\n", "build/keep.txt", true],
    [".pnp.*\n", ".pnp.cjs", true],
  ])("rules %j, path %s -> ignored %s", (rules, path, expected) => {
    expect(ignored(rules, path)).toBe(expected);
  });

  it.each(["\\#literal\n", "[unclosed\n", "a**b\n"])(
    "fails closed on the line %j",
    line => {
      expect(() => parseGitignore(line)).toThrow(UninterpretableGitignoreLine);
    },
  );
});
