// CLI: fail if a non-test source file imports the `contracts` test-only entry.
// Run from the repository root by `pnpm run check:contracts` (and by the
// `contracts` CI job). The hash check against the lock file and the
// regenerated-types diff arrive with the `contracts` package, which owns the
// lock file.

import { join } from "node:path";

import { findIllegalImports, isSourcePath } from "./test-only-entry.ts";
import { findFiles, readText } from "./workspace.ts";

const root = join(import.meta.dirname, "..");

const files = new Map<string, string>();
for (const path of findFiles(root, isSourcePath))
  files.set(path, readText(root, path));

const offenders = findIllegalImports(files);
if (offenders.length > 0) {
  console.error(
    "These files import the contracts test-only entry but are not tests:",
  );
  for (const path of offenders) console.error(`  ${path}`);
  process.exitCode = 1;
} else {
  console.log(
    `contracts test-only entry: ${String(files.size)} source files ok`,
  );
}
