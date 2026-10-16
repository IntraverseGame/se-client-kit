import { defineConfig } from "vitest/config";

// The README check depends on what git tracks and ignores, which no file input
// describes, so it runs as its own uncached script (`pnpm check:readmes`). The
// other tooling tests are in vitest.config.ts, which excludes this one.
export default defineConfig({
  test: { include: ["tools/readmes.test.ts"], environment: "node" },
});
