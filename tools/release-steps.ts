// The steps the release dry run and the publish job share
// (tools/release-dry-run.ts, tools/release-publish.ts; the procedure is in
// runbook/client-kit-release.md): running a command with a clean environment,
// copying the working tree, packing and checking the five libraries, and
// building the Wrapper's release artifact (the consumer import check is in
// tools/release-consumer.ts). Nothing here reads or writes a credential.
//
// The scratch commands get an environment without token-like variables
// (`scratchEnvironment`). That is hygiene, **not isolation**: a child process
// of the same user can still read its parent's environment (on Linux,
// `/proc/<pid>/environ`), so a job that holds a credential, such as the OIDC
// request token of `id-token: write`, must not run repository tooling at all.
// That is why the publish job is to be split from the build (runbook, Bootstrap
// step 7).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

import type { Vector } from "./build-output-canary.ts";
import { findTarballProblems, PUBLISHED_PACKAGES } from "./package-tarball.ts";
import { readTar } from "./tar.ts";
import { type WrapperArtifact, wrapperArtifact } from "./wrapper-artifact.ts";

/**
 * Environment variables a scratch command never needs: anything that names a
 * token, a secret, a key, a password, or an auth value, and the variables of
 * the calling package manager and task runner (so the scratch run is not
 * steered by the run that started it). A pattern, so a credential under a name
 * it does not match still passes; see the header.
 */
const DROPPED_VARIABLE =
  /token|secret|key|password|passwd|auth|credential|^npm_|^pnpm_|^wireit_|^actions_/iu;

/**
 * The environment of a scratch command: the current one without
 * `DROPPED_VARIABLE`s, without `node_modules/.bin` directories of `root` on the
 * `PATH`, with wireit's cache off (a release build is never a cache restore),
 * with pnpm's install-before-run off, and with `extra` on top. pnpm runs an
 * install before `pnpm run` or `pnpm exec` when a manifest changed since the
 * last one (as `changeset version` does), and that install runs the workspace
 * projects' own lifecycle scripts even after an `--ignore-scripts` install; the
 * dry run installs explicitly instead.
 */
export const scratchEnvironment = (
  environment: NodeJS.ProcessEnv,
  root: string,
  extra: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv => {
  const kept: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined && !DROPPED_VARIABLE.test(name)) kept[name] = value;
  }
  const path = kept["PATH"];
  if (path !== undefined) {
    kept["PATH"] = path
      .split(delimiter)
      .filter(
        entry =>
          !(
            entry.startsWith(`${root}${sep}`) &&
            entry.includes(`node_modules${sep}.bin`)
          ),
      )
      .join(delimiter);
  }
  return {
    ...kept,
    WIREIT_CACHE: "none",
    CI: "true",
    pnpm_config_verify_deps_before_run: "false",
    ...extra,
  };
};

export type RunOptions = {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
};

/** Run a command; its output is shown only when it fails. */
export const run = (
  command: string,
  args: readonly string[],
  options: RunOptions,
): string => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `\`${[command, ...args].join(" ")}\` failed in ${options.cwd} (exit ${String(result.status)}):\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * The output directory of a release command: outside the repository (a copy of
 * the tree must never land inside it) and empty. Created if missing.
 */
export const prepareOut = (root: string, out: string): string => {
  const resolved = resolve(out);
  if (!relative(root, resolved).startsWith("..")) {
    throw new Error(`--out (${resolved}) must be outside the repository.`);
  }
  mkdirSync(resolved, { recursive: true });
  if (readdirSync(resolved).length > 0) {
    throw new Error(`--out (${resolved}) must be empty.`);
  }
  return resolved;
};

/** The files git would commit: tracked and untracked, without ignored ones. */
export const workingTreeFiles = (root: string): string[] =>
  run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    env: process.env,
  })
    .split("\0")
    .filter(path => path !== "");

/** The commit of `root`, and whether its working tree differs from it. */
export const sourceOf = (root: string): { commit: string; dirty: boolean } => {
  const options = { cwd: root, env: process.env };
  return {
    commit: run("git", ["rev-parse", "HEAD"], options).trim(),
    dirty: run("git", ["status", "--porcelain"], options).trim() !== "",
  };
};

/** Copy `paths` of `root` into `target`; a symbolic link stays a link. */
export const copyTree = (
  root: string,
  paths: readonly string[],
  target: string,
): void => {
  for (const path of paths) {
    const from = join(root, path);
    const stat = lstatSync(from, { throwIfNoEntry: false });
    // A tracked file deleted in the working tree is not copied.
    if (stat === undefined) continue;
    const to = join(target, path);
    mkdirSync(dirname(to), { recursive: true });
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else if (stat.isFile()) copyFileSync(from, to);
    else throw new Error(`${path} is neither a file nor a symbolic link`);
  }
};

/** Every regular file under `directory`, by path relative to it with `/`. */
export const readFiles = (directory: string): Map<string, Buffer> => {
  const files = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files.set(
          relative(directory, full).split(sep).join("/"),
          readFileSync(full),
        );
      } else {
        throw new Error(`${full} is not a regular file or a directory`);
      }
    }
  };
  walk(directory);
  return files;
};

export const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

/** The `version` of a workspace's package.json. */
export const versionOf = (workspace: string): string => {
  const version = readJson(join(workspace, "package.json"))["version"];
  if (typeof version !== "string") {
    throw new TypeError(`${workspace}/package.json has no version`);
  }
  return version;
};

export type PackedLibrary = {
  /** The directory name under `packages/`. */
  readonly name: string;
  readonly version: string;
  /** The tarball's absolute path. */
  readonly tarball: string;
  readonly sha256: string;
  /** `sha512-<base64>`, as the registry's `dist.integrity` gives it. */
  readonly integrity: string;
};

/** `pnpm pack` each published library of `root` into `destination`. */
export const packLibraries = (
  root: string,
  destination: string,
  env: NodeJS.ProcessEnv,
): PackedLibrary[] => {
  mkdirSync(destination, { recursive: true });
  return PUBLISHED_PACKAGES.map(name => {
    const directory = join(root, "packages", name);
    const output = run(
      "pnpm",
      ["pack", "--pack-destination", destination, "--json"],
      { cwd: directory, env },
    );
    const start = output.indexOf("{");
    const { filename } = JSON.parse(output.slice(start)) as {
      filename?: unknown;
    };
    if (typeof filename !== "string") {
      throw new TypeError(`pnpm pack of ${name} reported no tarball`);
    }
    const bytes = readFileSync(filename);
    return {
      name,
      version: versionOf(directory),
      tarball: filename,
      sha256: sha256Hex(bytes),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
  });
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

/** The tarball content check of every packed library. */
export const checkTarballs = (
  packed: readonly PackedLibrary[],
  vectors: readonly Vector[],
): string[] =>
  packed.flatMap(library =>
    findTarballProblems(
      {
        name: library.name,
        version: library.version,
        entries: readTar(gunzipSync(readFileSync(library.tarball))),
      },
      vectors,
    ),
  );

/** The Wrapper's release artifact, from `root`'s built `apps/wrapper/dist/`. */
export const buildWrapperArtifact = (root: string): WrapperArtifact => {
  const wrapper = join(root, "apps", "wrapper");
  return wrapperArtifact(versionOf(wrapper), readFiles(join(wrapper, "dist")));
};
