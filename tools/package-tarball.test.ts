import { describe, expect, it } from "vitest";

import type { Vector } from "./build-output-canary.ts";
import {
  findTarballProblems,
  LIFECYCLE_SCRIPTS,
  type PackedPackage,
} from "./package-tarball.ts";
import { readTar, writeTar } from "./tar.ts";

// The tarball content check against synthetic tarballs, written with the same
// tar module the check reads them with.

const EXPORTS = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
};

const CONTRACTS_EXPORTS = {
  ...EXPORTS,
  "./testing": { types: "./dist/testing.d.ts", default: "./dist/testing.js" },
};

const manifest = (
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: `@intraverse/se-client-${name}`,
  version: "1.2.3",
  files: ["dist"],
  exports: EXPORTS,
  scripts: { build: "wireit" },
  ...extra,
});

const map = (source: string): string =>
  JSON.stringify({ version: 3, sources: [source], mappings: "" });

const DIST: Readonly<Record<string, string>> = {
  "dist/index.js": "export const x = 1;\n//# sourceMappingURL=index.js.map\n",
  "dist/index.js.map": map("../src/index.ts"),
  "dist/index.d.ts": "export declare const x = 1;\n",
};

const packed = (
  name: string,
  contents: Readonly<Record<string, string>>,
): PackedPackage => ({
  name,
  version: "1.2.3",
  entries: readTar(
    writeTar(
      new Map(
        Object.entries(contents).map(([path, text]) => [
          `package/${path}`,
          Buffer.from(text),
        ]),
      ),
    ),
  ),
});

const library = (
  name: string,
  overrides: Readonly<Record<string, string | undefined>> = {},
  manifestExtra: Record<string, unknown> = {},
): PackedPackage => {
  const contents: Record<string, string> = {
    "package.json": JSON.stringify(manifest(name, manifestExtra)),
    "README.md": "# readme\n",
    LICENSE: "MIT\n",
    ...DIST,
  };
  for (const [path, text] of Object.entries(overrides)) {
    if (text === undefined) Reflect.deleteProperty(contents, path);
    else contents[path] = text;
  }
  return packed(name, contents);
};

const contracts = (
  overrides: Readonly<Record<string, string | undefined>> = {},
): PackedPackage =>
  library("contracts", overrides, {
    files: [
      "dist/index.js",
      "dist/index.js.map",
      "dist/index.d.ts",
      "dist/runtime",
    ],
    exports: CONTRACTS_EXPORTS,
  });

const VECTOR = JSON.stringify({
  cases: [{ id: 1, expected: "0xaaaa", note: "a synthetic vector case" }],
});

const vectors: Vector[] = [
  {
    path: "packages/contracts/src/vectors/v.json",
    bytes: Buffer.from(VECTOR),
    minimumBytes: 1,
  },
];

describe("findTarballProblems", () => {
  it("accepts a library with its manifest, README, LICENSE, and dist", () => {
    expect(findTarballProblems(library("shell"), vectors)).toEqual([]);
  });

  it("accepts contracts without its test-only entry", () => {
    expect(findTarballProblems(contracts(), vectors)).toEqual([]);
  });

  it.each(["README.md", "LICENSE", "package.json"])("requires %s", required => {
    expect(
      findTarballProblems(library("shell", { [required]: undefined }), vectors),
    ).toContain(`shell: ${required} is missing`);
  });

  it("refuses a file outside dist", () => {
    expect(
      findTarballProblems(library("shell", { "src/index.ts": "x" }), vectors),
    ).toContain("shell: src/index.ts is packed but is not under dist/");
  });

  it("refuses a dist file the files field does not select", () => {
    expect(
      findTarballProblems(
        contracts({
          "dist/chunks/lazy.js": "export const y = 2;\n",
        }),
        vectors,
      ),
    ).toContain(
      "contracts: dist/chunks/lazy.js is packed but files does not select it",
    );
  });

  it("refuses the contracts test-only entry and any vector path", () => {
    const problems = findTarballProblems(
      contracts({
        "dist/testing.js": "export const v = 1;\n",
        "dist/runtime/vectors-a.js": "export const v = 1;\n",
      }),
      vectors,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "contracts: the test-only export target ./dist/testing.js is packed",
        "contracts: dist/testing.js is packed (test-only entry or vectors)",
        "contracts: dist/runtime/vectors-a.js is packed (test-only entry or vectors)",
      ]),
    );
  });

  it("refuses a missing export target", () => {
    expect(
      findTarballProblems(
        library("shell", { "dist/index.d.ts": undefined }),
        vectors,
      ),
    ).toContain(
      "tarball shell: export target ./dist/index.d.ts does not exist",
    );
  });

  it("refuses a contracts runtime chunk built from a non-runtime source", () => {
    expect(
      findTarballProblems(
        contracts({ "dist/index.js.map": map("../src/vectors/catalog.ts") }),
        vectors,
      ).join("\n"),
    ).toMatch(/outside the runtime sources/u);
  });

  it("refuses a vector's content anywhere in the tarball", () => {
    expect(
      findTarballProblems(
        library("shell", { "dist/index.js": `export const v = ${VECTOR};\n` }),
        vectors,
      ),
    ).toContain(
      "shell tarball: dist/index.js: contains the content of the vector file packages/contracts/src/vectors/v.json",
    );
  });

  it("refuses an entry that is not a regular file", () => {
    const pkg = library("shell");
    const link: PackedPackage = {
      ...pkg,
      entries: [
        ...pkg.entries,
        {
          path: "package/dist/x.js",
          type: "other",
          flag: "2",
          bytes: Buffer.alloc(0),
        },
      ],
    };
    expect(findTarballProblems(link, vectors)).toContain(
      'shell: package/dist/x.js is not a regular file (tar type "2")',
    );
  });

  it("refuses a path outside package/", () => {
    const pkg = library("shell");
    const stray: PackedPackage = {
      ...pkg,
      entries: [
        ...pkg.entries,
        { path: "other/x.js", type: "file", flag: "0", bytes: Buffer.alloc(0) },
      ],
    };
    expect(findTarballProblems(stray, vectors)).toContain(
      "shell: other/x.js is not a path under package/",
    );
  });

  it("refuses the wrong name or version", () => {
    const problems = findTarballProblems(
      library("shell", {}, { name: "@other/shell", version: "9.9.9" }),
      vectors,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "shell: package.json names @other/shell, not @intraverse/se-client-shell",
        "shell: package.json has version 9.9.9, not 1.2.3",
      ]),
    );
  });

  it.each([
    ["workspace:*"],
    ["catalog:"],
    ["^1.0.0"],
    ["latest"],
    ["file:../x"],
  ])("refuses the dependency specifier %s", specifier => {
    expect(
      findTarballProblems(
        library("shell", {}, { dependencies: { "@noble/hashes": specifier } }),
        vectors,
      ),
    ).toContain(
      `shell: package.json dependencies @noble/hashes is ${JSON.stringify(specifier)}, not an exact version`,
    );
  });

  it("accepts exact dependency versions", () => {
    expect(
      findTarballProblems(
        library(
          "shell",
          {},
          {
            dependencies: {
              "@intraverse/se-client-signing": "1.2.3",
              "@noble/hashes": "2.4.0",
            },
          },
        ),
        vectors,
      ),
    ).toEqual([]);
  });

  it.each(LIFECYCLE_SCRIPTS)("refuses the lifecycle script %s", script => {
    expect(
      findTarballProblems(
        library("shell", {}, { scripts: { [script]: "node x.js" } }),
        vectors,
      ),
    ).toContain(`shell: package.json has the lifecycle script ${script}`);
  });
});
