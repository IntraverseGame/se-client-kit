import { defineConfig } from "vitest/config";

import { packageImportGuard } from "./package-import-guard.ts";

// A plain Vite page, like the Wrapper. The package-import guard refuses every
// package in the build (the game depends on none at run time) and a kit
// package everywhere, the dev server and the component tests included.
// Nothing is inlined as a `data:` URL (`assetsInlineLimit: 0`): the page's
// Content Security Policy refuses `data:` URLs anyway, and with every asset
// emitted as a file the guard's emitted-asset check sees each one (an inlined
// asset reaches no plugin hook). A worker's module graph is built with
// `worker.plugins` only (none by default), so the guard is listed there too.
export default defineConfig({
  plugins: [packageImportGuard()],
  worker: { plugins: () => [packageImportGuard()] },
  publicDir: false,
  build: { target: "es2023", sourcemap: false, assetsInlineLimit: 0 },
  test: { environment: "jsdom" },
});
