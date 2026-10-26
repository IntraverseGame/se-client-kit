// Shared by the checks that keep the e2e suite's preview mode out of `pnpm check`
// and out of the fake projects (RFC-002; the `e2e-preview-*.test.ts` files): the
// wireit script graph, the Playwright config loaded as Playwright loads it, the
// import graph of `e2e/tests/`, and the processes the launcher is proven with.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

import { vi } from "vitest";

import { findFiles } from "./workspace.ts";

export const root = join(import.meta.dirname, "..");
export const e2e = join(root, "e2e");
export const testsDirectory = join(e2e, "tests");

// --- the scripts ------------------------------------------------------------

export type Script = {
  readonly command?: string;
  readonly dependencies?: readonly (string | { readonly script: string })[];
  readonly env?: Readonly<Record<string, unknown>>;
  readonly files?: readonly string[];
  readonly output?: readonly string[];
};

export const manifestOf = (directory: string): Record<string, Script> => {
  const manifest = JSON.parse(
    readFileSync(join(root, directory, "package.json"), "utf8"),
  ) as { readonly wireit?: Record<string, Script> };
  return manifest.wireit ?? {};
};

const nameOf = (dependency: string | { readonly script: string }): string =>
  typeof dependency === "string" ? dependency : dependency.script;

/** A dependency as `<directory>:<name>` from the package at `directory`. */
const keyOf = (directory: string, name: string): string => {
  // `./e2e:test:preview` is another package's script: the directory is up to the
  // first `:`. Any other is a script of the same package, whose name can hold
  // colons (`format:check`).
  const cut = name.indexOf(":");
  return name.startsWith(".")
    ? `${join(directory, name.slice(0, cut))}:${name.slice(cut + 1)}`
    : `${directory}:${name}`;
};

/** The scripts `start` needs, each as `<directory>:<name>` (`.` is the root). */
export const closureOf = (start: string): ReadonlySet<string> => {
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const separator = key.indexOf(":");
    const directory = key.slice(0, separator);
    const script = manifestOf(directory)[key.slice(separator + 1)];
    for (const dependency of script?.dependencies ?? []) {
      visit(keyOf(directory, nameOf(dependency)));
    }
  };
  visit(start);
  return seen;
};

/** The `env` a script declares (empty when it declares none). */
export const environmentOf = (
  directory: string,
  script: string,
): Readonly<Record<string, unknown>> =>
  manifestOf(directory)[script]?.env ?? {};

/** The names of the variables a script declares. */
export const declaredEnvironment = (
  directory: string,
  script: string,
): readonly string[] => Object.keys(environmentOf(directory, script));

/** The scripts of `directories` whose dependencies mention `preview`. */
export const scriptsDependingOnPreview = (
  directories: readonly string[],
): readonly string[] =>
  directories.flatMap(directory =>
    Object.entries(manifestOf(directory))
      .filter(([, script]) =>
        (script.dependencies ?? []).some(dependency =>
          JSON.stringify(dependency).includes("preview"),
        ),
      )
      .map(([name]) => `${directory}:${name}`),
  );

// --- the config -------------------------------------------------------------

export type Project = {
  readonly name: string;
  readonly testMatch?: unknown;
  readonly testIgnore?: unknown;
  readonly use?: {
    readonly launchOptions?: {
      readonly args?: readonly string[];
      readonly env?: Readonly<Record<string, string>>;
    } & Record<string, unknown>;
  };
};

export type Config = {
  readonly projects: readonly Project[];
  readonly globalSetup?: string;
  readonly globalTimeout?: number;
};

export const PREVIEW_VARIABLES: Readonly<Record<string, string>> = {
  SE_E2E_PREVIEW_ORIGIN: "https://preview.example.test",
  SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
  SE_E2E_PREVIEW_GAME_ORIGIN: "https://game.example-games.test",
  SE_E2E_PREVIEW_ALLOWED_ORIGINS: "https://rpc.example.test",
};

export const ENTERED: Readonly<Record<string, string>> = {
  ...PREVIEW_VARIABLES,
  SE_E2E_PREVIEW_ENTRY: "script",
};

const configUrl = pathToFileURL(join(e2e, "playwright.config.ts")).href;

const savedEnvironment = { ...process.env };
const savedArgv = [...process.argv];

/** Puts the process environment and command line back as the test run had them. */
export const restoreProcess = (): void => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnvironment)) Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, savedEnvironment);
  process.argv = [...savedArgv];
};

/** Loads the real config file with this environment and command line. */
export const loadConfig = async (
  environment: Readonly<Record<string, string>>,
  argv: readonly string[],
): Promise<Config> => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SE_E2E_")) Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, environment);
  process.argv = ["node", "playwright", ...argv];
  vi.resetModules();
  return ((await import(configUrl)) as { readonly default: Config }).default;
};

export const fakeProjects = (config: Config): readonly Project[] =>
  config.projects.filter(project => project.name !== "preview");

export const previewProject = (config: Config): Project | undefined =>
  config.projects.find(project => project.name === "preview");

/** The browser environment names the test process can supply (the allow-list's). */
export const suppliedBrowserNames = (): readonly string[] =>
  ["HOME", "LANG", "PATH", "TMPDIR"].filter(name => name in process.env);

/** The names of the environment the project's browser gets. */
export const browserNamesOf = (
  project: Project | undefined,
): readonly string[] =>
  Object.keys(project?.use?.launchOptions?.env ?? {}).toSorted();

export const launchOptionsOf = (
  projects: readonly Project[],
): readonly unknown[] => projects.map(project => project.use?.launchOptions);

// --- the import graph -------------------------------------------------------

/** The relative modules `text` imports; `valuesOnly` leaves out type-only ones. */
export const importsOf = (
  text: string,
  valuesOnly: boolean,
): readonly string[] => {
  const statement =
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;"']*?\s+from\s+)?"(\.[^"]+)"/gu;
  const statements = [...text.matchAll(statement)]
    .filter(match => !(valuesOnly && match[1] !== undefined))
    .map(match => match[2]);
  const dynamic = [...text.matchAll(/import\("(\.[^"]+)"\)/gu)].map(
    match => match[1],
  );
  return [...statements, ...dynamic].filter(
    (specifier): specifier is string => specifier !== undefined,
  );
};

export const sources: ReadonlyMap<string, string> = new Map(
  findFiles(testsDirectory, path => path.endsWith(".ts")).map(path => [
    path,
    readFileSync(join(testsDirectory, path), "utf8"),
  ]),
);

const directImports = (path: string, valuesOnly: boolean): readonly string[] =>
  importsOf(sources.get(path) ?? "", valuesOnly)
    .map(specifier => normalize(join(dirname(path), specifier)))
    .filter(target => sources.has(target));

/** Every file `start` reaches through imports, itself excluded. */
export const reachableFrom = (
  start: string,
  valuesOnly: boolean,
): readonly string[] => {
  const seen = new Set<string>();
  const visit = (path: string): void => {
    for (const target of directImports(path, valuesOnly)) {
      if (!seen.has(target)) {
        seen.add(target);
        visit(target);
      }
    }
  };
  visit(start);
  return [...seen];
};

export const inDirectory = (directory: string, path: string): boolean =>
  path.startsWith(`${directory}/`);

/** Whether the file `path` of `tests/` names `process.env`. */
export const readsProcessEnvironment = (path: string): boolean =>
  /process\.env\b/u.test(
    (sources.get(path) ?? "")
      .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
      .replaceAll(/^\s*\/\/.*$/gmu, ""),
  );

export const filesIn = (directory: string): readonly string[] =>
  [...sources.keys()].filter(path => inDirectory(directory, path));

// --- the processes ----------------------------------------------------------

const require = createRequire(join(e2e, "package.json"));
export const playwrightCli = require.resolve("@playwright/test/cli");
export const tsx = join(root, "node_modules", ".bin", "tsx");

/** The process environment without any `SE_E2E_*` variable, plus `extra`. */
export const cleanEnvironment = (
  extra: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("SE_E2E_")),
  ),
  ...extra,
});

export type Outcome = {
  readonly status: number | null;
  readonly output: string;
};

export const run = (
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Outcome => {
  const result = spawnSync(command, [...args], {
    cwd: e2e,
    env: environment,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

/** Lists the specs of `project` as Playwright does. */
export const listed = (
  environment: NodeJS.ProcessEnv,
  project: string,
): Outcome =>
  run(
    process.execPath,
    [playwrightCli, "test", `--project=${project}`, "--list"],
    environment,
  );
