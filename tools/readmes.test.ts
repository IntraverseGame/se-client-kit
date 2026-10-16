import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findReadmeProblems } from "./readme-rules.ts";

// Every directory under packages/ and apps/ has a README.md that follows the
// public-documentation rules (tools/readme-rules.ts). A new package cannot skip
// it. The rules themselves are exercised by readme-rules.test.ts.

const root = join(import.meta.dirname, "..");

const workspaces = ["packages", "apps"].flatMap(group =>
  readdirSync(join(root, group), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      directory: `${group}/${entry.name}`,
      kind: group === "packages" ? ("package" as const) : ("app" as const),
    })),
);

describe.each(workspaces)("$directory", ({ directory, kind }) => {
  it("has a README.md", () => {
    expect(existsSync(join(root, directory, "README.md"))).toBe(true);
  });

  it("follows the public README rules", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, directory, "package.json"), "utf8"),
    ) as { name: string; private?: boolean };
    const problems = findReadmeProblems({
      text: readFileSync(join(root, directory, "README.md"), "utf8"),
      name: manifest.name,
      kind,
      isPrivate: manifest.private === true,
      root,
    });
    expect(problems).toEqual([]);
  });
});
