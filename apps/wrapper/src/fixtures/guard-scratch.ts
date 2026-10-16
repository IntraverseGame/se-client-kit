// Scratch Vite projects for the guard tests: a fake `contracts` package under
// node_modules, a vectors directory, and the entry modules each case builds.
// `useGuardScratch()` registers the hooks and returns the helpers.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { build, type Rollup } from "vite";
import { afterAll, beforeAll } from "vitest";

import { testOnlyEntryGuard } from "../../test-only-entry-guard.ts";
import { writeAssetFixtures } from "./guard-assets.ts";
import { writeWorkerFixtures } from "./guard-workers.ts";

export const VECTOR = /4,\s*5,\s*6/u;

const STRAY_PREFIXES: ReadonlyArray<readonly [string, string, string]> = [
  ["a double quote in a line comment", '// a " b\n', '"'],
  ["an apostrophe in a line comment", "// don't\n", "'"],
  ["a quote in a regular expression", 'const r = /"/;\nexport { r };\n', '"'],
  ["a quote in a block comment", '/* " */\n', '"'],
  ["a quote in a JSDoc comment", '/** the "thing */\n', '"'],
];
const STRAY_PATHS: ReadonlyArray<readonly [string, string]> = [
  ["a hex escape", "../packages/contracts/src/vec\\x74ors/v.json"],
  ["a /./ segment", "../packages/contracts/src/./vectors/v.json"],
];

/** Entry files that hide a vectors `new URL` path behind a stray quote. */
export const STRAY_QUOTE_CASES: ReadonlyArray<readonly [string, string]> =
  STRAY_PREFIXES.flatMap(([prefixName], prefixIndex) =>
    STRAY_PATHS.map(
      ([pathName], pathIndex) =>
        [
          `${prefixName}, then a new URL with ${pathName}`,
          `src/stray-${String(prefixIndex)}-${String(pathIndex)}.ts`,
        ] as const,
    ),
  );

export type Bundle = (
  entry: string,
  options: {
    guard: boolean;
    mode?: string;
    noWorkerGuard?: boolean;
    workerFormat?: "es" | "iife";
  },
) => Promise<string>;

export const useGuardScratch = (): { bundle: Bundle; root: () => string } => {
  let scratch = "";
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  };

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "se-vite-guard-"));
    const contracts = "node_modules/@intraverse/se-client-contracts";
    write(
      `${contracts}/package.json`,
      JSON.stringify({
        name: "@intraverse/se-client-contracts",
        type: "module",
        exports: {
          ".": "./dist/index.js",
          "./testing": "./dist/testing.js",
        },
      }),
    );
    write(`${contracts}/dist/index.js`, "export const schema = { a: 1 };\n");
    write(`${contracts}/dist/testing.js`, "export const vector = [4, 5, 6];\n");
    write(
      "packages/contracts/src/testing.ts",
      "export const vector = [4, 5, 6];\n",
    );
    write(
      "src/direct.ts",
      'import { vector } from "@intraverse/se-client-contracts/testing";\nconsole.log(vector);\n',
    );
    write(
      "src/helper.ts",
      'export { vector } from "@intraverse/se-client-contracts/testing";\n',
    );
    write(
      "src/transitive.ts",
      'import { vector } from "./helper.ts";\nconsole.log(vector);\n',
    );
    write(
      "src/by-file.ts",
      'import { vector } from "../packages/contracts/src/testing.ts";\nconsole.log(vector);\n',
    );
    write("packages/contracts/src/vectors/v.json", "[4, 5, 6]\n");
    write(
      "packages/contracts/src/vectors/v.ts",
      "export const vector = [4, 5, 6];\n",
    );
    write("Contracts/Dist/Testing.js", "export const vector = [4, 5, 6];\n");
    write(
      "src/vector-json.ts",
      'import vector from "../packages/contracts/src/vectors/v.json";\nconsole.log(vector);\n',
    );
    write(
      "src/vector-ts.ts",
      'import { vector } from "../packages/contracts/src/vectors/v.ts";\nconsole.log(vector);\n',
    );
    write(
      "src/vector-glob.ts",
      'const all = import.meta.glob("../packages/contracts/src/vectors/*.json", { eager: true });\nconsole.log(all);\n',
    );
    write(
      "src/vector-raw.ts",
      'import raw from "../packages/contracts/src/vectors/v.json?raw";\nconsole.log(raw);\n',
    );
    write(
      "src/vector-url.ts",
      'export const url = new URL("../packages/contracts/src/vectors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-dot.ts",
      'export const url = new URL("../packages/contracts/src/./vectors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-updir.ts",
      'export const url = new URL("../packages/contracts/src/x/../vectors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-slashes.ts",
      'export const url = new URL("../packages/contracts//src/vectors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-backslash.ts",
      'export const url = new URL("..\\\\packages\\\\contracts\\\\src\\\\vectors\\\\v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-hex.ts",
      'export const url = new URL("../packages/contracts/src/vec\\x74ors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-unicode.ts",
      'export const url = new URL("../packages/contracts/src/vec\\u{74}ors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-octal.ts",
      'export const url = new URL("../packages/contracts/src/vec\\164ors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-continuation.ts",
      'export const url = new URL("../packages/contracts/src/vec\\\ntors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/url-malformed.ts",
      'export const url = new URL("../packages/contracts/src/vec\\xZZtors/v.json", import.meta.url).href;\n',
    );
    write(
      "src/escapes-ok.ts",
      'export const label = "line\\nbreak \\x41 \\u{1F600}";\nexport const other = new URL("./asset.png", import.meta.url).href;\n',
    );
    STRAY_PREFIXES.forEach(([, prefix, quote], prefixIndex) => {
      STRAY_PATHS.forEach(([, path], pathIndex) => {
        write(
          `src/stray-${String(prefixIndex)}-${String(pathIndex)}.ts`,
          `${prefix}export const url = new URL(${quote}${path}${quote}, import.meta.url).href;\n`,
        );
      });
    });
    write("src/asset.png", "png");
    writeWorkerFixtures(write);
    writeAssetFixtures(write);
    write(
      "src/mixed-case.ts",
      'import { vector } from "../Contracts/Dist/Testing.js";\nconsole.log(vector);\n',
    );
    write(
      "src/clean.ts",
      'import { schema } from "@intraverse/se-client-contracts";\nconsole.log(schema);\n',
    );
  });

  afterAll(() => {
    if (scratch !== "") rmSync(scratch, { recursive: true, force: true });
  });

  const bundle = async (
    entry: string,
    options: {
      guard: boolean;
      mode?: string;
      noWorkerGuard?: boolean;
      workerFormat?: "es" | "iife";
    },
  ): Promise<string> => {
    const result = await build({
      root: scratch,
      configFile: false,
      logLevel: "silent",
      mode: options.mode ?? "production",
      plugins: options.guard ? [testOnlyEntryGuard()] : [],
      worker: {
        format: options.workerFormat ?? "iife",
        plugins: () =>
          options.guard && !options.noWorkerGuard ? [testOnlyEntryGuard()] : [],
      },
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: join(scratch, entry) },
      },
    });
    const outputs = (
      Array.isArray(result) ? result : [result]
    ) as Rollup.RollupOutput[];
    return outputs
      .flatMap(output => output.output)
      .map(file => (file.type === "chunk" ? file.code : ""))
      .join("\n");
  };

  return { bundle, root: () => scratch };
};
