import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findInlineTypeReExports, isSourceFile } from "./type-re-exports.ts";
import { findFiles, readText } from "./workspace.ts";

const GAME = "apps/reference-game/src/types.ts";
const CONTROLLER = '"@intraverse/se-client-shell/controller"';

// This check and its test hold the refused form as example text.
const OWN = new Set([
  "tools/type-re-exports.ts",
  "tools/type-re-exports.test.ts",
]);
const isScanned = (path: string): boolean =>
  isSourceFile(path) && !OWN.has(path);

const check = (text: string): string[] =>
  findInlineTypeReExports(new Map([[GAME, text]]));

describe("inline type re-exports", () => {
  it.each([
    `export { type HelloMessage } from ${CONTROLLER};`,
    `export { type HelloMessage, type Pick } from ${CONTROLLER};`,
    `export {\n  type HelloMessage,\n  type Pick as P,\n} from ${CONTROLLER};`,
    'export { type A } from "./a.ts";',
  ])("refuses %s", text => {
    expect(check(text)).toHaveLength(1);
  });

  it.each([
    `export type { HelloMessage } from ${CONTROLLER};`,
    `import type { HelloMessage } from ${CONTROLLER};`,
    'export { a, type B } from "./a.ts";',
    'export * from "./a.ts";',
    "type A = 1;\nexport { type A };",
    `// export { type HelloMessage } from ${CONTROLLER};`,
    `/* export { type HelloMessage } from ${CONTROLLER}; */`,
  ])("accepts %s", text => {
    expect(check(text)).toEqual([]);
  });

  it("names the file and the module", () => {
    expect(check(`export { type Pick } from ${CONTROLLER};`)).toEqual([
      `${GAME}: \`export { type ... } from "@intraverse/se-client-shell/controller"\` re-exports only types; write \`export type { ... }\``,
    ]);
  });

  it("holds for the repository", () => {
    const root = join(import.meta.dirname, "..");
    const paths = findFiles(root, isScanned);
    expect(paths.length).toBeGreaterThan(0);
    expect(
      findInlineTypeReExports(
        new Map(paths.map(path => [path, readText(root, path)])),
      ),
    ).toEqual([]);
  });
});
