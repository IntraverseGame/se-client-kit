import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONTRACTS_FILES,
  findDistFilesProblems,
  findManifestFilesProblems,
  selectsPath,
  type LibraryManifest,
} from "./package-files.ts";

const root = join(import.meta.dirname, "..");

const libraries: LibraryManifest[] = readdirSync(join(root, "packages")).map(
  name =>
    Object.assign(
      JSON.parse(
        readFileSync(join(root, "packages", name, "package.json"), "utf8"),
      ) as Omit<LibraryManifest, "name">,
      { name },
    ),
);

const EXPORTS = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  "./testing": { types: "./dist/testing.d.ts", default: "./dist/testing.js" },
};

const contracts = (files: readonly string[]): LibraryManifest => ({
  name: "contracts",
  files,
  exports: EXPORTS,
});

const dist = (entries: Record<string, string>): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries));

// A contracts build with a chunk shared by both entries (in `runtime/`, where
// the tsdown config puts a chunk of runtime sources only) and a chunk that only
// the test-only entry loads (in `chunks/`).
const BUILT = {
  "index.js": 'import { t as shared } from "./runtime/shared-a1.js";\n',
  "index.js.map": "{}",
  "index.d.ts": 'import { t as Shared } from "./runtime/shared-b2.js";\n',
  "testing.js":
    'import { t as shared } from "./runtime/shared-a1.js";\nconst load = () => import("./chunks/lazy-c3.js");\n',
  "testing.js.map": "{}",
  "testing.d.ts": 'import { t as Shared } from "./runtime/shared-b2.js";\n',
  "runtime/shared-a1.js": "export const t = 1;\n",
  "runtime/shared-a1.js.map": "{}",
  "runtime/shared-b2.d.ts": "type Shared = 1;\n",
  "chunks/lazy-c3.js": "export const lazy = 1;\n",
  "chunks/lazy-c3.js.map": "{}",
};

describe("the files matcher", () => {
  it.each([
    [["dist"], "dist/a/b.js", true],
    [["dist/"], "dist/.hidden", true],
    [["./dist"], "dist/index.js", true],
    [["dist"], "src/index.ts", false],
    [["dist/index.js"], "dist/index.js.map", false],
    [["dist/runtime"], "dist/runtime/x-1.d.ts", true],
    [["**"], ".wireit/a", true],
    [["*.json"], "tsconfig.json", true],
  ])("%j selects %s: %s", (files, path, expected) => {
    expect(selectsPath(files, path)).toBe(expected);
  });
});

describe("every library declares files", () => {
  it("finds the five libraries", () => {
    expect(libraries.map(library => library.name).toSorted()).toEqual([
      "contracts",
      "play-client",
      "shell",
      "signing",
      "snapshot",
    ]);
  });

  it.each(libraries.map(library => [library.name, library] as const))(
    "%s",
    (_name, library) => {
      expect(findManifestFilesProblems(library)).toEqual([]);
    },
  );

  it("restricts contracts to the runtime allow-list", () => {
    expect(
      libraries.find(library => library.name === "contracts")?.files,
    ).toEqual(CONTRACTS_FILES);
  });

  it.each(
    libraries
      .filter(library => library.name !== "contracts")
      .map(library => [library.name, library.files] as const),
  )("restricts %s to dist", (_name, files) => {
    expect(files).toEqual(["dist"]);
  });
});

describe("the manifest check itself", () => {
  it("reports a library without files", () => {
    expect(findManifestFilesProblems({ name: "shell" })).toHaveLength(1);
  });

  it.each([
    [["src"], "src/index.ts"],
    [["**"], ".wireit/0123/cache/state.json"],
    [["*.tsbuildinfo", "dist"], "tsconfig.tsbuildinfo"],
    [["dist", "tsdown.config.ts"], "tsdown.config.ts"],
  ])("reports %j, which selects %s", (files, path) => {
    expect(findManifestFilesProblems({ name: "shell", files })).toContain(
      `shell: files selects ${path}`,
    );
  });

  it("reports a negation and an export target files omits", () => {
    expect(
      findManifestFilesProblems({
        name: "shell",
        files: ["dist/index.d.ts", "!dist/x"],
        exports: { ".": { default: "./dist/index.js" } },
      }),
    ).toEqual([
      "shell: files entry !dist/x is a negation (not allowed)",
      "shell: files omits the export target dist/index.js",
    ]);
  });

  it.each([
    [["dist"]],
    [["dist/**"]],
    [[...CONTRACTS_FILES, "dist/testing.js"]],
  ])("reports contracts files %j, which select the test-only entry", files => {
    expect(
      findManifestFilesProblems(contracts(files)).some(problem =>
        problem.includes("testing"),
      ),
    ).toBe(true);
  });

  it("accepts the contracts allow-list", () => {
    expect(findManifestFilesProblems(contracts(CONTRACTS_FILES))).toEqual([]);
  });
});

describe("the files against a built dist", () => {
  it("accepts the contracts allow-list against a build with shared chunks", () => {
    expect(
      findDistFilesProblems(contracts(CONTRACTS_FILES), dist(BUILT)),
    ).toEqual([]);
  });

  it("reports a runtime chunk files omits (a chunk outside runtime/)", () => {
    expect(
      findDistFilesProblems(
        contracts(["dist/index.js", "dist/index.d.ts"]),
        dist(BUILT),
      ),
    ).toEqual([
      "contracts: dist/index.js.map is loaded by the runtime entry, but files omits it",
      "contracts: dist/runtime/shared-a1.js is loaded by the runtime entry, but files omits it",
      "contracts: dist/runtime/shared-a1.js.map is loaded by the runtime entry, but files omits it",
      "contracts: dist/runtime/shared-b2.d.ts is loaded by the runtime entry, but files omits it",
    ]);
  });

  it("reports a chunk only the test-only entry loads, and the entry itself", () => {
    expect(findDistFilesProblems(contracts(["dist"]), dist(BUILT))).toEqual([
      "contracts: files selects the test-only file dist/testing.js",
      "contracts: files selects the test-only file dist/testing.js.map",
      "contracts: files selects the test-only file dist/testing.d.ts",
      "contracts: files selects dist/chunks/lazy-c3.js, which the runtime entry does not load",
      "contracts: files selects dist/chunks/lazy-c3.js.map, which the runtime entry does not load",
    ]);
  });

  it("reports a test-only chunk that landed in runtime/", () => {
    expect(
      findDistFilesProblems(
        contracts(CONTRACTS_FILES),
        dist({ ...BUILT, "runtime/vectors-d4.js": "export const v = 1;\n" }),
      ),
    ).toEqual([
      "contracts: files selects dist/runtime/vectors-d4.js, which the runtime entry does not load",
    ]);
  });

  it("reports a missing dist and a library chunk files omits", () => {
    expect(
      findDistFilesProblems({ name: "shell", files: ["dist"] }, dist({})),
    ).toHaveLength(1);
    expect(
      findDistFilesProblems(
        { name: "shell", files: ["dist/index.js"] },
        dist({
          "index.js": 'import "./chunk-1.js";\n',
          "chunk-1.js": "export {};\n",
        }),
      ),
    ).toEqual([
      "shell: dist/chunk-1.js is loaded by the runtime entry, but files omits it",
    ]);
  });
});
