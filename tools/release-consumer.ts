// The consumer check of the release dry run and the publish step
// (runbook/client-kit-release.md, Dry run): the packed libraries, unpacked the
// way a consumer gets them, import in Node, each type-only entry has its
// declaration file and no runtime entry, and the `contracts` test-only entry
// does not resolve. No network: each runtime dependency outside the kit is
// linked from the workspace's own install.

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

import { packageNameOf } from "./package-tarball.ts";
import { type PackedLibrary, readJson, run } from "./release-steps.ts";
import { readTar } from "./tar.ts";
import {
  OUTCOME_PREFIX,
  typeOnlyOutcomeProblems,
} from "./type-only-outcome.ts";

const TEST_ONLY_SUBPATH = "./testing";

/** An `exports` entry whose only condition is `types`: no runtime code. */
export type TypeOnlyEntry = {
  /** What a consumer would import (`<name>/x`). */
  specifier: string;
  /** The `types` target, relative to the package root (`./dist/x.d.ts`). */
  types: string;
};

/** A declaration file inside the package: `./….d.ts` (not `.d.mts` or `.d.cts`). */
const isDeclarationFile = (types: unknown): types is string =>
  typeof types === "string" &&
  types.startsWith("./") &&
  !types.split("/").includes("..") &&
  types.endsWith(".d.ts");

/**
 * The `exports` entries of a manifest as `[key, value]` pairs: each key of a
 * subpath map, or the whole value as `.` for a conditions-only or string
 * `exports`.
 */
const exportsEntries = (exports: unknown): [string, unknown][] =>
  typeof exports === "object" &&
  exports !== null &&
  Object.keys(exports).every(key => key.startsWith("."))
    ? Object.entries(exports)
    : [[".", exports]];

const specifierOf = (name: string, key: string): string =>
  key === "." ? name : `${name}${key.slice(1)}`;

const isTypeOnly = (value: unknown): value is { types: unknown } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  Object.hasOwn(value, "types");

const isTestOnly = (name: string, key: string): boolean =>
  key === TEST_ONLY_SUBPATH && name === packageNameOf("contracts");

/**
 * The specifiers a consumer can import from a packed manifest: one per
 * `exports` key (`.` is the package name, `./x` is `<name>/x`), except the
 * `contracts` test-only entry and the type-only entries (`typeOnlyEntries`). A
 * subpath pattern (`./*`) cannot be imported as written, so it is reported as a
 * problem instead.
 */
export const importSpecifiers = (
  name: string,
  exports: unknown,
): { specifiers: string[]; problems: string[] } => {
  const specifiers: string[] = [];
  const problems: string[] = [];
  for (const [key, value] of exportsEntries(exports)) {
    if (isTestOnly(name, key)) continue;
    if (key.includes("*")) {
      problems.push(`${name}: the exports pattern ${key} is not checked`);
    } else if (!isTypeOnly(value)) {
      specifiers.push(specifierOf(name, key));
    }
  }
  return { specifiers, problems };
};

/**
 * The type-only entries of a packed manifest: each `exports` entry whose only
 * condition is `types` (a mixed entry is a runtime one, `importSpecifiers`).
 * Its `types` target must be a declaration file inside the package (`./….d.ts`,
 * not `.d.mts` or `.d.cts`); anything else is reported as a problem. The
 * `contracts` test-only entry and subpath patterns are left out
 * (`importSpecifiers` reports a pattern).
 */
export const typeOnlyEntries = (
  name: string,
  exports: unknown,
): { entries: TypeOnlyEntry[]; problems: string[] } => {
  const entries: TypeOnlyEntry[] = [];
  const problems: string[] = [];
  for (const [key, value] of exportsEntries(exports)) {
    if (isTestOnly(name, key) || key.includes("*") || !isTypeOnly(value)) {
      continue;
    }
    const { types } = value;
    if (isDeclarationFile(types)) {
      entries.push({ specifier: specifierOf(name, key), types });
    } else {
      problems.push(
        `${name}: the type-only exports entry ${key} does not name a declaration file in the package (${JSON.stringify(types) ?? String(types)})`,
      );
    }
  }
  return { entries, problems };
};

/**
 * The type-only entries whose `types` target is not among the tarball's files.
 * `files` are the packed file paths relative to the package root (a tar entry's
 * path without its `package/` prefix).
 */
export const missingDeclarations = (
  entries: readonly TypeOnlyEntry[],
  files: readonly string[],
): string[] => {
  const packed = new Set(files);
  return entries
    .filter(entry => !packed.has(entry.types.slice("./".length)))
    .map(
      entry =>
        `${entry.specifier}: the type-only entry's declaration file ${entry.types} is not in the tarball`,
    );
};

/**
 * Install the packed libraries the way a consumer gets them (their tarball
 * contents under `node_modules`, each runtime dependency outside the kit linked
 * from the workspace's own install, with no network), then import every runtime
 * `exports` entry of every package in Node (`importSpecifiers`), require of
 * each type-only entry (`typeOnlyEntries`) that its declaration file is in the
 * package and that importing it fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (no
 * runtime entry), and require that the `contracts` test-only entry does not
 * resolve. Returns the problems found.
 */
export const checkResolution = (
  root: string,
  packed: readonly PackedLibrary[],
  consumer: string,
  env: NodeJS.ProcessEnv,
): string[] => {
  const modules = join(consumer, "node_modules");
  const specifiers: string[] = [];
  const typeOnly: string[] = [];
  const problems: string[] = [];
  for (const library of packed) {
    const target = join(modules, packageNameOf(library.name));
    const files: string[] = [];
    for (const entry of readTar(gunzipSync(readFileSync(library.tarball)))) {
      if (entry.type !== "file" || !entry.path.startsWith("package/")) continue;
      const file = entry.path.slice("package/".length);
      files.push(file);
      const to = join(target, file);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, entry.bytes);
    }
    const manifest = readJson(join(target, "package.json"));
    const name = packageNameOf(library.name);
    const found = importSpecifiers(name, manifest["exports"]);
    specifiers.push(...found.specifiers);
    problems.push(...found.problems);
    const typed = typeOnlyEntries(name, manifest["exports"]);
    problems.push(
      ...typed.problems,
      ...missingDeclarations(typed.entries, files),
    );
    typeOnly.push(...typed.entries.map(entry => entry.specifier));
    const dependencies = (manifest["dependencies"] ?? {}) as Record<
      string,
      unknown
    >;
    for (const dependency of Object.keys(dependencies)) {
      if (dependency.startsWith("@intraverse/se-client-")) continue;
      const link = join(modules, dependency);
      if (lstatSync(link, { throwIfNoEntry: false }) !== undefined) continue;
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(
        realpathSync(
          join(root, "packages", library.name, "node_modules", dependency),
        ),
        link,
      );
    }
  }
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "consumer", private: true, type: "module" })}\n`,
  );
  // Each type-only entry's outcome is printed, one JSON line each, and judged
  // here (`typeOnlyOutcomeProblems`), not in the script.
  const script = [
    `for (const specifier of ${JSON.stringify(typeOnly)}) {`,
    "  let outcome;",
    "  try {",
    "    await import(specifier);",
    "    outcome = { specifier, resolved: true };",
    "  } catch (error) {",
    '    outcome = { specifier, resolved: false, code: typeof error?.code === "string" ? error.code : null };',
    "  }",
    `  console.log(${JSON.stringify(OUTCOME_PREFIX)} + JSON.stringify(outcome));`,
    "}",
    `for (const name of ${JSON.stringify(specifiers)}) await import(name);`,
    "try {",
    `  await import(${JSON.stringify(`${packageNameOf("contracts")}${TEST_ONLY_SUBPATH.slice(1)}`)});`,
    '  console.log("the contracts test-only entry resolved");',
    "  process.exitCode = 1;",
    "} catch (error) {",
    '  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;',
    "}",
  ].join("\n");
  try {
    const output = run("node", ["--input-type=module", "--eval", script], {
      cwd: consumer,
      env,
    });
    return [...problems, ...typeOnlyOutcomeProblems(typeOnly, output)];
  } catch (error) {
    return [
      ...problems,
      `the packed packages do not import cleanly: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
};
