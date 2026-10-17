import { describe, expect, it } from "vitest";

import {
  importSpecifiers,
  missingDeclarations,
  typeOnlyEntries,
} from "./release-consumer.ts";

const ENTRY = { types: "./dist/index.d.ts", default: "./dist/index.js" };
const TYPES_ONLY = { types: "./dist/controller.d.ts" };

describe("importSpecifiers", () => {
  it("imports every exports key", () => {
    expect(
      importSpecifiers("@intraverse/se-client-shell", {
        ".": ENTRY,
        "./controller": ENTRY,
      }),
    ).toEqual({
      specifiers: [
        "@intraverse/se-client-shell",
        "@intraverse/se-client-shell/controller",
      ],
      problems: [],
    });
  });

  it("leaves out the contracts test-only entry", () => {
    expect(
      importSpecifiers("@intraverse/se-client-contracts", {
        ".": ENTRY,
        "./testing": ENTRY,
      }).specifiers,
    ).toEqual(["@intraverse/se-client-contracts"]);
  });

  it("keeps a ./testing key of another package", () => {
    expect(
      importSpecifiers("@intraverse/se-client-shell", {
        ".": ENTRY,
        "./testing": ENTRY,
      }).specifiers,
    ).toEqual([
      "@intraverse/se-client-shell",
      "@intraverse/se-client-shell/testing",
    ]);
  });

  it("imports the package name for a conditions-only or string exports", () => {
    expect(importSpecifiers("p", ENTRY).specifiers).toEqual(["p"]);
    expect(importSpecifiers("p", "./dist/index.js").specifiers).toEqual(["p"]);
  });

  it("reports a subpath pattern it cannot import", () => {
    expect(importSpecifiers("p", { ".": ENTRY, "./*": ENTRY })).toEqual({
      specifiers: ["p"],
      problems: ["p: the exports pattern ./* is not checked"],
    });
  });

  it("leaves out a types-only entry", () => {
    expect(
      importSpecifiers("@intraverse/se-client-shell", {
        ".": ENTRY,
        "./controller": TYPES_ONLY,
      }),
    ).toEqual({ specifiers: ["@intraverse/se-client-shell"], problems: [] });
  });
});

describe("typeOnlyEntries", () => {
  it("classifies an entry whose only condition is types as type-only", () => {
    expect(
      typeOnlyEntries("@intraverse/se-client-shell", {
        ".": ENTRY,
        "./controller": TYPES_ONLY,
      }),
    ).toEqual({
      entries: [
        {
          specifier: "@intraverse/se-client-shell/controller",
          types: "./dist/controller.d.ts",
        },
      ],
      problems: [],
    });
  });

  it("keeps a mixed entry a runtime one", () => {
    const exports = {
      ".": ENTRY,
      "./controller": { types: "./dist/controller.d.ts", import: "./x.js" },
    };
    expect(typeOnlyEntries("p", exports)).toEqual({
      entries: [],
      problems: [],
    });
    expect(importSpecifiers("p", exports).specifiers).toEqual([
      "p",
      "p/controller",
    ]);
  });

  it("classifies a conditions-only types exports as the package name", () => {
    expect(typeOnlyEntries("p", TYPES_ONLY).entries).toEqual([
      { specifier: "p", types: "./dist/controller.d.ts" },
    ]);
    expect(importSpecifiers("p", TYPES_ONLY).specifiers).toEqual([]);
  });

  it.each([
    ["a JavaScript file", "./dist/controller.js"],
    ["a TypeScript source", "./src/controller.ts"],
    ["an ES module declaration file", "./dist/controller.d.mts"],
    ["a CommonJS declaration file", "./dist/controller.d.cts"],
    ["a path without ./", "dist/controller.d.ts"],
    ["a path outside the package", "./../shell/dist/controller.d.ts"],
    ["a nested condition", { import: "./dist/controller.d.ts" }],
    ["null", null],
  ])("reports a types target that is %s", (_, types) => {
    expect(typeOnlyEntries("p", { "./controller": { types } })).toEqual({
      entries: [],
      problems: [
        `p: the type-only exports entry ./controller does not name a declaration file in the package (${JSON.stringify(types)})`,
      ],
    });
  });

  it("leaves out the contracts test-only entry and subpath patterns", () => {
    expect(
      typeOnlyEntries("@intraverse/se-client-contracts", {
        "./testing": { types: "./dist/testing.d.ts" },
        "./*": { types: "./dist/*.d.ts" },
      }),
    ).toEqual({ entries: [], problems: [] });
  });
});

const CONTROLLER = {
  specifier: "@intraverse/se-client-shell/controller",
  types: "./dist/controller.d.ts",
};

describe("missingDeclarations", () => {
  it("passes when the declaration file is in the tarball", () => {
    expect(
      missingDeclarations(
        [CONTROLLER],
        ["package.json", "dist/index.js", "dist/controller.d.ts"],
      ),
    ).toEqual([]);
  });

  it("reports a declaration file missing from the tarball", () => {
    expect(
      missingDeclarations([CONTROLLER], ["package.json", "dist/controller.js"]),
    ).toEqual([
      "@intraverse/se-client-shell/controller: the type-only entry's declaration file ./dist/controller.d.ts is not in the tarball",
    ]);
  });
});
