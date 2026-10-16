// CLI: check the `files` field of every library under `packages/` against its
// built `dist/` (run after the library builds by `pnpm run check:package-files`,
// part of `pnpm check` and the `build` CI job). See tools/package-files.ts.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  findDistFilesProblems,
  findManifestFilesProblems,
  type LibraryManifest,
} from "./package-files.ts";

const root = join(import.meta.dirname, "..");

const textsUnder = (directory: string): Map<string, string> => {
  const files = new Map<string, string>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        files.set(
          relative(directory, full).split(sep).join("/"),
          readFileSync(full, "utf8"),
        );
    }
  };
  walk(directory);
  return files;
};

const problems: string[] = [];
for (const name of readdirSync(join(root, "packages"))) {
  const directory = join(root, "packages", name);
  const manifest = {
    ...(JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    ) as Omit<LibraryManifest, "name">),
    name,
  };
  problems.push(...findManifestFilesProblems(manifest));
  const dist = join(directory, "dist");
  problems.push(
    ...findDistFilesProblems(
      manifest,
      statSync(dist, { throwIfNoEntry: false })?.isDirectory() === true
        ? textsUnder(dist)
        : new Map(),
    ),
  );
}

if (problems.length > 0) {
  console.error("Problems in the package files fields:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log("Every library publishes only its dist output.");
}
