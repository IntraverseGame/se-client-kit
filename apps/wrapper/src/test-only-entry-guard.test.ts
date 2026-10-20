// @vitest-environment node
import { join } from "node:path";

import { createServer, loadConfigFromFile, type UserConfig } from "vite";
import { describe, expect, it } from "vitest";

import { testOnlyEntryGuard } from "../../../tools/test-only-entry-guard.ts";
import { useGuardScratch, VECTOR } from "./fixtures/guard-scratch.ts";
import { asReleaseBuild, loadBuildConfig } from "./fixtures/release-build.ts";

// Proof that the Vite resolve guard fails a real Vite build (and the dev
// server) when the module graph reaches the contracts test-only entry or a
// vector. Each case runs the actual Vite API over a scratch project. Without the
// guard Vite inlines the vector data and drops the specifier, which is why a
// text scan of the finished bundle cannot catch this. The path and literal forms
// are in test-only-entry-guard-paths.test.ts; the build's refusals (mode,
// VITEST, NODE_ENV, env files) are in build-refusals.test.ts.

const { bundle, root } = useGuardScratch();

const pluginNamesOf = (config: UserConfig | undefined): unknown[] =>
  (config?.plugins ?? []).map(plugin =>
    typeof plugin === "object" && plugin !== null && "name" in plugin
      ? plugin.name
      : plugin,
  );

const workerPluginsOf = (config: UserConfig | undefined): unknown[] =>
  config?.worker?.plugins?.() ?? [];

describe("the Wrapper's test-only-entry resolve guard", () => {
  it("lets the vectors into the bundle when there is no guard (the defect)", async () => {
    const code = await bundle("src/direct.ts", { guard: false });
    expect(code).toMatch(VECTOR);
    expect(code).not.toContain("contracts/testing");
  });

  it("fails a build that imports the test-only entry directly", async () => {
    await expect(bundle("src/direct.ts", { guard: true })).rejects.toThrow(
      /must not contain the contracts test-only entry/u,
    );
  });

  it("fails a build that reaches it through another module", async () => {
    await expect(bundle("src/transitive.ts", { guard: true })).rejects.toThrow(
      /test-only entry/u,
    );
  });

  it("fails a build that imports the entry's source file", async () => {
    await expect(bundle("src/by-file.ts", { guard: true })).rejects.toThrow(
      /test-only entry/u,
    );
  });

  it("builds a graph that only uses the runtime entry", async () => {
    const code = await bundle("src/clean.ts", { guard: true });
    expect(code).not.toMatch(VECTOR);
  });

  it("still fails a build in mode test (the guard does not read the mode)", async () => {
    await expect(
      bundle("src/direct.ts", { guard: true, mode: "test" }),
    ).rejects.toThrow(/test-only entry/u);
  });

  it("loads the config for a build without VITEST, with the guard", async () => {
    const loaded = await asReleaseBuild(loadBuildConfig);
    // The guard, then the release integrity step (release-integrity.ts).
    expect(pluginNamesOf(loaded?.config)).toEqual([
      "se-client-test-only-entry-guard",
      "se-client-release-integrity",
    ]);
  });

  it("puts the guard in the worker pipeline of a build config too", async () => {
    const loaded = await asReleaseBuild(loadBuildConfig);
    expect(workerPluginsOf(loaded?.config)).toHaveLength(1);
  });

  it("fails the dev server for a worker that imports the test-only entry", async () => {
    const server = await createServer({
      root: root(),
      configFile: false,
      logLevel: "silent",
      mode: "development",
      plugins: [testOnlyEntryGuard()],
      server: { middlewareMode: true, ws: false },
      appType: "custom",
    });
    try {
      await expect(
        server.transformRequest("/src/w-direct.ts?worker_file&type=module"),
      ).rejects.toThrow(/test-only entry/u);
    } finally {
      await server.close();
    }
  });

  it("loads the config under Vitest (serve) without the guard", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      join(import.meta.dirname, "..", "vite.config.ts"),
    );
    expect(loaded?.config.plugins).toHaveLength(0);
  });

  it("fails the dev server too", async () => {
    const server = await createServer({
      root: root(),
      configFile: false,
      logLevel: "silent",
      mode: "development",
      plugins: [testOnlyEntryGuard()],
      server: { middlewareMode: true, ws: false },
      appType: "custom",
    });
    try {
      await expect(server.transformRequest("/src/direct.ts")).rejects.toThrow(
        /test-only entry/u,
      );
    } finally {
      await server.close();
    }
  });
});
