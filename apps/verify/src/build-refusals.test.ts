// @vitest-environment node
// The verify page's build is only ever one production build with the
// test-only-entry guard on (specs/verify-page.md, V-15 to V-17), like the
// Wrapper's: `vite.config.ts` refuses a build in any mode but `production`,
// with `VITEST` set, with `NODE_ENV` set to anything but `production` (unset
// and empty count as unset), or with `VITE_USER_NODE_ENV` set, and reads no env
// files. Each case loads or resolves the real config.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  asReleaseBuild,
  loadBuildConfig,
  pluginNamesOf,
  workerPluginNamesOf,
  setEnv,
  VERIFY_CONFIG,
} from "./fixtures/release-build.ts";

const GUARDED = ["se-client-test-only-entry-guard"];

describe("the verify page's build mode", () => {
  it.each(["test", "development", "staging"])(
    "refuses to build the verify page in mode %s",
    async mode => {
      await expect(asReleaseBuild(() => loadBuildConfig(mode))).rejects.toThrow(
        new RegExp(`never built in mode "${mode}"`, "u"),
      );
    },
  );

  it("builds in mode production, with the guard, under /verify/", async () => {
    const loaded = await asReleaseBuild(() => loadBuildConfig("production"));
    expect(pluginNamesOf(loaded?.config)).toEqual(GUARDED);
    // The worker pipeline does not inherit `plugins`: the guard is there too.
    expect(await workerPluginNamesOf(loaded?.config)).toEqual(GUARDED);
    // The Wrapper serves the page at its base ("/") plus `verify/`
    // (apps/wrapper/release-files.ts, VERIFY_DIR).
    expect(loaded?.config.base).toBe("/verify/");
    expect(loaded?.config.publicDir).toBe(false);
  });

  it("refuses to build with VITEST set (it would switch the guard off)", async () => {
    vi.stubEnv("VITEST", "1");
    try {
      await expect(loadBuildConfig()).rejects.toThrow(
        /never built with VITEST set/u,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("NODE_ENV", () => {
  it.each(["development", "test", "staging"])(
    "refuses to build the verify page with NODE_ENV=%s",
    async nodeEnv => {
      await expect(asReleaseBuild(loadBuildConfig, nodeEnv)).rejects.toThrow(
        new RegExp(`never built with NODE_ENV="${nodeEnv}"`, "u"),
      );
    },
  );

  it.each<[string, string | undefined]>([
    ["unset", undefined],
    ["empty", ""],
    ["production", "production"],
  ])("builds with NODE_ENV %s, with the guard", async (_, value) => {
    const loaded = await asReleaseBuild(loadBuildConfig, value);
    expect(pluginNamesOf(loaded?.config)).toEqual(GUARDED);
  });
});

describe("VITE_USER_NODE_ENV", () => {
  it.each(["development", "production"])(
    "refuses to build the verify page with VITE_USER_NODE_ENV=%s",
    async value => {
      await expect(
        asReleaseBuild(() => {
          process.env["VITE_USER_NODE_ENV"] = value;
          return loadBuildConfig();
        }),
      ).rejects.toThrow(
        new RegExp(`never built with VITE_USER_NODE_ENV="${value}"`, "u"),
      );
    },
  );

  it.each<[string, string | undefined]>([
    ["unset", undefined],
    ["empty", ""],
  ])("builds with VITE_USER_NODE_ENV %s", async (_, value) => {
    const loaded = await asReleaseBuild(() => {
      setEnv("VITE_USER_NODE_ENV", value);
      return loadBuildConfig();
    });
    expect(pluginNamesOf(loaded?.config)).toEqual(GUARDED);
  });

  it("cannot make a development build through the real config", async () => {
    await expect(
      asReleaseBuild(() => {
        process.env["VITE_USER_NODE_ENV"] = "development";
        return resolveConfig(
          {
            configFile: VERIFY_CONFIG,
            root: tmpdir(),
            envDir: false,
            logLevel: "silent",
          },
          "build",
          "production",
          "production",
        );
      }),
    ).rejects.toThrow(/never built with VITE_USER_NODE_ENV="development"/u);
  });
});

describe("env files", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("are not read: a planted NODE_ENV=development leaves the build production", async () => {
    const dir = mkdtempSync(join(tmpdir(), "se-verify-env-"));
    root = dir;
    for (const file of [".env", ".env.production"]) {
      writeFileSync(join(dir, file), "NODE_ENV=development\n");
    }
    const resolved = await asReleaseBuild(() =>
      resolveConfig(
        { configFile: VERIFY_CONFIG, root: dir, logLevel: "silent" },
        "build",
        "production",
        "production",
      ),
    );
    expect(resolved.envDir).toBe(false);
    expect(resolved.isProduction).toBe(true);
  });
});
