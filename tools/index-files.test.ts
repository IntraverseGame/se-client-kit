import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findIndexViolations, isIndexFile } from "./index-files.ts";
import { findFiles, readText } from "./workspace.ts";

const files = (entries: Record<string, string>): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries));

const ENTRY = "packages/shell/src/index.ts";

describe("index files", () => {
  it("accepts an entry that only re-exports", () => {
    const result = findIndexViolations(
      files({
        [ENTRY]: [
          "// The public API.",
          'export { a, type B } from "./a.ts";',
          "export type {",
          "  C,",
          "  D,",
          '} from "./c.ts";',
          'export * from "./e.ts";',
          "",
        ].join("\n"),
        "apps/reference-game/src/index.ts": "export {};\n",
      }),
    );
    expect(result).toEqual([]);
  });

  it.each([
    ["an import", 'import { a } from "./a.ts";\nexport { a };\n'],
    ["a local export list", "const a = 1;\nexport { a };\n"],
    ["a declaration", "export const a = (): number => 1;\n"],
    ["a type declaration", "export type A = { a: number };\n"],
    ["a side-effect import", 'import "./a.ts";\n'],
    ["an empty re-export (a side-effect import)", 'export {} from "./a.ts";\n'],
    ["a namespace re-export", 'export * as a from "./a.ts";\n'],
    [
      "a declaration hidden by a block comment opened in a line comment",
      '// see /* x\nconst secret = 1;\n// */\nexport { a } from "./a.ts";\n',
    ],
    ["a block comment", '/** The API. */\nexport { a } from "./a.ts";\n'],
  ])("flags %s in an entry", (_name, source) => {
    expect(findIndexViolations(files({ [ENTRY]: source }))).not.toEqual([]);
  });

  it("flags a module re-exported twice from an entry", () => {
    expect(
      findIndexViolations(
        files({
          [ENTRY]:
            'export type { A } from "./a.ts";\nexport { b } from "./a.ts";\n',
        }),
      ),
    ).toEqual([
      `${ENTRY}: "./a.ts" is re-exported twice; merge into one statement`,
    ]);
  });

  it("flags an index file that is not a package's or app's entry", () => {
    expect(
      findIndexViolations(
        files({
          "packages/snapshot/src/evaluator/index.ts":
            'export { a } from "./a.ts";\n',
          "packages/shell/index.ts": 'export { a } from "./src/a.ts";\n',
          "tools/index.ts": "export {};\n",
        }),
      ).map(violation => violation.split(":")[0]),
    ).toEqual([
      "packages/shell/index.ts",
      "packages/snapshot/src/evaluator/index.ts",
      "tools/index.ts",
    ]);
  });

  it("ignores files that are not index files", () => {
    expect(isIndexFile("packages/shell/src/indexer.ts")).toBe(false);
    expect(isIndexFile("packages/shell/src/a/index.tsx")).toBe(true);
    expect(
      findIndexViolations(
        files({ "packages/shell/src/a.ts": "const a = 1;\nexport { a };\n" }),
      ),
    ).toEqual([]);
  });

  it("holds for the repository", () => {
    const root = join(import.meta.dirname, "..");
    const paths = findFiles(root, isIndexFile);
    expect(
      findIndexViolations(
        new Map(paths.map(path => [path, readText(root, path)])),
      ),
    ).toEqual([]);
  });
});
