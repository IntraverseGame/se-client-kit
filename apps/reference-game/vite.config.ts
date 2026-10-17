import { defineConfig } from "vitest/config";

import { packageImportGuard } from "./package-import-guard.ts";

// A plain Vite page, like the Wrapper. The package-import guard refuses every
// package in the build (the game depends on none at run time) and a kit
// package everywhere, the dev server and the component tests included.
export default defineConfig({
  plugins: [packageImportGuard()],
  publicDir: false,
  build: { target: "es2023", sourcemap: false },
  test: { environment: "jsdom" },
});
