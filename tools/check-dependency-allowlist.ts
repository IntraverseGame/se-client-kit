// CLI: fail if any package.json in the repository declares a dependency that is
// not on the ADR-001 allow-list. Run from the repository root by
// `pnpm run check:deps` (and by the `contracts` CI job).

import { join } from "node:path";

import allowlist from "./allowed-dependencies.json" with { type: "json" };
import { findViolations, type Manifest } from "./dependency-allowlist.ts";
import { findFiles, readText } from "./workspace.ts";

const root = join(import.meta.dirname, "..");

const manifests: Manifest[] = findFiles(root, path =>
  path.endsWith("package.json"),
).map(path => {
  const directory =
    path === "package.json" ? "" : path.slice(0, -"/package.json".length);
  return { directory, json: JSON.parse(readText(root, path)) as unknown };
});

const workspaceYaml = readText(root, "pnpm-workspace.yaml");
const problems = findViolations(manifests, allowlist, workspaceYaml);
if (problems.length > 0) {
  console.error("Dependencies outside the ADR-001 allow-list:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `dependency allow-list: ${String(manifests.length)} manifests ok`,
  );
}
