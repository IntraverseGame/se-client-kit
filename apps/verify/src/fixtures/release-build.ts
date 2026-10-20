// Test-only: loading the verify page's `vite.config.ts` as a release build
// does, with the environment such a build has, then restoring the environment.

import { join } from "node:path";

import { loadConfigFromFile, type UserConfig } from "vite";

/** The verify page's Vite config. */
export const VERIFY_CONFIG = join(
  import.meta.dirname,
  "..",
  "..",
  "vite.config.ts",
);

/** Sets `name` to `value`, or unsets it for `undefined`. */
export const setEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

/**
 * Run `action` as in a release build, then restore the environment: `VITEST`
 * and `VITE_USER_NODE_ENV` unset, and `NODE_ENV` as `nodeEnv` (unset by
 * default; Vitest itself sets `NODE_ENV=test`, which a build refuses).
 */
export const asReleaseBuild = async <T>(
  action: () => Promise<T>,
  nodeEnv?: string,
): Promise<T> => {
  const saved = {
    VITEST: process.env["VITEST"],
    NODE_ENV: process.env["NODE_ENV"],
    VITE_USER_NODE_ENV: process.env["VITE_USER_NODE_ENV"],
  };
  delete process.env["VITEST"];
  delete process.env["VITE_USER_NODE_ENV"];
  setEnv("NODE_ENV", nodeEnv);
  try {
    return await action();
  } finally {
    setEnv("VITEST", saved.VITEST);
    setEnv("NODE_ENV", saved.NODE_ENV);
    setEnv("VITE_USER_NODE_ENV", saved.VITE_USER_NODE_ENV);
  }
};

/** Loads the verify page's config for a build in `mode`. */
export const loadBuildConfig = (mode = "production") =>
  loadConfigFromFile({ command: "build", mode }, VERIFY_CONFIG);

/** The names of a config's plugins. */
export const pluginNamesOf = (config: UserConfig | undefined): unknown[] =>
  (config?.plugins ?? []).map(plugin =>
    typeof plugin === "object" && plugin !== null && "name" in plugin
      ? plugin.name
      : plugin,
  );

/** The names of a config's worker plugins (a separate pipeline). */
export const workerPluginNamesOf = async (
  config: UserConfig | undefined,
): Promise<unknown[]> =>
  pluginNamesOf({ plugins: (await config?.worker?.plugins?.()) ?? [] });
