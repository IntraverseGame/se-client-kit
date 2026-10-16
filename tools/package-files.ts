// Checks of the `files` field of every library under `packages/`
// (specs/client-kit.md, "The `contracts` package" and "Supply chain"): `files`
// restricts what `npm pack` puts in a tarball (npm always adds `package.json`
// and the README), so each library lists only its `dist` output. `contracts`
// lists an allow-list that fails closed: its runtime entry and the
// `dist/runtime/` directory, where its tsdown config puts a shared chunk only
// when every module in it is a runtime source. Its test-only entry and the
// chunks only that entry loads are never selected.
//
// `selectsPath` approximates npm's `files` semantics with the wireit matcher (a
// directory selects everything below it). A `!` entry is refused, not modelled.
// The full `npm pack` tarball check arrives with the release work.

import { reachableFrom } from "./build-output.ts";
import { matchesFiles } from "./wireit-inputs.ts";

export type LibraryManifest = {
  /** The directory name under `packages/`: `contracts`, `shell`, ... */
  readonly name: string;
  readonly files?: readonly string[];
  readonly exports?: unknown;
};

/** The runtime entry of every library, as built into `dist/`. */
const RUNTIME_ENTRY = "index.js";
const RUNTIME_DECLARATION = "index.d.ts";

/** The `contracts` allow-list: the runtime entry and its shared chunks. */
export const CONTRACTS_FILES: readonly string[] = [
  "dist/index.js",
  "dist/index.js.map",
  "dist/index.d.ts",
  "dist/runtime",
];

/**
 * Paths no library may publish: sources, build state, the wireit cache,
 * installed packages, and config files. Relative to the package.
 */
const NEVER_PUBLISHED: readonly string[] = [
  "src/index.ts",
  "src/index.test.ts",
  ".wireit/0123/cache/state.json",
  "tsconfig.tsbuildinfo",
  "tsconfig.json",
  "tsdown.config.ts",
  "vite.config.ts",
  "vitest.config.ts",
  "node_modules/a/index.js",
];

/** Paths `contracts` may not publish: the test-only entry and its chunks. */
const CONTRACTS_NEVER_PUBLISHED: readonly string[] = [
  "dist/testing.js",
  "dist/testing.js.map",
  "dist/testing.d.ts",
  "dist/testing/a.js",
  "dist/chunks/vectors-abc123.js",
  "src/testing.ts",
  "src/vectors/signing/v1.json",
];

const normalize = (entry: string): string =>
  entry.replace(/^\.\//u, "").replace(/\/+$/u, "");

/** Whether `files` (npm semantics, approximated) select `path`. */
export const selectsPath = (files: readonly string[], path: string): boolean =>
  matchesFiles(
    files.flatMap(entry => {
      const pattern = normalize(entry);
      return [pattern, `${pattern}/**`];
    }),
    path,
  );

/** Every string target in an `exports` value (conditions included). */
const targetsOf = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(entry => targetsOf(entry));
  }
  return [];
};

/** The `exports` targets of the runtime entry (`.`), relative to the package. */
const runtimeTargets = (exports: unknown): string[] => {
  const runtime =
    typeof exports === "object" && exports !== null && "." in exports
      ? (exports as Record<string, unknown>)["."]
      : exports;
  return targetsOf(runtime).map(target => normalize(target));
};

/** The problems of one library's `files` field, from its manifest alone. */
export const findManifestFilesProblems = (
  manifest: LibraryManifest,
): string[] => {
  const { name, files } = manifest;
  if (files === undefined) {
    return [`${name}: has no files field, so npm would publish everything`];
  }
  const problems: string[] = [];
  for (const entry of files) {
    const path = normalize(entry);
    if (entry.startsWith("!")) {
      problems.push(
        `${name}: files entry ${entry} is a negation (not allowed)`,
      );
    } else if (path !== "dist" && !path.startsWith("dist/")) {
      problems.push(`${name}: files entry ${entry} is outside dist`);
    }
    if (name === "contracts" && path.includes("testing")) {
      problems.push(`${name}: files entry ${entry} names the test-only entry`);
    }
  }
  const forbidden =
    name === "contracts"
      ? [...NEVER_PUBLISHED, ...CONTRACTS_NEVER_PUBLISHED]
      : NEVER_PUBLISHED;
  for (const path of forbidden) {
    if (selectsPath(files, path)) {
      problems.push(`${name}: files selects ${path}`);
    }
  }
  for (const target of runtimeTargets(manifest.exports)) {
    if (!selectsPath(files, target)) {
      problems.push(`${name}: files omits the export target ${target}`);
    }
  }
  return problems;
};

/**
 * The problems of one library's `files` against its built `dist/` (paths
 * relative to `dist/`): every file the runtime entry loads (JavaScript,
 * declarations, and their source maps) is selected, and for `contracts` nothing
 * else is, so a chunk that only the test-only entry loads, or a `testing*`
 * file, is never published.
 */
export const findDistFilesProblems = (
  manifest: LibraryManifest,
  dist: ReadonlyMap<string, string>,
): string[] => {
  const { name, files = [] } = manifest;
  if (!dist.has(RUNTIME_ENTRY)) {
    return [`${name}: dist/${RUNTIME_ENTRY} is missing (run \`pnpm build\`)`];
  }
  const loaded = new Set([
    ...reachableFrom(RUNTIME_ENTRY, dist),
    ...reachableFrom(RUNTIME_DECLARATION, dist, true),
  ]);
  // A source map added here is visited too; it has no map of its own.
  for (const path of loaded) {
    if (dist.has(`${path}.map`)) loaded.add(`${path}.map`);
  }
  const problems: string[] = [];
  for (const path of dist.keys()) {
    const selected = selectsPath(files, `dist/${path}`);
    if (loaded.has(path) && !selected) {
      problems.push(
        `${name}: dist/${path} is loaded by the runtime entry, but files omits it`,
      );
    }
    if (name !== "contracts" || !selected) continue;
    if (/(?:^|\/)testing[^/]*$/u.test(path)) {
      problems.push(`${name}: files selects the test-only file dist/${path}`);
    } else if (!loaded.has(path)) {
      problems.push(
        `${name}: files selects dist/${path}, which the runtime entry does not load`,
      );
    }
  }
  return problems;
};
