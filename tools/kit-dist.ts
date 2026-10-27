// The guard that runs before every script that reads a kit package's `dist/`
// (issue #53): a workspace's `typecheck`, its `test`, and the Wrapper's Vite
// `build`, and the e2e suite's run. Every file that the workspace's kit
// dependencies name in `exports`, directly or through another kit package,
// exists: the `types` targets that tsc resolves and the JavaScript targets that
// Vite, Vitest, and Node resolve. Each comes from that package's wireit `build`,
// a dependency of the script. A script may also name files of its own to check
// (the e2e suite serves the apps' `dist/` by path, not through `exports`).
//
// Why the build's success is not enough: with `WIREIT_CACHE=github` (which CI
// no longer uses, #53), wireit 0.14.13 deletes a script's output before it
// downloads the cached tarball, and when the download fails it logs a
// `cache-info` line (which the default CI logger drops) and then reports the
// script as restored from the cache, with no output at all
// (`GitHubActionsCacheHit.apply`; google/wireit#1536, fixed in 0.15.0). It also
// records the script as fresh, so later runs in the same checkout skip it until
// `pnpm clean:cache`. A missing wireit dependency fails the same way. The tool
// that reads the missing file then fails with an error that names no cause (one
// TS2307 per import, a failed import). This check names the missing files
// instead, and fails before the tool runs.
//
// A kit dependency is one named with a `workspace:` specifier. The consumer's
// `dependencies`, `devDependencies`, and `peerDependencies` count (its tests
// and tools use them too); for a package reached through another, only
// `dependencies` and `peerDependencies`, which are what its `dist/` imports.
//
// These checks are pure: they take a resolver and a file test.
// tools/kit-dist-fs.ts holds their file-system versions and `runKitDistCheck`,
// which tools/check-kit-dist.ts runs.

export type KitManifest = {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
};

export type KitPackage = {
  /** Relative to the repository root, with `/` separators: `packages/shell`. */
  readonly directory: string;
  readonly manifest: KitManifest;
};

/**
 * The kit package `name` as the workspace in `from` (relative to the root)
 * resolves it, a problem when its manifest cannot be read, or `undefined` when
 * it is not linked there.
 */
export type ResolvePackage = (
  from: string,
  name: string,
) => KitPackage | { readonly problem: string } | undefined;

/** Whether `path` (relative to the root) is an existing file. */
export type FileExists = (path: string) => boolean;

export type ExportTarget = {
  /** The `exports` subpath: `.`, `./controller`. */
  readonly subpath: string;
  /** The target, relative to the package: `dist/index.d.ts`. */
  readonly target: string;
};

/** The kit packages a manifest names with a `workspace:` specifier, sorted. */
export const kitDependencies = (
  manifest: KitManifest,
  own: boolean,
): string[] => {
  const groups = [
    manifest.dependencies,
    manifest.peerDependencies,
    ...(own ? [manifest.devDependencies] : []),
  ];
  const names = groups.flatMap(group =>
    Object.entries(group ?? {})
      .filter(([, specifier]) => specifier.startsWith("workspace:"))
      .map(([name]) => name),
  );
  return [...new Set(names)].toSorted();
};

const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(entry => stringsIn(entry));
  }
  return [];
};

/**
 * The subpaths of an `exports` value with their values. A string, an array, or
 * a top-level conditions object (no key starting with `.`) is the `.` subpath.
 */
const subpathsOf = (
  exports: unknown,
): ReadonlyArray<readonly [string, unknown]> => {
  if (exports === undefined || exports === null) return [];
  return typeof exports === "object" &&
    !Array.isArray(exports) &&
    Object.keys(exports).some(key => key.startsWith("."))
    ? Object.entries(exports)
    : [[".", exports]];
};

const containsArray = (value: unknown): boolean =>
  Array.isArray(value) ||
  (typeof value === "object" &&
    value !== null &&
    Object.values(value).some(entry => containsArray(entry)));

/**
 * The forms of `exports` the guard does not model, so it refuses them instead
 * of reading them literally: a subpath pattern (`"./*"`, a key or a target with
 * `*`) and a fallback array.
 */
export const unsupportedExports = (exports: unknown): string[] => {
  const forms: string[] = [];
  for (const [subpath, value] of subpathsOf(exports)) {
    const pattern =
      subpath.includes("*") ||
      stringsIn(value).some(target => target.includes("*"));
    if (pattern) forms.push(`the subpath pattern "${subpath}"`);
    if (containsArray(value)) forms.push(`a fallback array in "${subpath}"`);
  }
  return forms;
};

/**
 * Every file target of an `exports` value (every condition: `types`, `default`,
 * `import`, ...), with its subpath, without repeats. Read `unsupportedExports`
 * first: a pattern or an array is read literally here.
 */
export const exportTargets = (exports: unknown): ExportTarget[] =>
  subpathsOf(exports).flatMap(([subpath, value]) =>
    [...new Set(stringsIn(value))].map(target => ({
      subpath,
      target: target.replace(/^\.\//u, ""),
    })),
  );

/** `path` below `directory`, both relative to the root. */
export const joinPath = (directory: string, path: string): string =>
  directory === "" || directory === "." ? path : `${directory}/${path}`;

/**
 * The problems found before a script of `consumer` runs: a kit dependency that
 * is not linked or whose manifest cannot be read, one without `exports` or with
 * a form of `exports` the guard does not model, and every `exports` target that
 * does not exist. Each kit package is visited once, in breadth-first order from
 * the consumer.
 */
export const findMissingKitFiles = (
  consumer: KitPackage,
  resolve: ResolvePackage,
  exists: FileExists,
): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  const queue = kitDependencies(consumer.manifest, true).map(name => ({
    from: consumer.directory,
    name,
  }));
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const { from, name } = next;
    if (seen.has(name)) continue;
    seen.add(name);
    const found = resolve(from, name);
    if (found === undefined) {
      problems.push(
        `${name}: not linked in ${joinPath(from, "node_modules")} (run \`pnpm install --frozen-lockfile\`)`,
      );
      continue;
    }
    if ("problem" in found) {
      problems.push(found.problem);
      continue;
    }
    const unsupported = unsupportedExports(found.manifest.exports);
    for (const form of unsupported) {
      problems.push(
        `${name}: its exports use ${form}, which the guard does not model`,
      );
    }
    const targets =
      unsupported.length > 0 ? [] : exportTargets(found.manifest.exports);
    if (unsupported.length === 0 && targets.length === 0) {
      problems.push(`${name}: its package.json has no exports`);
    }
    for (const { subpath, target } of targets) {
      const path = joinPath(found.directory, target);
      if (!exists(path)) {
        problems.push(`${name}: ${path} is missing (exports "${subpath}")`);
      }
    }
    for (const dependency of kitDependencies(found.manifest, false)) {
      queue.push({ from: found.directory, name: dependency });
    }
  }
  return problems;
};

/** The problems for the files a script names itself (relative to the root). */
export const findMissingOwnFiles = (
  paths: readonly string[],
  exists: FileExists,
): string[] =>
  paths
    .filter(path => !exists(path))
    .map(path => `${path}: is missing (named by the script)`);

/** The message for a failed check, one line per problem plus what to do. */
export const formatMissingKitFiles = (
  script: string,
  consumerDirectory: string,
  problems: readonly string[],
): string =>
  [
    `The ${script} of ${consumerDirectory} reads the build output of other workspaces, and these files are missing:`,
    ...problems.map(problem => `  ${problem}`),
    `Each comes from a wireit build that this ${script} depends on, which reported success without leaving it.`,
    "With wireit's GitHub Actions cache (WIREIT_CACHE=github), a failed tarball download does this (#53); CI runs with no task cache, so there look first for a missing wireit dependency.",
    "The log of the job (WIREIT_LOGGER=simple) shows whether the build ran, was restored from a cache, or was already fresh.",
    "Locally: `pnpm clean:cache && pnpm build` (after a failed restore wireit records the build as fresh, so `pnpm build` alone skips it).",
    "See runbook/development/ci-failures.md.",
  ].join("\n");
