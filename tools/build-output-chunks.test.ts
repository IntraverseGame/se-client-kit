import { describe, expect, it } from "vitest";

import { findBuildOutputProblems } from "./build-output.ts";
import { contracts, map } from "./fixtures/build-output-fixtures.ts";

// What the `contracts` runtime-entry check does with chunks it cannot verify:
// a chunk with code and no usable source map fails closed.

describe("contracts runtime chunks that cannot be verified", () => {
  it("fails a map-less chunk with an exported constant", () => {
    const problems = findBuildOutputProblems([
      contracts({
        "index.js": 'export * from "./data-BBBB.js";\n',
        "data-BBBB.js": "export const v=[4,5,6];\n",
      }),
    ]);
    expect(problems).toEqual([
      "contracts/dist/data-BBBB.js: has code but no source map to verify it",
    ]);
  });

  it.each([
    "export const v = 1;",
    "export function f() {}",
    "export default 1;",
    "export class C {}",
    "export { v };",
    "const v = 1;",
  ])("treats %s in a map-less runtime entry as code", line => {
    const problems = findBuildOutputProblems([
      contracts({ "index.js": `${line}\n` }),
    ]);
    expect(problems).toEqual([
      "contracts/dist/index.js: has code but no source map to verify it",
    ]);
  });

  it.each([
    'export * from "./schema-AAAA.js";',
    'export * as ns from "./schema-AAAA.js";',
    'export { t as schema } from "./schema-AAAA.js";',
    'import "./schema-AAAA.js";',
    'import { t } from "./schema-AAAA.js";',
    "// a comment",
    "// a line comment that mentions /* a block start",
    "",
  ])("accepts %s in a map-less chunk", line => {
    expect(
      findBuildOutputProblems([contracts({ "index.js": `${line}\n` })]),
    ).toEqual([]);
  });

  it.each([
    [
      "code hidden between a `/*` in a line comment and a closing comment",
      "// note /*\nexport const secret = [4, 5, 6];\n/* */\n",
    ],
    ["a block comment, which is not recognized", "/* a block\ncomment */\n"],
    [
      "a `/*` after code on the same line",
      "const a = 1; /* x\nexport const secret = [4, 5, 6];\n*/\n",
    ],
    [
      "a `/*` inside a string",
      'const s = "/*";\nexport const secret = [4, 5, 6];\nconst t = "*/";\n',
    ],
    [
      "a `/*` inside a template literal",
      "const s = `/*`;\nexport const secret = [4, 5, 6];\nconst t = `*/`;\n",
    ],
  ])("fails a map-less chunk with %s", (_name, code) => {
    const problems = findBuildOutputProblems([contracts({ "index.js": code })]);
    expect(problems).toEqual([
      "contracts/dist/index.js: has code but no source map to verify it",
    ]);
  });

  it("fails a source map with an empty sources list", () => {
    const problems = findBuildOutputProblems([
      contracts({ "schema-AAAA.js.map": map() }),
    ]);
    expect(problems).toEqual([
      "contracts/dist/schema-AAAA.js: has code but its source map lists no source",
    ]);
  });

  it("fails a source map without a sources key", () => {
    const problems = findBuildOutputProblems([
      contracts({ "schema-AAAA.js.map": JSON.stringify({ version: 3 }) }),
    ]);
    expect(problems).toHaveLength(1);
  });

  it("fails a source map with a sourceRoot (it is not resolved)", () => {
    const withRoot = JSON.stringify({
      version: 3,
      sourceRoot: "../vectors",
      sources: ["../src/schemas/schema.ts"],
    });
    const problems = findBuildOutputProblems([
      contracts({ "schema-AAAA.js.map": withRoot }),
    ]);
    expect(problems).toEqual([
      "contracts/dist/schema-AAAA.js: its source map has a sourceRoot, which the check does not resolve",
    ]);
  });

  it("accepts an empty or dot sourceRoot", () => {
    for (const sourceRoot of ["", "."]) {
      const body = JSON.stringify({
        version: 3,
        sourceRoot,
        sources: ["../src/schemas/schema.ts"],
      });
      expect(
        findBuildOutputProblems([contracts({ "schema-AAAA.js.map": body })]),
      ).toEqual([]);
    }
  });

  it("fails a source that climbs above the package root (not clamped)", () => {
    const problems = findBuildOutputProblems([
      contracts({ "schema-AAAA.js.map": map("../../../src/index.ts") }),
    ]);
    expect(problems).toEqual([
      "contracts/dist/schema-AAAA.js: a source (../../../src/index.ts) lies outside the package",
    ]);
  });

  it("fails a map that is not valid JSON", () => {
    expect(
      findBuildOutputProblems([contracts({ "schema-AAAA.js.map": "{" })]),
    ).toHaveLength(1);
  });

  it.each([
    "@intraverse/se-client-contracts/testing",
    "@intraverse/se-client-contracts/vectors",
  ])("fails a bare self-import of %s in a runtime chunk", specifier => {
    const problems = findBuildOutputProblems([
      contracts({ "index.js": `export * from "${specifier}";\n` }),
    ]);
    expect(problems).toEqual([
      "contracts/dist/index.js: imports a contracts subpath by name (only the runtime entry may be loaded)",
    ]);
  });

  it("accepts a bare import of the runtime entry itself", () => {
    const files = {
      "index.js": 'export * from "@intraverse/se-client-contracts";\n',
    };
    expect(findBuildOutputProblems([contracts(files)])).toEqual([]);
  });
});
