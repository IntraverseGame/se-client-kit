import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "dist",
  ".wireit",
  "coverage",
  "playwright-report",
  "test-results",
]);

/**
 * Every file under `root` for which `accept` returns true, as paths relative to
 * `root` with `/` separators, sorted. It walks the whole tree (not only the
 * workspace globs), so a file outside the declared workspace is still seen.
 */
export function findFiles(
  root: string,
  accept: (path: string) => boolean,
): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join("/");
        if (accept(path)) found.push(path);
      }
    }
  };
  walk(root);
  return found.toSorted();
}

export function readText(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}
