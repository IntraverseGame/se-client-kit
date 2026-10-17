import { defineConfig } from "vitest/config";

import { releaseIntegrity } from "./release-integrity.ts";
import { testOnlyEntryGuard } from "./test-only-entry-guard.ts";

// The component tests (Vitest) may use the contracts vectors, so the guard is
// off there. That is decided by Vitest itself, which loads this file with
// `command: "serve"`. A build can never turn the guard off, by mode or by
// environment: `vite build --mode test` and any `vite build` run with `VITEST`
// set are refused outright.
export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "test") {
    throw new Error("The Wrapper is never built in mode test.");
  }
  const underVitest = process.env["VITEST"] !== undefined;
  if (command === "build" && underVitest) {
    throw new Error("The Wrapper is never built with VITEST set.");
  }
  return {
    // The release integrity step (SRI, the headers file, the manifest) runs
    // in a build only.
    plugins: underVitest ? [] : [testOnlyEntryGuard(), releaseIntegrity()],
    // Vite bundles a worker with its own plugin pipeline, which does not inherit
    // `plugins`: the guard is added there too.
    worker: { plugins: () => (underVitest ? [] : [testOnlyEntryGuard()]) },
    // No public directory: every file of the bundle goes through the build,
    // so the integrity step sees it (release-integrity.ts).
    publicDir: false,
    build: { target: "es2023", sourcemap: false },
    test: { environment: "jsdom" },
  };
});
