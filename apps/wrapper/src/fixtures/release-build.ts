// Test-only: loading the Wrapper's `vite.config.ts` as a release build does,
// with the environment such a build has, then restoring the environment.

import { join } from "node:path";

import { loadConfigFromFile } from "vite";

/** The Wrapper's Vite config. */
export const WRAPPER_CONFIG = join(
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
 * unset, `NODE_ENV` as `nodeEnv` (unset by default; Vitest itself sets
 * `NODE_ENV=test`, which a build refuses), and `VITE_USER_NODE_ENV`, which Vite
 * sets from an env file it reads, as it was.
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

/** Loads the Wrapper's config for a build in `mode`. */
export const loadBuildConfig = (mode = "production") =>
  loadConfigFromFile({ command: "build", mode }, WRAPPER_CONFIG);
