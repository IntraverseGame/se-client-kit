// CLI: check every built `dist/` of the workspace (run after `pnpm build` by
// `pnpm run check:build-output`, and by the `build` CI job).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  contractsScanScope,
  findCanaryProblems,
  type CanaryDist,
} from "./build-output-canary.ts";
import { loadVectors } from "./build-output-vectors.ts";
import { type Dist, findBuildOutputProblems } from "./build-output.ts";

const root = join(import.meta.dirname, "..");

const filesUnder = (directory: string): Map<string, Buffer> => {
  const files = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        files.set(
          relative(directory, full).split(sep).join("/"),
          readFileSync(full),
        );
    }
  };
  walk(directory);
  return files;
};

/** Every string target in a package.json `exports` value (conditions included). */
const exportTargets = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(entry => exportTargets(entry));
  }
  return [];
};

const dists: Dist[] = [];
const canaryDists: CanaryDist[] = [];
const problems: string[] = [];
for (const group of ["packages", "apps"]) {
  for (const name of readdirSync(join(root, group))) {
    const directory = join(root, group, name);
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    ) as { exports?: unknown };
    const targets = exportTargets(manifest.exports);
    const dist = join(directory, "dist");
    if (statSync(dist, { throwIfNoEntry: false })?.isDirectory() === true) {
      const buffers = filesUnder(dist);
      const texts = new Map(
        [...buffers].map(
          ([path, bytes]) => [path, bytes.toString("utf8")] as const,
        ),
      );
      dists.push({ name, files: texts, exportTargets: targets });
      canaryDists.push({
        name,
        files: name === "contracts" ? contractsScanScope(buffers) : buffers,
      });
    } else if (targets.length > 0) {
      problems.push(`${name}: has exports but no dist/ (run \`pnpm build\`)`);
    }
  }
}

problems.push(...findBuildOutputProblems(dists));
const loaded = loadVectors(root);
problems.push(
  ...loaded.problems,
  ...findCanaryProblems(loaded.vectors, canaryDists),
);
if (problems.length > 0) {
  console.error("Problems in the build output:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`build output: ${String(dists.length)} dist directories ok`);
}
