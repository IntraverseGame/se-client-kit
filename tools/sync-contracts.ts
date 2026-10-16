// CLI: vendor the contracts into packages/contracts and rewrite its lock file.
// Run by a person with access to the sources (the kit's CI never does):
//
//   pnpm exec tsx tools/sync-contracts.ts --sources <file> [--allow-vector-change]
//
// `--sources` names a JSON file with paths on the person's machine. It is
// required and lives outside this repository, so no such path is ever committed.
// See packages/contracts/README.md and runbook/client-kit-release.md.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { gitReader } from "./contracts-git-reader.ts";
import { GROUPS } from "./contracts-groups.ts";
import {
  applySync,
  type GroupSource,
  LOCK_FILE,
  planSync,
  readLock,
} from "./contracts-lock.ts";

const root = join(import.meta.dirname, "..");
const packageDir = join(root, "packages", "contracts");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The sources file, validated: every group has a name, repo, ref and path. */
export const parseSources = (text: string): Record<string, GroupSource> => {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("the sources file must be an object");
  const sources: Record<string, GroupSource> = {};
  for (const group of GROUPS) {
    const value = parsed[group.id];
    if (!isRecord(value)) throw new Error(`no source for "${group.id}"`);
    const { name, repo, ref, path } = value;
    if (
      typeof name !== "string" ||
      typeof repo !== "string" ||
      typeof ref !== "string" ||
      typeof path !== "string" ||
      name === "" ||
      repo === "" ||
      ref === "" ||
      path === ""
    )
      throw new Error(`"${group.id}" needs a name, repo, ref and path`);
    sources[group.id] = { name, repo: resolve(repo), ref, path };
  }
  return sources;
};

const main = (): void => {
  const args = process.argv.slice(2);
  const argument = args[args.indexOf("--sources") + 1];
  if (!args.includes("--sources") || argument === undefined)
    throw new Error(
      "--sources <file> is required (see packages/contracts/README.md)",
    );
  const sourcesFile = resolve(argument);
  if (!existsSync(sourcesFile))
    throw new Error(`sources file not found: ${sourcesFile}`);

  const previous = readLock(packageDir);
  if (previous.problems.length > 0)
    throw new Error(previous.problems.join("\n"));

  const plan = planSync(
    parseSources(readFileSync(sourcesFile, "utf8")),
    previous.entries,
    gitReader,
    { allowVectorChange: args.includes("--allow-vector-change") },
  );
  applySync(packageDir, plan);
  console.log(
    `contracts: synced ${String(plan.entries.length)} files and rewrote ${LOCK_FILE}`,
  );
};

// Importing this module (the tests do) must not run the sync.
if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(
      `contracts: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
