import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { build } from "tsdown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base } from "../tsdown.base.ts";

// Proof of the bundling rule (specs/client-kit/supply-chain.md): a package's
// own source is the only thing in its dist; nothing from node_modules is ever
// bundled. A kit package stays an import even when it is a devDependency, a
// `dependencies` entry stays an import, and any other package (a devDependency
// or one that is not declared at all) fails the build. tsdown would otherwise
// inline them, copying another package, an undeclared dependency, or the
// contracts vectors into this one. Each case builds a scratch package with the
// repository's real tsdown base configuration.

const scratchState = { path: "" };

const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(scratchState.path, path)), { recursive: true });
  writeFileSync(join(scratchState.path, path), text);
};

const installPackage = (name: string, code: string): void => {
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, type: "module", exports: { ".": "./index.js" } }),
  );
  write(`node_modules/${name}/index.js`, code);
};

beforeAll(() => {
  scratchState.path = mkdtempSync(join(tmpdir(), "se-tsdown-bundling-"));
  write(
    "package.json",
    JSON.stringify({
      name: "fixture",
      type: "module",
      dependencies: { "runtime-lib": "1.0.0" },
      devDependencies: {
        "@intraverse/se-client-contracts": "1.0.0",
        "dev-lib": "1.0.0",
      },
    }),
  );
  write(
    "node_modules/@intraverse/se-client-contracts/package.json",
    JSON.stringify({
      name: "@intraverse/se-client-contracts",
      type: "module",
      exports: { "./testing": "./dist/testing.js" },
    }),
  );
  write(
    "node_modules/@intraverse/se-client-contracts/dist/testing.js",
    "export const vector = [4, 5, 6];\n",
  );
  installPackage("runtime-lib", "export const runtime = [7, 8, 9];\n");
  installPackage("dev-lib", "export const dev = [10, 11, 12];\n");
  installPackage("ghost-lib", "export const ghost = [13, 14, 15];\n");
  write(
    "src/own-helper.ts",
    "export const own: readonly number[] = [16, 17, 18];\n",
  );
  write(
    "src/kit.ts",
    'import { vector } from "@intraverse/se-client-contracts/testing";\nexport const v: readonly number[] = vector;\n',
  );
  write(
    "src/runtime.ts",
    'import { runtime } from "runtime-lib";\nexport const r: readonly number[] = runtime;\n',
  );
  write(
    "src/dev.ts",
    'import { dev } from "dev-lib";\nexport const d: readonly number[] = dev;\n',
  );
  write(
    "src/ghost.ts",
    'import { ghost } from "ghost-lib";\nexport const g: readonly number[] = ghost;\n',
  );
  write(
    "src/own.ts",
    'import { own } from "./own-helper.ts";\nexport const o: readonly number[] = own;\n',
  );
});

afterAll(() => {
  if (scratchState.path !== "") {
    rmSync(scratchState.path, { recursive: true, force: true });
  }
});

type Options = typeof base | { deps: { neverBundle: RegExp[] } };

const buildFixture = async (
  entry: string,
  deps: Options["deps"],
): Promise<string> => {
  const outDir = `dist-${entry}-${String(deps.neverBundle.length)}-${String("onlyBundle" in deps)}`;
  await build({
    ...base,
    deps,
    config: false,
    cwd: scratchState.path,
    entry: { index: `src/${entry}.ts` },
    outDir,
    dts: false,
    sourcemap: false,
    logLevel: "silent",
  });
  return readFileSync(join(scratchState.path, outDir, "index.js"), "utf8");
};

// The rule as configured, and the same rule without `onlyBundle` (the state
// before the fix, where only the kit scope was kept out).
const withRule = base.deps;
const withoutOnlyBundle = { neverBundle: base.deps.neverBundle };

describe("tsdown bundling", () => {
  it("keeps a kit package, even a devDependency, as an import", async () => {
    const output = await buildFixture("kit", withRule);
    expect(output).toContain("@intraverse/se-client-contracts/testing");
    expect(output).not.toMatch(/4,\s*5,\s*6/u);
  });

  it("keeps a declared dependency as an import", async () => {
    const output = await buildFixture("runtime", withRule);
    expect(output).toContain('from "runtime-lib"');
    expect(output).not.toMatch(/7,\s*8,\s*9/u);
  });

  it("bundles the package's own source", async () => {
    const output = await buildFixture("own", withRule);
    expect(output).toMatch(/16,\s*17,\s*18/u);
  });

  it("fails the build for a devDependency that is not a kit package", async () => {
    await expect(buildFixture("dev", withRule)).rejects.toThrow(/onlyBundle/u);
  });

  it("fails the build for a package that is not declared at all", async () => {
    await expect(buildFixture("ghost", withRule)).rejects.toThrow(
      /onlyBundle/u,
    );
  });

  it("would inline both without onlyBundle (the defect the rule fixes)", async () => {
    const dev = await buildFixture("dev", withoutOnlyBundle);
    const ghost = await buildFixture("ghost", withoutOnlyBundle);
    expect(dev).toMatch(/10,\s*11,\s*12/u);
    expect(ghost).toMatch(/13,\s*14,\s*15/u);
  });
});
