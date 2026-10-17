// The pnpm commands of the release dry run that are not packing
// (tools/release-dry-run.ts; runbook/client-kit-release.md, Dry run): which
// store the offline installs read, and the publish dry run.

import { type PackedLibrary, run, type RunOptions } from "./release-steps.ts";

/**
 * The pnpm store the repository's own install uses (`pnpm store path`, run with
 * the real environment). The dry run's offline installs name it with
 * `--store-dir`, so they read the very store the setup install filled, wherever
 * the environment put it.
 */
export const storeDirectory = (root: string): string => {
  const path = run("pnpm", ["store", "path"], {
    cwd: root,
    env: process.env,
  }).trim();
  if (path === "") throw new Error("`pnpm store path` printed nothing.");
  return path;
};

/**
 * `pnpm publish <tarball> --dry-run` for each packed library, against
 * `registry` (the dry run passes an address nothing listens on), with public
 * access and lifecycle scripts off. Returns the failures.
 */
export const publishDryRun = (
  packed: readonly PackedLibrary[],
  registry: string,
  options: RunOptions,
): string[] =>
  packed.flatMap(library => {
    try {
      run(
        "pnpm",
        [
          "publish",
          library.tarball,
          "--access",
          "public",
          "--ignore-scripts",
          "--no-git-checks",
          "--dry-run",
          "--registry",
          registry,
        ],
        options,
      );
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  });
