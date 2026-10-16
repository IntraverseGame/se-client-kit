import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";

import { defineConfig } from "tsdown";

import { base } from "../../tsdown.base.ts";

// The published tarball is an allow-list (package.json `files`): the runtime
// entry (`dist/index.*`) and `dist/runtime/`. A shared chunk is written to
// `dist/runtime/` only when every module in it is a runtime source (the same
// set as tools/build-output.ts: src/index.ts, src/schemas/, src/generated/);
// any other chunk (one with a vector, the test-only entry, or a bundler helper)
// goes to `dist/chunks/`, which is never published. A runtime chunk that lands
// there is left out of the tarball, and `check:package-files` fails (closed).
const packageRoot = realpathSync(import.meta.dirname);
const RUNTIME_SOURCE =
  /^src\/(?:index\.(?:d\.)?ts|(?:schemas|generated)\/.+)$/u;

const isRuntimeSource = (id: string): boolean =>
  RUNTIME_SOURCE.test(relative(packageRoot, id).split(sep).join("/"));

export default defineConfig({
  ...base,
  entry: { index: "src/index.ts", testing: "src/testing.ts" },
  outputOptions: {
    chunkFileNames: chunk =>
      chunk.moduleIds.length > 0 && chunk.moduleIds.every(isRuntimeSource)
        ? "runtime/[name]-[hash].js"
        : "chunks/[name]-[hash].js",
  },
});
