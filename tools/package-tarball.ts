// The content check of a published package's tarball (the `pnpm pack` output),
// run by the release dry run before anything is published
// (specs/client-kit/the-contracts-package.md, check 3, and
// specs/client-kit/supply-chain.md). It reads what npm would serve, not the
// working tree, and reuses the build-output checks on the tarball's `dist/`:
//
//   - only regular files, each once, all under `package/`;
//   - `package.json`, `README.md`, and `LICENSE`, and otherwise only `dist/`
//     files the manifest's `files` selects;
//   - the manifest: the expected name and version, no `workspace:` or
//     `catalog:` specifier left in a dependency field, every dependency an
//     exact version, and no lifecycle script (no install, prepare, pack, or
//     publish hook runs, for a consumer or for the publish job);
//   - every `exports` target in the tarball, except the `contracts` test-only
//     entry (`./testing`), which the manifest keeps for the kit's own tests and
//     which must not be in it, with no `testing` or `vectors` path at all;
//   - the build-output checks (file types, declaration maps, the `contracts`
//     runtime graph, no mention of the test-only entry elsewhere) and the
//     output canary (no vector content), over every file of the tarball.

import { findCanaryProblems, type Vector } from "./build-output-canary.ts";
import { findBuildOutputProblems } from "./build-output.ts";
import { selectsPath } from "./package-files.ts";
import type { TarEntry } from "./tar.ts";

/** The five published libraries, by directory name under `packages/`. */
export const PUBLISHED_PACKAGES: readonly string[] = [
  "contracts",
  "signing",
  "snapshot",
  "play-client",
  "shell",
];

export const packageNameOf = (directory: string): string =>
  `@intraverse/se-client-${directory}`;

/** The npm lifecycle scripts; none may be in a published manifest. */
export const LIFECYCLE_SCRIPTS: readonly string[] = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "preprepare",
  "postprepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
  "publish",
  "postpublish",
  "preversion",
  "version",
  "postversion",
  "dependencies",
];

const DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** A registry version, written exactly (no range, tag, or protocol). */
const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

const ALWAYS_PACKED: ReadonlySet<string> = new Set([
  "package.json",
  "README.md",
  "LICENSE",
]);

const PREFIX = "package/";

export type PackedPackage = {
  /** The directory name under `packages/`: `contracts`, `shell`, ... */
  readonly name: string;
  /** The version the dry run expects (after `changeset version`). */
  readonly version: string;
  /** The entries of the tarball, gunzipped. */
  readonly entries: readonly TarEntry[];
};

type Manifest = {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly files?: unknown;
  readonly exports?: unknown;
  readonly scripts?: unknown;
} & Readonly<Record<string, unknown>>;

/** Every string target in an `exports` value (conditions included). */
const targetsOf = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(entry => targetsOf(entry));
  }
  return [];
};

/** The `exports` targets, split into the test-only entry's and the others. */
const exportTargetsOf = (
  name: string,
  exports: unknown,
): { published: string[]; testOnly: string[] } => {
  if (typeof exports !== "object" || exports === null) {
    return { published: targetsOf(exports), testOnly: [] };
  }
  const published: string[] = [];
  const testOnly: string[] = [];
  for (const [subpath, value] of Object.entries(exports)) {
    if (name === "contracts" && subpath === "./testing") {
      testOnly.push(...targetsOf(value));
    } else {
      published.push(...targetsOf(value));
    }
  }
  return { published, testOnly };
};

const manifestProblems = (
  pkg: PackedPackage,
  manifest: Manifest,
  files: ReadonlyMap<string, Buffer>,
): string[] => {
  const where = `${pkg.name}: package.json`;
  const problems: string[] = [];
  if (manifest.name !== packageNameOf(pkg.name)) {
    problems.push(
      `${where} names ${String(manifest.name)}, not ${packageNameOf(pkg.name)}`,
    );
  }
  if (manifest.version !== pkg.version) {
    problems.push(
      `${where} has version ${String(manifest.version)}, not ${pkg.version}`,
    );
  }
  const scripts =
    typeof manifest.scripts === "object" && manifest.scripts !== null
      ? Object.keys(manifest.scripts)
      : [];
  for (const script of scripts) {
    if (LIFECYCLE_SCRIPTS.includes(script)) {
      problems.push(`${where} has the lifecycle script ${script}`);
    }
  }
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    if (typeof dependencies !== "object" || dependencies === null) {
      problems.push(`${where} ${field} is not an object`);
      continue;
    }
    for (const [dependency, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== "string" || !EXACT_VERSION.test(specifier)) {
        problems.push(
          `${where} ${field} ${dependency} is ${JSON.stringify(specifier)}, not an exact version`,
        );
      }
    }
  }
  const selection = Array.isArray(manifest.files)
    ? manifest.files.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : undefined;
  if (selection === undefined) {
    problems.push(`${where} has no files field`);
  }
  for (const path of files.keys()) {
    if (ALWAYS_PACKED.has(path)) continue;
    if (!path.startsWith("dist/")) {
      problems.push(`${pkg.name}: ${path} is packed but is not under dist/`);
    } else if (selection !== undefined && !selectsPath(selection, path)) {
      problems.push(
        `${pkg.name}: ${path} is packed but files does not select it`,
      );
    }
  }
  const { testOnly } = exportTargetsOf(pkg.name, manifest.exports);
  for (const target of testOnly) {
    const path = target.replace(/^\.\//u, "");
    if (files.has(path)) {
      problems.push(
        `${pkg.name}: the test-only export target ${target} is packed`,
      );
    }
  }
  return problems;
};

/** The problems of one packed library; empty means it may be published. */
export const findTarballProblems = (
  pkg: PackedPackage,
  vectors: readonly Vector[],
): string[] => {
  const problems: string[] = [];
  const files = new Map<string, Buffer>();
  for (const entry of pkg.entries) {
    if (entry.type === "directory") continue;
    if (entry.type !== "file") {
      problems.push(
        `${pkg.name}: ${entry.path} is not a regular file (tar type ${JSON.stringify(entry.flag)})`,
      );
      continue;
    }
    const path = entry.path.startsWith(PREFIX)
      ? entry.path.slice(PREFIX.length)
      : undefined;
    if (
      path === undefined ||
      path.split("/").some(part => part === "" || part === "." || part === "..")
    ) {
      problems.push(`${pkg.name}: ${entry.path} is not a path under package/`);
      continue;
    }
    if (files.has(path)) {
      problems.push(`${pkg.name}: ${path} is packed twice`);
    }
    files.set(path, entry.bytes);
  }
  for (const required of ALWAYS_PACKED) {
    if (!files.has(required))
      problems.push(`${pkg.name}: ${required} is missing`);
  }
  if (pkg.name === "contracts") {
    for (const path of files.keys()) {
      if (/testing|vectors/iu.test(path)) {
        problems.push(
          `contracts: ${path} is packed (test-only entry or vectors)`,
        );
      }
    }
  }
  let manifest: Manifest = {};
  const manifestBytes = files.get("package.json");
  if (manifestBytes !== undefined) {
    try {
      manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
    } catch {
      problems.push(`${pkg.name}: package.json is not valid JSON`);
    }
  }
  problems.push(...manifestProblems(pkg, manifest, files));
  const dist = new Map(
    [...files]
      .filter(([path]) => path.startsWith("dist/"))
      .map(([path, bytes]) => [path.slice("dist/".length), bytes] as const),
  );
  const { published } = exportTargetsOf(pkg.name, manifest.exports);
  problems.push(
    ...findBuildOutputProblems([
      {
        name: pkg.name,
        files: new Map(
          [...dist].map(([path, bytes]) => [path, bytes.toString("utf8")]),
        ),
        exportTargets: published,
      },
    ]).map(problem => `tarball ${problem}`),
    // Every packed file is scanned, the root files included; the canary names
    // a file `<name>/dist/<path>`, and here the path is the tarball's.
    ...findCanaryProblems(vectors, [{ name: pkg.name, files }]).map(problem =>
      problem.replace(`${pkg.name}/dist/`, `${pkg.name} tarball: `),
    ),
  );
  return problems;
};
