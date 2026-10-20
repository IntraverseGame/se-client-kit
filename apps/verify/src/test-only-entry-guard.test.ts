// @vitest-environment node
// Proof that the verify page's build carries the test-only-entry guard
// (tools/test-only-entry-guard.ts; its full cases are the Wrapper's tests): the
// plugins its real `vite.config.ts` gives a release build fail a real Vite
// build of a scratch project whose graph reaches the contracts test-only entry,
// in the main pipeline and in the worker pipeline. Without the guard Vite
// inlines the vector data and drops the specifier.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { build, type PluginOption, type Rollup, type UserConfig } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asReleaseBuild, loadBuildConfig } from "./fixtures/release-build.ts";

const VECTOR = /4,\s*5,\s*6/u;

let scratch = "";
const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(scratch, path)), { recursive: true });
  writeFileSync(join(scratch, path), text);
};

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "se-verify-guard-"));
  const contracts = "node_modules/@intraverse/se-client-contracts";
  write(
    `${contracts}/package.json`,
    JSON.stringify({
      name: "@intraverse/se-client-contracts",
      type: "module",
      exports: { ".": "./dist/index.js", "./testing": "./dist/testing.js" },
    }),
  );
  write(`${contracts}/dist/index.js`, "export const schema = { a: 1 };\n");
  write(`${contracts}/dist/testing.js`, "export const vector = [4, 5, 6];\n");
  write(
    "src/direct.ts",
    'import { vector } from "@intraverse/se-client-contracts/testing";\nconsole.log(vector);\n',
  );
  write(
    "src/clean.ts",
    'import { schema } from "@intraverse/se-client-contracts";\nconsole.log(schema);\n',
  );
  write(
    "src/with-worker.ts",
    'new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });\n',
  );
  write(
    "src/worker.ts",
    'import { vector } from "@intraverse/se-client-contracts/testing";\npostMessage(vector);\n',
  );
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** The verify page's release-build config, as its `vite.config.ts` gives it. */
const releaseConfig = async (): Promise<UserConfig> => {
  const loaded = await asReleaseBuild(loadBuildConfig);
  if (loaded === null) throw new Error("the verify config did not load");
  return loaded.config;
};

/** Builds `entry` of the scratch project, with or without `config`'s plugins. */
const bundle = async (entry: string, config?: UserConfig): Promise<string> => {
  const workerPlugins = config?.worker?.plugins;
  const output = await build({
    root: scratch,
    configFile: false,
    logLevel: "silent",
    plugins: (config?.plugins ?? []) as PluginOption[],
    worker: {
      format: "es",
      ...(workerPlugins === undefined ? {} : { plugins: workerPlugins }),
    },
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: join(scratch, entry) },
    },
  });
  const outputs = (
    Array.isArray(output) ? output : [output]
  ) as Rollup.RollupOutput[];
  return outputs
    .flatMap(result => result.output)
    .map(file => (file.type === "chunk" ? file.code : String(file.source)))
    .join("\n");
};

describe("the verify page's test-only-entry guard", () => {
  it("lets the vectors into the bundle when there is no guard (the control)", async () => {
    expect(await bundle("src/direct.ts")).toMatch(VECTOR);
  });

  it("fails a build that imports the test-only entry", async () => {
    await expect(
      bundle("src/direct.ts", await releaseConfig()),
    ).rejects.toThrow(
      /verify page bundle must not contain the contracts test-only entry/u,
    );
  });

  it("fails a build whose worker imports the test-only entry", async () => {
    await expect(
      bundle("src/with-worker.ts", await releaseConfig()),
    ).rejects.toThrow(/test-only entry/u);
  });

  it("builds a graph that only uses the runtime entry", async () => {
    expect(await bundle("src/clean.ts", await releaseConfig())).not.toMatch(
      VECTOR,
    );
  });
});
