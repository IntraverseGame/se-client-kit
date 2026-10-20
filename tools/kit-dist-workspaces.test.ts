import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";

import { workspacesOf } from "./fixtures/wireit-required.ts";
import {
  findMissingKitFiles,
  joinPath,
  kitDependencies,
  type KitManifest,
  type KitPackage,
} from "./kit-dist.ts";

// The repository's own manifests against the guard (issue #53,
// tools/kit-dist.ts). Every `typecheck`, `test`, and `build` of a workspace
// with a kit dependency runs the guard first, with its own script name, and
// lists the guard's files, unless it is declared below not to read any kit
// package's `dist/`. Its wireit dependencies build every kit package the guard
// checks and every workspace whose output it names by path, so a missing file
// can only mean a build that reported success without output.

const root = join(import.meta.dirname, "..");
const workspaces = workspacesOf(root);

/** Scripts that read no kit package's `dist/`, and why. */
const READS_NO_KIT_DIST: Readonly<Record<string, string>> = {
  "packages/play-client#build":
    "tsdown keeps kit packages external and writes declarations with oxc",
  "packages/shell#build":
    "tsdown keeps kit packages external and writes declarations with oxc",
  "packages/signing#build": "no kit dependency at run time",
  "packages/snapshot#build":
    "tsdown keeps kit packages external and writes declarations with oxc",
  "apps/reference-game#build":
    "type imports only; its package-import guard refuses a kit package",
  "apps/reference-game#test":
    "type imports only; its package-import guard refuses a kit package",
};

/** The files a script reads by path, relative to its workspace. */
const OWN_PATHS: Readonly<Record<string, readonly string[]>> = {
  "e2e#test": [
    "../apps/wrapper/dist/index.html",
    "../apps/reference-game/dist/index.html",
  ],
};

const SCRIPTS = ["typecheck", "test", "build"] as const;

const manifestAt = (directory: string): KitManifest =>
  (workspaces.find(w => w.directory === directory)?.manifest ??
    {}) as KitManifest;

const scriptOf = (directory: string, name: string) =>
  workspaces.find(w => w.directory === directory)?.manifest.wireit?.[name];

const byName: ReadonlyMap<string, string> = new Map(
  workspaces.flatMap(({ directory, manifest }) => {
    const { name } = manifest as { name?: string };
    return name === undefined ? [] : [[name, directory] as const];
  }),
);

/** Resolves a kit package by name from the workspace manifests. */
const resolve = (_from: string, name: string): KitPackage | undefined => {
  const directory = byName.get(name);
  return directory === undefined
    ? undefined
    : ({ directory, manifest: manifestAt(directory) } satisfies KitPackage);
};

const up = (directory: string): string =>
  directory
    .split("/")
    .map(() => "..")
    .join("/");

/** Every `<workspace>#<script>` that reads a kit package's `dist/`. */
const guarded = workspaces
  .filter(
    ({ manifest }) => kitDependencies(manifest as KitManifest, true).length > 0,
  )
  .flatMap(({ directory }) =>
    SCRIPTS.filter(
      name => scriptOf(directory, name)?.command !== undefined,
    ).map(name => `${directory}#${name}`),
  )
  .filter(key => READS_NO_KIT_DIST[key] === undefined)
  .toSorted();

const split = (key: string): readonly [string, string] => {
  const [directory = "", name = ""] = key.split("#");
  return [directory, name];
};

/**
 * The guard's arguments in a command, or undefined when it does not start with
 * it.
 */
const guardArguments = (key: string): string[] | undefined => {
  const [directory, name] = split(key);
  const command = scriptOf(directory, name)?.command ?? "";
  const prefix = `tsx ${up(directory)}/tools/check-kit-dist.ts `;
  const end = command.indexOf(" && ");
  return command.startsWith(prefix) && end > prefix.length
    ? command.slice(prefix.length, end).split(" ")
    : undefined;
};

/** What a script passes to the guard: its own name, then its own paths. */
const expectedArguments = (key: string): string[] => [
  split(key)[1],
  ...(OWN_PATHS[key] ?? []),
];

/** The workspace directories the guard checks for `directory`. */
const checkedBy = (directory: string): string[] => {
  const checked = new Set<string>();
  findMissingKitFiles(
    { directory, manifest: manifestAt(directory) },
    (from, name) => {
      const found = resolve(from, name);
      if (found !== undefined) checked.add(found.directory);
      return found;
    },
    () => false,
  );
  return [...checked].toSorted();
};

/** The workspace that holds `path` (relative to the root). */
const workspaceHolding = (path: string): string =>
  workspaces
    .map(({ directory }) => directory)
    .find(directory => path.startsWith(`${directory}/`)) ?? path;

/** The workspaces a script names files of, by path. */
const namedBy = (key: string): string[] =>
  (OWN_PATHS[key] ?? []).map(path =>
    workspaceHolding(posix.normalize(joinPath(split(key)[0], path))),
  );

/** The directories whose `build` a script's wireit dependencies reach. */
const builtBefore = (key: string): Set<string> => {
  const built = new Set<string>();
  const visit = (from: string, name: string): void => {
    for (const dependency of scriptOf(from, name)?.dependencies ?? []) {
      const [path = "", target = ""] = dependency.split(":");
      const to = posix.normalize(posix.join(from, path));
      if (target === "build" && !built.has(to)) {
        built.add(to);
        visit(to, "build");
      }
    }
  };
  visit(...split(key));
  return built;
};

describe("the scripts that read a kit package's dist", () => {
  it("are every typecheck, test, and build of a workspace with a kit dependency, but the declared ones", () => {
    expect(guarded).toEqual([
      "apps/reference-game#typecheck",
      "apps/verify#build",
      "apps/verify#test",
      "apps/verify#typecheck",
      "apps/wrapper#build",
      "apps/wrapper#test",
      "apps/wrapper#typecheck",
      "e2e#test",
      "e2e#typecheck",
      "packages/play-client#test",
      "packages/play-client#typecheck",
      "packages/shell#test",
      "packages/shell#typecheck",
      "packages/signing#test",
      "packages/signing#typecheck",
      "packages/snapshot#test",
      "packages/snapshot#typecheck",
    ]);
  });

  it("declare only scripts that exist as reading no kit dist", () => {
    const missing = Object.keys(READS_NO_KIT_DIST).filter(
      key => scriptOf(...split(key))?.command === undefined,
    );
    expect(missing).toEqual([]);
  });

  it.each(guarded)(
    "%s runs the guard first, with its name and own paths",
    key => {
      expect(guardArguments(key)).toEqual(expectedArguments(key));
    },
  );

  it.each(guarded.filter(key => scriptOf(...split(key))?.files !== undefined))(
    "%s lists the guard's files",
    key => {
      const directory = split(key)[0];
      expect(scriptOf(...split(key))?.files).toEqual(
        expect.arrayContaining([
          `${up(directory)}/tools/check-kit-dist.ts`,
          `${up(directory)}/tools/kit-dist.ts`,
          `${up(directory)}/tools/kit-dist-fs.ts`,
        ]),
      );
    },
  );

  it.each(guarded)(
    "%s depends on the build of everything the guard checks",
    key => {
      const needed = [...checkedBy(split(key)[0]), ...namedBy(key)];
      expect(needed.length).toBeGreaterThan(0);
      const built = builtBefore(key);
      expect(needed.filter(directory => !built.has(directory))).toEqual([]);
    },
  );

  it("reach the Snapshot from the Wrapper through the shell", () => {
    expect(checkedBy("apps/wrapper")).toEqual([
      "packages/contracts",
      "packages/play-client",
      "packages/shell",
      "packages/signing",
      "packages/snapshot",
    ]);
    expect(
      findMissingKitFiles(
        { directory: "apps/wrapper", manifest: manifestAt("apps/wrapper") },
        resolve,
        path => path !== "packages/snapshot/dist/index.js",
      ),
    ).toEqual([
      '@intraverse/se-client-snapshot: packages/snapshot/dist/index.js is missing (exports ".")',
    ]);
  });

  it("name the apps' builds for the e2e suite", () => {
    expect(namedBy("e2e#test")).toEqual([
      "apps/wrapper",
      "apps/reference-game",
    ]);
  });
});
