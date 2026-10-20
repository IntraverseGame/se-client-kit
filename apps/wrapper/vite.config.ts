import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

import { testOnlyEntryGuard } from "../../tools/test-only-entry-guard.ts";
import { releaseIntegrity } from "./release-integrity.ts";

// The component tests (Vitest) may use the contracts vectors, so the guard is
// off there. That is decided by Vitest itself, which loads this file with
// `command: "serve"`. A build can never turn the guard off, by mode or by
// environment, and the release artifact is only ever one production build with
// one digest (decided in human review, 2026-10-19). So a build is refused
// outright, in this order:
// - in any mode but `production`, Vite's build default (`--mode test` would
//   also have meant a test build);
// - with `VITEST` set (it switches the guard off);
// - with `NODE_ENV` set to anything but `production`: `NODE_ENV=development
//   vite build` makes a development build. Unset and empty count as unset:
//   Vite itself sets `NODE_ENV` to `production` for a build before it loads
//   this file when it is unset or empty, and a direct `loadConfigFromFile` (the
//   tests) sees it unset;
// - with `VITE_USER_NODE_ENV` set to any non-empty value: after this file is
//   loaded, Vite sets `NODE_ENV=development` from it when `NODE_ENV` was not
//   set, where the check above cannot see it. Vite sets it from an env file,
//   and the build reads none, so only the environment can set it, and nothing
//   legitimate does.
// And the build reads no env files (`envDir: false`): an `.env` file's
// `NODE_ENV=development` reaches Vite the same late way.
const ALLOWED_NODE_ENV: ReadonlySet<string | undefined> = new Set([
  undefined,
  "",
  "production",
]);

export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode !== "production") {
    throw new Error(
      `The Wrapper is never built in mode ${JSON.stringify(mode)}: only "production".`,
    );
  }
  const underVitest = process.env["VITEST"] !== undefined;
  if (command === "build" && underVitest) {
    throw new Error("The Wrapper is never built with VITEST set.");
  }
  const nodeEnv = process.env["NODE_ENV"];
  if (command === "build" && !ALLOWED_NODE_ENV.has(nodeEnv)) {
    throw new Error(
      `The Wrapper is never built with NODE_ENV=${JSON.stringify(nodeEnv)}: only unset or "production".`,
    );
  }
  const userNodeEnv = process.env["VITE_USER_NODE_ENV"];
  if (command === "build" && userNodeEnv !== undefined && userNodeEnv !== "") {
    throw new Error(
      `The Wrapper is never built with VITE_USER_NODE_ENV=${JSON.stringify(userNodeEnv)}: it must be unset.`,
    );
  }
  return {
    // The release integrity step (SRI, the headers file, the manifest) runs
    // in a build only.
    plugins: underVitest
      ? []
      : [
          testOnlyEntryGuard(),
          // The verify page's own build goes into the release under `verify/`
          // (specs/verify-page.md, V-16); this build depends on it.
          releaseIntegrity({
            verifyDist: resolve(import.meta.dirname, "../verify/dist"),
          }),
        ],
    // Vite bundles a worker with its own plugin pipeline, which does not inherit
    // `plugins`: the guard is added there too.
    worker: { plugins: () => (underVitest ? [] : [testOnlyEntryGuard()]) },
    // No public directory: every file of the bundle goes through the build,
    // so the integrity step sees it (release-integrity.ts).
    publicDir: false,
    // No env files: the Wrapper reads no `import.meta.env`, and a `NODE_ENV`
    // from an `.env` file would make a development build (above).
    envDir: false,
    build: { target: "es2023", sourcemap: false },
    test: { environment: "jsdom" },
  };
});
