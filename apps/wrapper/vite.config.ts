import { defineConfig } from "vitest/config";

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
    plugins: underVitest ? [] : [testOnlyEntryGuard()],
    // Vite bundles a worker with its own plugin pipeline, which does not inherit
    // `plugins`: the guard is added there too.
    worker: { plugins: () => (underVitest ? [] : [testOnlyEntryGuard()]) },
    build: { target: "es2023", sourcemap: false },
    test: { environment: "jsdom" },
  };
});
