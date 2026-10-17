// The consumer check of the release dry run and the publish step
// (runbook/client-kit-release.md, Dry run): the packed libraries, unpacked the
// way a consumer gets them, import in Node, and the `contracts` test-only entry
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

const TEST_ONLY_SUBPATH = "./testing";

/**
 * The specifiers a consumer can import from a packed manifest: one per
 * `exports` key (`.` is the package name, `./x` is `<name>/x`), except the
 * `contracts` test-only entry. A subpath pattern (`./*`) cannot be imported as
 * written, so it is reported as a problem instead.
 */
export const importSpecifiers = (
  name: string,
  exports: unknown,
): { specifiers: string[]; problems: string[] } => {
  const keys =
    typeof exports === "object" &&
    exports !== null &&
    Object.keys(exports).every(key => key.startsWith("."))
      ? Object.keys(exports)
      : ["."];
  const specifiers: string[] = [];
  const problems: string[] = [];
  for (const key of keys) {
    if (key === TEST_ONLY_SUBPATH && name === packageNameOf("contracts")) {
      continue;
    }
    if (key.includes("*")) {
      problems.push(`${name}: the exports pattern ${key} is not checked`);
    } else {
      specifiers.push(key === "." ? name : `${name}${key.slice(1)}`);
    }
  }
  return { specifiers, problems };
};

/**
 * Install the packed libraries the way a consumer gets them (their tarball
 * contents under `node_modules`, each runtime dependency outside the kit linked
 * from the workspace's own install, with no network), then import every
 * `exports` entry of every package in Node (`importSpecifiers`) and require
 * that the `contracts` test-only entry does not resolve. Returns the problems
 * found.
 */
export const checkResolution = (
  root: string,
  packed: readonly PackedLibrary[],
  consumer: string,
  env: NodeJS.ProcessEnv,
): string[] => {
  const modules = join(consumer, "node_modules");
  const specifiers: string[] = [];
  const problems: string[] = [];
  for (const library of packed) {
    const target = join(modules, packageNameOf(library.name));
    for (const entry of readTar(gunzipSync(readFileSync(library.tarball)))) {
      if (entry.type !== "file" || !entry.path.startsWith("package/")) continue;
      const to = join(target, entry.path.slice("package/".length));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, entry.bytes);
    }
    const manifest = readJson(join(target, "package.json"));
    const found = importSpecifiers(
      packageNameOf(library.name),
      manifest["exports"],
    );
    specifiers.push(...found.specifiers);
    problems.push(...found.problems);
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
  const script = [
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
    run("node", ["--input-type=module", "--eval", script], {
      cwd: consumer,
      env,
    });
    return problems;
  } catch (error) {
    return [
      ...problems,
      `the packed packages do not import cleanly: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
};
