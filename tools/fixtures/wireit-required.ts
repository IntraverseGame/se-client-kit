// What each wireit script of the repository reads, worked out from the files on
// disk and from a few synthetic probes for files that do not exist yet (schemas
// and vectors of `contracts`, a Wrapper `public/` file). The test of
// tools/wireit-inputs.ts holds every script's `files` to these lists.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { findInputGaps, type WireitScript } from "../wireit-inputs.ts";

export type Manifest = {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly wireit?: Readonly<Record<string, WireitScript>>;
};

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  ".wireit",
  "coverage",
  "playwright-report",
  "test-results",
]);

/** Files that no script of a workspace reads. */
const NOT_AN_INPUT = /(?:^|\/)(?:README\.md|CHANGELOG\.md)$|\.tsbuildinfo$/u;

/**
 * Declared exclusions of a `build` script: a test file, which no entry reaches,
 * and the scratch fixture of the Wrapper's guard tests. A test file that
 * shipped code imports is outside the check; a lint rule keeps tests out of the
 * graph.
 */
const NOT_A_BUILD_INPUT: ReadonlyArray<RegExp | string> = [
  /\.test\.[cm]?[jt]sx?$/u,
  "src/fixtures/guard-scratch.ts",
];

/** Every file under `directory`, relative to it, without build output. */
export const filesBelow = (directory: string, prefix = ""): string[] =>
  readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(
    entry => {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.has(entry.name)
          ? []
          : filesBelow(directory, path);
      }
      return entry.isFile() ? [path] : [];
    },
  );

export type Workspace = {
  /** Relative to the repository root: `apps/wrapper`, `e2e`. */
  readonly directory: string;
  readonly manifest: Manifest;
};

/** The workspaces of `pnpm-workspace.yaml` (`packages/*`, `apps/*`, `e2e`). */
export const workspacesOf = (root: string): Workspace[] =>
  [
    ...["packages", "apps"].flatMap(group =>
      existsSync(join(root, group))
        ? readdirSync(join(root, group)).map(name => `${group}/${name}`)
        : [],
    ),
    "e2e",
  ]
    .filter(directory => existsSync(join(root, directory, "package.json")))
    .map(directory => ({
      directory,
      manifest: JSON.parse(
        readFileSync(join(root, directory, "package.json"), "utf8"),
      ) as Manifest,
    }));

const isExcluded = (
  path: string,
  exclusions: ReadonlyArray<RegExp | string>,
): boolean =>
  exclusions.some(rule =>
    typeof rule === "string" ? rule === path : rule.test(path),
  );

/** The path from a workspace to the repository root: `../..` or `..`. */
const up = (directory: string): string =>
  directory
    .split("/")
    .map(() => "..")
    .join("/");

const TYPESCRIPT_FILE = /\.(?:[cm]?tsx?|json)$/u;

/** The include entries of a workspace's tsconfig.json, as globs. */
const tsconfigIncludes = (root: string, directory: string): string[] => {
  const config = JSON.parse(
    readFileSync(join(root, directory, "tsconfig.json"), "utf8"),
  ) as { include?: string[] };
  return (config.include ?? []).map(entry =>
    !/[*?{]/u.test(entry) &&
    existsSync(join(root, directory, entry)) &&
    statSync(join(root, directory, entry)).isDirectory()
      ? `${entry}/**`
      : entry,
  );
};

/** Paths a workspace's `build`, `test`, or `typecheck` reads, by script. */
export const requiredInputs = (
  root: string,
  workspace: Workspace,
  script: "build" | "test" | "typecheck",
  matches: (patterns: readonly string[], path: string) => boolean,
): string[] => {
  const { directory } = workspace;
  const all = filesBelow(join(root, directory)).filter(
    path => !NOT_AN_INPUT.test(path),
  );
  const base = `${up(directory)}/tsconfig.base.json`;
  if (script === "typecheck") {
    const includes = tsconfigIncludes(root, directory);
    return [
      ...all.filter(
        path => TYPESCRIPT_FILE.test(path) && matches(includes, path),
      ),
      "package.json",
      "tsconfig.json",
      base,
    ];
  }
  const roots =
    script === "build" ? /^(?:src|public)\//u : /^(?:src|public|tests)\//u;
  const own = all.filter(path => !path.includes("/") || roots.test(path));
  const required = [...own, base];
  const tsdown = join(root, directory, "tsdown.config.ts");
  if (
    existsSync(tsdown) &&
    readFileSync(tsdown, "utf8").includes("tsdown.base")
  ) {
    required.push(`${up(directory)}/tsdown.base.ts`);
  }
  return script === "build"
    ? required.filter(path => !isExcluded(path, NOT_A_BUILD_INPUT))
    : required;
};

/**
 * Files that do not exist today and that a script must nevertheless pick up
 * when they appear: data next to the sources, and for a Vite app what Vite
 * copies from `public/`, the env files and the PostCSS config it loads, and the
 * workspace files it looks up from the repository root.
 */
export const probesFor = (
  script: "build" | "test" | "typecheck",
  vite: boolean,
  sourceRoot: "src" | "tests",
): string[] => {
  if (script === "typecheck") {
    return [`${sourceRoot}/probe/data.json`, `${sourceRoot}/probe.d.ts`];
  }
  const data = [
    "src/probe/data.json",
    "src/probe/style.css",
    "src/probe/image.svg",
    "src/probe/deep/er/data.bin",
  ];
  const app = vite
    ? [
        "public/probe.json",
        "public/probe/dir/a.bin",
        ".env",
        "../../package.json",
        "../../pnpm-workspace.yaml",
      ]
    : [];
  return script === "build"
    ? [
        ...data,
        ...app,
        ...(vite ? [".env.production.local", "postcss.config.js"] : []),
      ]
    : [
        ...data,
        ...app,
        ...(vite ? [".env.test"] : []),
        "probe.ts",
        "src/fixtures/probe.json",
      ];
};

const SCRIPTS = ["build", "test", "typecheck"] as const;

/**
 * Every `build`, `test`, and `typecheck` script of a workspace that has
 * `files`, with the problems found in it (empty when it lists everything its
 * command reads). A script with a command and no `files` is left out here and
 * is checked by `uncachedScripts`.
 */
export const workspaceProblems = (
  root: string,
  matches: (patterns: readonly string[], path: string) => boolean,
): ReadonlyArray<readonly [string, string[]]> =>
  workspacesOf(root).flatMap(workspace => {
    const vite = existsSync(join(root, workspace.directory, "index.html"));
    const sourceRoot = existsSync(join(root, workspace.directory, "src"))
      ? "src"
      : "tests";
    return SCRIPTS.flatMap(script => {
      const config = workspace.manifest.wireit?.[script];
      return config?.files === undefined
        ? []
        : [
            [
              `${workspace.directory}#${script}`,
              findInputGaps(script, config, [
                ...requiredInputs(root, workspace, script, matches),
                ...probesFor(script, vite, sourceRoot),
              ]),
            ] as const,
          ];
    });
  });

/** The `files` of one script of a workspace, or none. */
export const workspaceFiles = (
  root: string,
  directory: string,
  script: string,
): readonly string[] =>
  workspacesOf(root).find(workspace => workspace.directory === directory)
    ?.manifest.wireit?.[script]?.files ?? [];

/** Every script (root and workspaces) that has a command and no `files`. */
export const uncachedScripts = (
  root: string,
  rootManifest: Manifest,
): string[] =>
  [
    ...Object.entries(rootManifest.wireit ?? {}),
    ...workspacesOf(root).flatMap(({ directory, manifest }) =>
      Object.entries(manifest.wireit ?? {}).map(
        ([name, config]) => [`${directory}#${name}`, config] as const,
      ),
    ),
  ]
    .filter(
      ([, config]) =>
        config.command !== undefined && config.files === undefined,
    )
    .map(([name]) => name)
    .toSorted();
