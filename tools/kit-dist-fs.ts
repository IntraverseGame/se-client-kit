// The file-system side of the guard (tools/kit-dist.ts): a kit package is
// resolved through the workspace's `node_modules` link, as tsc, Vite, and Node
// resolve it, a manifest that cannot be read is a problem (not a stack trace),
// and the paths a script names are resolved from its workspace. Every path is
// under a root, so the tests run it on a temporary tree.

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import {
  findMissingKitFiles,
  findMissingOwnFiles,
  formatMissingKitFiles,
  joinPath,
  type FileExists,
  type KitManifest,
  type ResolvePackage,
} from "./kit-dist.ts";

/** `path` (absolute) relative to `root`, with `/` separators. */
const fromRoot = (root: string, path: string): string =>
  relative(root, path).split(sep).join("/");

/**
 * The manifest of the workspace in `directory` (relative to `root`), or a
 * problem when it cannot be read or is not a JSON object.
 */
export const readManifest = (
  root: string,
  directory: string,
): KitManifest | string => {
  const path = joinPath(directory, "package.json");
  try {
    const value: unknown = JSON.parse(readFileSync(join(root, path), "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as KitManifest)
      : `${path} is not a JSON object`;
  } catch (error) {
    return `${path} cannot be read (${error instanceof Error ? error.message : String(error)})`;
  }
};

/** Resolves a kit package through the `node_modules` link of `from`. */
export const nodeResolver =
  (root: string): ResolvePackage =>
  (from, name) => {
    const link = join(root, from, "node_modules", ...name.split("/"));
    if (!existsSync(link)) return;
    const directory = fromRoot(root, realpathSync(link));
    const manifest = readManifest(root, directory);
    return typeof manifest === "string"
      ? { problem: `${name}: ${manifest}` }
      : { directory, manifest };
  };

/** Whether `path` (relative to `root`) is an existing file. */
export const nodeFileExists =
  (root: string): FileExists =>
  path =>
    statSync(join(root, path), { throwIfNoEntry: false })?.isFile() === true;

/** The paths a script names, relative to its workspace, made relative to `root`. */
export const ownPathsFromRoot = (
  root: string,
  directory: string,
  paths: readonly string[],
): string[] =>
  paths.map(path => fromRoot(root, resolve(root, directory, path)));

export type KitDistResult = {
  /** 0 when everything exists, 1 when something is missing, 2 on bad usage. */
  readonly exitCode: 0 | 1 | 2;
  /** The line or the message to print (stdout for 0, stderr otherwise). */
  readonly output: string;
};

/**
 * The guard as the CLI runs it: `args` are `<script> [path...]`, `cwd` is the
 * workspace (wireit runs a script there), and every path is resolved under
 * `root`.
 */
export const runKitDistCheck = (
  root: string,
  cwd: string,
  args: readonly string[],
): KitDistResult => {
  const [script, ...paths] = args;
  if (script === undefined) {
    return {
      exitCode: 2,
      output: "Usage: check-kit-dist.ts <script> [path...]",
    };
  }
  const base = realpathSync(root);
  const directory = fromRoot(base, realpathSync(cwd));
  const shown = directory === "" ? "." : directory;
  const manifest = readManifest(base, directory);
  const exists = nodeFileExists(base);
  const problems =
    typeof manifest === "string"
      ? [manifest]
      : [
          ...findMissingKitFiles(
            { directory, manifest },
            nodeResolver(base),
            exists,
          ),
          ...findMissingOwnFiles(
            ownPathsFromRoot(base, directory, paths),
            exists,
          ),
        ];
  return problems.length > 0
    ? { exitCode: 1, output: formatMissingKitFiles(script, shown, problems) }
    : {
        exitCode: 0,
        output: `${shown} (${script}): every kit build output it reads exists.`,
      };
};
