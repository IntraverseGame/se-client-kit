// Wireit edges a script's `files` cannot express:
//
// - lint:ts runs oxlint's import plugin, which follows an import of another
//   kit package through its `package.json` `exports` into that package's
//   `dist/` and opens the files there. A package build running at the same
//   time (wireit cleans its output first) makes the lint fail on a file it had
//   just found, so lint:ts depends on the build of every package.
// - e2e's test script reads environment variables (its command and any of
//   `e2e/**/*.ts`); each is declared in its `env`, so a cache key would follow
//   them if the script ever gets `files`. The scan finds `process.env["X"]`
//   only: it relies on `noPropertyAccessFromIndexSignature`
//   (tsconfig.base.json, which e2e's tsconfig extends), which makes
//   `process.env.X` a type error, so no read can take the other form.
// - The two Vite builds (the Wrapper's and the reference game's) declare
//   `NODE_ENV` as an external `env`: `NODE_ENV=development vite build` makes a
//   development build, so the cache must not restore one for the other value.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findFiles } from "./workspace.ts";

const root = join(import.meta.dirname, "..");

type Script = {
  readonly command?: string;
  readonly dependencies?: readonly (string | { readonly script: string })[];
  readonly env?: Readonly<Record<string, unknown>>;
};

const wireitOf = (directory: string): Readonly<Record<string, Script>> => {
  const manifest = JSON.parse(
    readFileSync(join(root, directory, "package.json"), "utf8"),
  ) as { readonly wireit?: Readonly<Record<string, Script>> };
  return manifest.wireit ?? {};
};

const dependencyNames = (script: Script | undefined): string[] =>
  (script?.dependencies ?? []).map(dependency =>
    typeof dependency === "string" ? dependency : dependency.script,
  );

/** The `./packages/<name>:build` of every package that has a build script. */
const packageBuilds = (): string[] =>
  readdirSync(join(root, "packages"))
    .filter(name => existsSync(join(root, "packages", name, "package.json")))
    .filter(name => wireitOf(`packages/${name}`)["build"] !== undefined)
    .map(name => `./packages/${name}:build`)
    .toSorted();

/** The names of a pattern's first group in `text`. */
const namesIn = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)]
    .map(match => match[1])
    .filter((name): name is string => name !== undefined);

const e2eTest = (): Script | undefined => wireitOf("e2e")["test"];

/**
 * What e2e's test script reads: the shell variables of its command (`${X...}`)
 * and `process.env["X"]` in every `.ts` file of e2e.
 */
const e2eReads = (): string[] => {
  const e2e = join(root, "e2e");
  const sources = findFiles(e2e, path => path.endsWith(".ts")).map(path =>
    readFileSync(join(e2e, path), "utf8"),
  );
  return [
    ...new Set([
      ...namesIn(e2eTest()?.command ?? "", /\$\{([A-Z0-9_]+)/gu),
      ...sources.flatMap(text =>
        namesIn(text, /process\.env\["([A-Z0-9_]+)"\]/gu),
      ),
    ]),
  ].toSorted();
};

/** The Vite builds: the apps whose build command runs `vite build`. */
const viteBuilds = (): string[] =>
  readdirSync(join(root, "apps"))
    .filter(name => existsSync(join(root, "apps", name, "package.json")))
    .filter(name =>
      (wireitOf(`apps/${name}`)["build"]?.command ?? "").includes("vite build"),
    )
    .toSorted();

const declaredEnv = (script: Script | undefined): string[] =>
  Object.keys(script?.env ?? {}).toSorted();

describe("wireit edges", () => {
  it("lint:ts depends on the build of every package", () => {
    const builds = packageBuilds();
    expect(builds.length).toBeGreaterThan(0);
    expect(dependencyNames(wireitOf(".")["lint:ts"]).toSorted()).toEqual(
      expect.arrayContaining(builds),
    );
  });

  it("e2e's test script declares every environment variable it reads", () => {
    const read = e2eReads();
    expect(read).toEqual(["CI", "SE_E2E_BROWSER_CHANNEL", "SE_E2E_PROJECT"]);
    expect(declaredEnv(e2eTest())).toEqual(read);
  });

  it("the Vite builds declare NODE_ENV as an external env", () => {
    const apps = viteBuilds();
    expect(apps).toEqual(["reference-game", "wrapper"]);
    for (const app of apps) {
      expect(wireitOf(`apps/${app}`)["build"]?.env).toEqual({
        NODE_ENV: { external: true },
      });
    }
  });
});
