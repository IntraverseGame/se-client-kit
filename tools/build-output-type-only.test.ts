import { describe, expect, it } from "vitest";

import {
  findTypeOnlyProblems,
  typeOnlySubpaths,
  type TypeOnlyPackage,
} from "./build-output-type-only.ts";

// What tsdown emits for shell's type-only `controller` entry: an empty module
// and a declaration file that re-exports types from a shared declaration chunk.
const CONTROLLER_DECLARATION =
  'import { a as GameStep, t as ActionMessage } from "./controller-protocol-AAAA.js";\n' +
  "export type { ActionMessage, GameStep };";

const SHELL_EXPORTS = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  "./controller": { types: "./dist/controller.d.ts" },
};

const shell = (
  overrides: Record<string, string | undefined> = {},
  exportsField: unknown = SHELL_EXPORTS,
): TypeOnlyPackage => {
  const files = new Map<string, string>([
    ["index.js", "export const a = 1;\n"],
    ["index.js.map", "{}"],
    ["index.d.ts", "export declare const a = 1;\n"],
    ["controller.js", ""],
    ["controller.d.ts", CONTROLLER_DECLARATION],
    ["controller-protocol-AAAA.d.ts", "type A = 1;\nexport { A as a };\n"],
  ]);
  for (const [path, text] of Object.entries(overrides)) {
    if (text === undefined) files.delete(path);
    else files.set(path, text);
  }
  return { name: "shell", files, exportsField };
};

const game = (files: Record<string, string>): TypeOnlyPackage => ({
  name: "reference-game",
  files: new Map(Object.entries(files)),
  exportsField: undefined,
});

describe("typeOnlySubpaths", () => {
  it("finds the subpaths with a types condition and nothing else", () => {
    expect([...typeOnlySubpaths(SHELL_EXPORTS)]).toEqual([
      ["./controller", "./dist/controller.d.ts"],
    ]);
  });

  it.each([
    ["no exports", undefined],
    ["a string", "./dist/index.js"],
    [
      "a default condition beside types",
      { "./c": { types: "a", default: "b" } },
    ],
    [
      "an import condition beside types",
      { "./c": { types: "a", import: "b" } },
    ],
    ["a non-string target", { "./c": { types: ["a"] } }],
  ])("finds none for %s", (_name, exportsField) => {
    expect(typeOnlySubpaths(exportsField).size).toBe(0);
  });
});

describe("the type-only subpath", () => {
  it("accepts what tsdown emits for shell's controller entry", () => {
    expect(findTypeOnlyProblems([shell()])).toEqual([]);
  });

  it("accepts a module of comments or an empty export, or no module", () => {
    for (const text of ["//#region\n\n", "export {};\n"]) {
      expect(findTypeOnlyProblems([shell({ "controller.js": text })])).toEqual(
        [],
      );
    }
    expect(
      findTypeOnlyProblems([shell({ "controller.js": undefined })]),
    ).toEqual([]);
  });

  it("fails when shell does not declare ./controller type-only", () => {
    const withDefault = {
      ...SHELL_EXPORTS,
      "./controller": {
        types: "./dist/controller.d.ts",
        default: "./dist/controller.js",
      },
    };
    expect(findTypeOnlyProblems([shell({}, withDefault)])).toEqual([
      "shell: exports ./controller must be type-only (a `types` condition and nothing else)",
    ]);
    expect(
      findTypeOnlyProblems([shell({}, { ".": SHELL_EXPORTS["."] })]),
    ).toHaveLength(1);
  });

  it.each([
    ["a value", "const a = 1;\nexport { a };\n"],
    ["a re-export", 'export * from "./controller-protocol-AAAA.js";\n'],
    ["a side-effect import", 'import "./x.js";\n'],
  ])("fails when the module holds %s", (_name, text) => {
    const problems = findTypeOnlyProblems([shell({ "controller.js": text })]);
    expect(problems).toEqual([
      "shell ./controller: controller.js has runtime code; a type-only subpath emits an empty module",
    ]);
  });

  it("fails when the module has a source map", () => {
    expect(
      findTypeOnlyProblems([shell({ "controller.js.map": "{}" })]),
    ).toEqual([
      "shell ./controller: controller.js has a source map, so it has runtime code",
    ]);
  });

  it.each([
    ["a value re-export", 'export { a } from "./controller-protocol-AAAA.js";'],
    ["a star re-export", 'export * from "./controller-protocol-AAAA.js";'],
    ["a value declaration", "export declare const CONTROLLER_SCHEMA = 1;"],
    ["a function", "export declare const f: () => void;"],
    ["a bare import", 'import { A } from "@intraverse/se-client-snapshot";'],
    ["a side-effect import", 'import "@intraverse/se-client-snapshot";'],
    ["a local export", "type A = 1;\nexport { A };"],
  ])("fails when the declaration holds %s", (_name, statement) => {
    const text = `${CONTROLLER_DECLARATION}\n${statement}\n`;
    const problems = findTypeOnlyProblems([shell({ "controller.d.ts": text })]);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problem).toContain("holds more than type re-exports");
    }
  });

  it("fails on a block comment, which could hide a statement", () => {
    const text = `${CONTROLLER_DECLARATION}\n/* export { a }; */\n`;
    expect(findTypeOnlyProblems([shell({ "controller.d.ts": text })])).toEqual([
      "shell ./controller: controller.d.ts has a block comment, which could hide a statement",
    ]);
  });

  it("fails when the declaration is missing or not under dist", () => {
    expect(
      findTypeOnlyProblems([shell({ "controller.d.ts": undefined })]),
    ).toEqual(["shell ./controller: controller.d.ts is missing"]);
    const outside = { "./controller": { types: "./src/controller.ts" } };
    expect(findTypeOnlyProblems([shell({}, outside)])).toContain(
      "shell ./controller: its types target ./src/controller.ts is not a ./dist/*.d.ts file",
    );
  });
});

describe("the game bundle", () => {
  it("accepts relative and root-relative imports", () => {
    expect(
      findTypeOnlyProblems([
        game({
          "assets/index-AAAA.js":
            'import { a } from "./chunk-BBBB.js";\nimport "/assets/c.js";\nconst m = import("./d.js");',
        }),
      ]),
    ).toEqual([]);
  });

  it.each([
    ['import { a } from "vite";', "vite"],
    ['import "jsdom";', "jsdom"],
    ['const m = import("lodash/fp");', "lodash/fp"],
    ["export { a } from 'node:fs';", "node:fs"],
  ])("fails on a package import left in the bundle: %s", (code, specifier) => {
    expect(
      findTypeOnlyProblems([game({ "assets/index-AAAA.js": code })]),
    ).toEqual([
      `reference-game/dist/assets/index-AAAA.js: imports the package ${specifier}; the game depends on no package at run time`,
    ]);
  });

  it("accepts a bundle that names no kit package", () => {
    expect(
      findTypeOnlyProblems([
        game({
          "index.html": "<!doctype html>",
          "assets/index-AAAA.js": 'const s = "se.controller/1";',
        }),
      ]),
    ).toEqual([]);
  });

  it("fails on a bundle that names one", () => {
    expect(
      findTypeOnlyProblems([
        game({
          "assets/index-AAAA.js": 'const s = "@intraverse/se-client-shell";',
        }),
      ]),
    ).toEqual([
      "reference-game/dist/assets/index-AAAA.js: names a kit package; the game takes only the controller types, which leave no trace in its bundle",
    ]);
  });
});
