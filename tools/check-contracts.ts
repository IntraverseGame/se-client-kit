// CLI: the `contracts` checks, run from the repository root by
// `pnpm run check:contracts` (and by the `contracts` CI job):
//
//   1. no non-test source file imports the `contracts` test-only entry;
//   2. every file vendored in `packages/contracts` matches its lock file;
//   3. the committed generated files equal a regeneration.
//
// All three are offline. `contracts-drift` waits for a published source.

import { join } from "node:path";

import { LOCK_FILE, verifyLock } from "./contracts-lock.ts";
import { staleGeneratedFiles } from "./generate-contracts.ts";
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

const packageDir = join(root, "packages", "contracts");

const problems = verifyLock(packageDir);
if (problems.length > 0) {
  console.error(`packages/contracts does not match ${LOCK_FILE}:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`contracts: every vendored file matches ${LOCK_FILE}`);
}

const stale = await staleGeneratedFiles(packageDir);
if (stale.length > 0) {
  console.error(
    "These generated files differ from a regeneration (pnpm exec tsx tools/generate-contracts.ts --write):",
  );
  for (const path of stale) console.error(`  packages/contracts/${path}`);
  process.exitCode = 1;
} else {
  console.log("contracts: generated files are current");
}
