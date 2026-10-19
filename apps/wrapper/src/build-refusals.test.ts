// @vitest-environment node
// The Wrapper's build is only ever one production build (decided in human
// review, 2026-10-19), and it can never switch the test-only-entry guard off:
// `vite.config.ts` refuses a build in any mode but `production`, with `VITEST`
// set, or with `NODE_ENV` set to anything but `production` (unset and empty
// count as unset), or with `VITE_USER_NODE_ENV` set (Vite would make a
// development build from it after the config loads), and it reads no env files
// (`envDir: false`), so a `NODE_ENV=development` planted in `.env` or
// `.env.production` cannot make a development build. Each case loads or
// resolves the real config.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveConfig, type UserConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  asReleaseBuild,
  loadBuildConfig,
  setEnv,
  WRAPPER_CONFIG,
} from "./fixtures/release-build.ts";

const pluginNamesOf = (config: UserConfig | undefined): unknown[] =>
  (config?.plugins ?? []).map(plugin =>
    typeof plugin === "object" && plugin !== null && "name" in plugin
      ? plugin.name
      : plugin,
  );

const GUARDED = [
  "se-client-test-only-entry-guard",
  "se-client-release-integrity",
];

describe("the Wrapper's build mode", () => {
  it.each(["test", "development", "staging"])(
    "refuses to build the Wrapper in mode %s",
    async mode => {
      await expect(asReleaseBuild(() => loadBuildConfig(mode))).rejects.toThrow(
        new RegExp(`never built in mode "${mode}"`, "u"),
      );
    },
  );

  it("builds the Wrapper in mode production, with the guard", async () => {
    const loaded = await asReleaseBuild(() => loadBuildConfig("production"));
    expect(pluginNamesOf(loaded?.config)).toEqual(GUARDED);
  });

  it("refuses mode test before anything else, even with VITEST set", async () => {
    vi.stubEnv("VITEST", "1");
    try {
      await expect(loadBuildConfig("test")).rejects.toThrow(
        /never built in mode "test"/u,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("VITEST", () => {
  it("refuses to build the Wrapper with VITEST set (it would switch the guard off)", async () => {
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
  // `NODE_ENV=development vite build` makes a development build. Vite sets an
  // unset or empty `NODE_ENV` to `production` for a build before it loads the
  // config; a direct load sees it as it is.
  it.each(["development", "test", "staging"])(
    "refuses to build the Wrapper with NODE_ENV=%s",
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
  ])(
    "builds the Wrapper with NODE_ENV %s, with the guard",
    async (_, value) => {
      const loaded = await asReleaseBuild(loadBuildConfig, value);
      expect(pluginNamesOf(loaded?.config)).toEqual(GUARDED);
    },
  );
});

/** Resolves a build config with `VITE_USER_NODE_ENV=development` set. */
const resolvedWithUserNodeEnv = (configFile: string | false) =>
  asReleaseBuild(() => {
    process.env["VITE_USER_NODE_ENV"] = "development";
    return resolveConfig(
      { configFile, root: tmpdir(), envDir: false, logLevel: "silent" },
      "build",
      "production",
      "production",
    );
  });

describe("VITE_USER_NODE_ENV", () => {
  // Vite sets `NODE_ENV=development` from it after the config loads, when
  // `NODE_ENV` was not set. With env files off, only the environment sets it,
  // so any non-empty value is refused.
  it.each(["development", "production"])(
    "refuses to build the Wrapper with VITE_USER_NODE_ENV=%s",
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
  ])("builds the Wrapper with VITE_USER_NODE_ENV %s", async (_, value) => {
    const loaded = await asReleaseBuild(() => {
      setEnv("VITE_USER_NODE_ENV", value);
      return loadBuildConfig();
    });
    expect(pluginNamesOf(loaded?.config)).toEqual(GUARDED);
  });

  it("cannot make a development build through the real config: it is refused", async () => {
    await expect(resolvedWithUserNodeEnv(WRAPPER_CONFIG)).rejects.toThrow(
      /never built with VITE_USER_NODE_ENV="development"/u,
    );
  });

  it("would make a development build without the refusal (the control)", async () => {
    const resolved = await resolvedWithUserNodeEnv(false);
    expect(resolved.isProduction).toBe(false);
  });
});

describe("env files", () => {
  let root: string | undefined;

  /** A project directory holding `NODE_ENV=development` in both env files. */
  const plantedRoot = (): string => {
    root = mkdtempSync(join(tmpdir(), "se-wrapper-env-"));
    for (const file of [".env", ".env.production"]) {
      writeFileSync(join(root, file), "NODE_ENV=development\n");
    }
    return root;
  };

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("are not read: a planted NODE_ENV=development leaves the build production", async () => {
    const dir = plantedRoot();
    const resolved = await asReleaseBuild(() =>
      resolveConfig(
        { configFile: WRAPPER_CONFIG, root: dir, logLevel: "silent" },
        "build",
        "production",
        "production",
      ),
    );
    expect(resolved.envDir).toBe(false);
    expect(resolved.isProduction).toBe(true);
  });

  it("would be read without envDir: false (the control)", async () => {
    const dir = plantedRoot();
    const resolved = await asReleaseBuild(() =>
      resolveConfig(
        { configFile: false, root: dir, logLevel: "silent" },
        "build",
        "production",
        "production",
      ),
    );
    expect(resolved.isProduction).toBe(false);
  });
});
