import { describe, expect, it } from "vitest";

import { findBuildOutputProblems, reachableFrom } from "./build-output.ts";
import {
  cleanContracts,
  contracts,
  dist,
  map,
} from "./fixtures/build-output-fixtures.ts";

describe("contracts runtime entry", () => {
  it("accepts a clean build with two entries", () => {
    expect(findBuildOutputProblems([contracts()])).toEqual([]);
  });

  it("accepts the generated-types directory and the entry file", () => {
    const files = {
      "schema-AAAA.js.map": map(
        "../src/schemas/a.json",
        "../src/generated/t.ts",
        "../src/index.ts",
      ),
    };
    expect(findBuildOutputProblems([contracts(files)])).toEqual([]);
  });

  it("fails when the runtime entry loads the test-only entry", () => {
    const files = { "index.js": 'export * from "./testing.js";\n' };
    expect(findBuildOutputProblems([contracts(files)]).length).toBeGreaterThan(
      0,
    );
  });

  it.each([
    ["a vectors directory", "../src/vectors/v.ts"],
    ["the test-only entry source", "../src/testing.ts"],
    ["a shared data module", "../src/data/signing.ts"],
    ["a snapshot-vectors directory", "../src/snapshot-vectors/a.json"],
    ["a valid/ directory", "../src/valid/a.json"],
    ["an invalid/ directory", "../src/invalid/a.json"],
    ["a test directory", "../test/vectors/signing.json"],
    ["a module in src but outside the runtime set", "../src/helpers.ts"],
  ])("fails when a runtime chunk contains %s", (_name, source) => {
    const files = {
      "schema-AAAA.js.map": map("../src/schemas/schema.ts", source),
    };
    const problems = findBuildOutputProblems([contracts(files)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("outside the runtime sources");
  });

  it("fails on a shared chunk both entries import, even when it is only data", () => {
    const files = {
      "index.js": 'export { d } from "./data-BBBB.js";\n',
      "data-BBBB.js": "const d = [1, 2, 3];\nexport { d };\n",
      "data-BBBB.js.map": map("../src/data/signing.ts"),
      "testing.js":
        'import { d } from "./data-BBBB.js";\nexport const vector = d;\n',
    };
    const problems = findBuildOutputProblems([contracts(files)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("src/data/signing.ts");
  });

  it("fails on a reachable chunk that has code but no source map", () => {
    const files = {
      "index.js": 'export { d } from "./data-BBBB.js";\n',
      "data-BBBB.js": "const d = [1, 2, 3];\nexport { d };\n",
    };
    const problems = findBuildOutputProblems([contracts(files)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("no source map");
  });

  it("accepts a re-export chunk without a source map", () => {
    const files = { "index.js": 'export * from "./schema-AAAA.js";\n' };
    expect(findBuildOutputProblems([contracts(files)])).toEqual([]);
  });

  it("follows dynamic imports and nested chunks", () => {
    const files = {
      "index.js": 'export const load = () => import("./a.js");\n',
      "a.js": 'export * from "./sub/b.js";\n',
      "sub/b.js": 'export * from "../testing.js";\n',
    };
    expect(findBuildOutputProblems([contracts(files)]).length).toBeGreaterThan(
      0,
    );
    const reached = reachableFrom(
      "index.js",
      new Map(Object.entries({ ...cleanContracts(), ...files })),
    );
    expect([...reached].toSorted()).toEqual([
      "a.js",
      "index.js",
      "schema-AAAA.js",
      "sub/b.js",
      "testing.js",
    ]);
  });

  it("follows a template-literal import without a substitution, not a computed one", () => {
    const files = new Map(
      Object.entries({
        "index.js":
          "export const a = () => import(`./a.js`);\nexport const b = (n) => import(`./${n}.js`);\n",
        "a.js": "export const x = 1;\n",
        "b.js": "export const y = 1;\n",
      }),
    );
    expect([...reachableFrom("index.js", files)].toSorted()).toEqual([
      "a.js",
      "index.js",
    ]);
  });

  it("fails when the runtime declarations load the test-only declarations", () => {
    const files = { "index.d.ts": 'export * from "./testing.js";\n' };
    expect(
      findBuildOutputProblems([
        contracts({ ...files, "testing.d.ts": "export {};\n" }),
      ]).length,
    ).toBeGreaterThan(0);
  });
});

describe("export targets", () => {
  it("fails when the runtime entry is missing (an empty dist)", () => {
    const problems = findBuildOutputProblems([
      dist("shell", {}, ["./dist/index.d.ts", "./dist/index.js"]),
    ]);
    expect(problems).toEqual([
      "shell: export target ./dist/index.d.ts does not exist",
      "shell: export target ./dist/index.js does not exist",
    ]);
  });

  it("fails when an entry was renamed", () => {
    const files = { "main.js": "export {};\n", "main.d.ts": "export {};\n" };
    const problems = findBuildOutputProblems([
      dist("shell", files, ["./dist/index.d.ts", "./dist/index.js"]),
    ]);
    expect(problems).toHaveLength(2);
  });

  it("fails when the types target is missing but the JavaScript exists", () => {
    const problems = findBuildOutputProblems([
      dist("shell", { "index.js": "export {};\n" }, [
        "./dist/index.d.ts",
        "./dist/index.js",
      ]),
    ]);
    expect(problems).toEqual([
      "shell: export target ./dist/index.d.ts does not exist",
    ]);
  });

  it("fails on a target outside dist", () => {
    const problems = findBuildOutputProblems([
      dist("shell", {}, ["./src/index.ts"]),
    ]);
    expect(problems).toEqual([
      "shell: export target ./src/index.ts is not under ./dist",
    ]);
  });

  it("fails when contracts has no runtime entry", () => {
    const files = cleanContracts();
    const withoutIndex = new Map(Object.entries(files));
    withoutIndex.delete("index.js");
    const problems = findBuildOutputProblems([
      { name: "contracts", files: withoutIndex },
    ]);
    expect(problems).toEqual(["contracts/dist/index.js is missing"]);
  });

  it("accepts a package whose targets all exist", () => {
    const files = { "index.js": "export {};\n", "index.d.ts": "export {};\n" };
    expect(
      findBuildOutputProblems([
        dist("shell", files, ["./dist/index.d.ts", "./dist/index.js"]),
      ]),
    ).toEqual([]);
  });
});

describe("other output", () => {
  it("accepts a clean package and a wrapper bundle", () => {
    const problems = findBuildOutputProblems([
      dist("shell", {
        "index.js": "export {};\n",
        "index.js.map": map("../src/index.ts"),
        "index.d.ts": "",
      }),
      dist("wrapper", {
        "index.html": "<!doctype html>",
        "assets/index-AAAA.js": "console.log(1)",
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it("fails when a package or the bundle mentions the test-only entry", () => {
    const shell = dist("shell", {
      "index.js": 'import "@intraverse/se-client-contracts/testing";\n',
    });
    const wrapper = dist("wrapper", {
      "assets/a.js": 'from "@intraverse/se-client-contracts/testing"',
    });
    expect(findBuildOutputProblems([shell])).toHaveLength(1);
    expect(findBuildOutputProblems([wrapper])).toHaveLength(1);
  });

  it("fails on a declaration map and on a declaration file that points at one", () => {
    const files = {
      "index.js": "export {};\n",
      "index.d.ts": "export {};\n//# sourceMappingURL=index.d.ts.map",
      "index.d.ts.map": "{}",
    };
    expect(findBuildOutputProblems([dist("shell", files)])).toHaveLength(2);
  });

  it("fails on test files, build state, and unintended files in a package dist", () => {
    const files = {
      "index.js": "export {};\n",
      "index.test.js": "",
      ".tsbuildinfo": "{}",
      "notes.txt": "",
    };
    expect(findBuildOutputProblems([dist("shell", files)])).toHaveLength(3);
  });
});
