// What each root wireit script reads, worked out from the files on disk and from
// a few synthetic probes (see wireit-required.ts for the workspace scripts).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { findFiles } from "../workspace.ts";
import { filesBelow, workspacesOf } from "./wireit-required.ts";

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;

const everything = (root: string): string[] => findFiles(root, () => true);

const underTools = (root: string): string[] =>
  everything(root).filter(path => path.startsWith("tools/"));

const manifests = (root: string): string[] =>
  everything(root).filter(path => path.endsWith("package.json"));

const withTsconfigs = ["tsconfig.json", "tsconfig.base.json", "package.json"];

const distFiles = (root: string): string[] =>
  ["packages", "apps"].flatMap(group =>
    existsSync(join(root, group))
      ? readdirSync(join(root, group)).flatMap(name => {
          const dist = join(root, group, name, "dist");
          return existsSync(dist)
            ? readdirSync(dist, { recursive: true, withFileTypes: true })
                .filter(entry => entry.isFile())
                .map(entry =>
                  join(
                    group,
                    name,
                    "dist",
                    entry.parentPath.slice(dist.length),
                    entry.name,
                  ),
                )
            : [];
        })
      : [],
  );

/**
 * Every file of every workspace, by path relative to the root, without build
 * output and build state (what `filesBelow` skips, and `.tsbuildinfo` files).
 */
const workspaceTrees = (
  root: string,
  workspaces: readonly string[],
): string[] =>
  workspaces.flatMap(directory =>
    filesBelow(join(root, directory))
      .filter(path => !path.endsWith(".tsbuildinfo"))
      .map(path => `${directory}/${path}`),
  );

/**
 * The root scripts that have `files`, and the paths each of their commands
 * reads. The commands: oxfmt (everything), oxlint (the sources and its config,
 * `.gitignore`, the manifests and tsconfigs), stylelint (the CSS, its config,
 * `.gitignore`), tsc over the tools, vitest over the tools (which also read the
 * READMEs, specs, ADRs, and configs the tests check, and every workspace file
 * the input audit walks), and the tsx scripts.
 */
export const rootRequirements = (
  root: string,
): ReadonlyArray<readonly [string, string[]]> => {
  const sources = findFiles(root, path => SOURCE_FILE.test(path));
  const tools = underTools(root);
  const workspaces = workspacesOf(root).map(({ directory }) => directory);
  return [
    [
      "format:check",
      everything(root).filter(path => path !== "pnpm-lock.yaml"),
    ],
    [
      "lint:ts",
      [
        ...sources,
        ".oxlintrc.json",
        ".gitignore",
        ...manifests(root),
        ...workspaces.map(directory => `${directory}/tsconfig.json`),
        "tsconfig.json",
        "tsconfig.base.json",
        "tools/probe.mts",
        "packages/probe/src/probe.jsx",
        "tools/allowed-dependencies.json",
      ],
    ],
    [
      "lint:css",
      [
        ...findFiles(root, path => path.endsWith(".css")),
        "stylelint.config.mjs",
        ".gitignore",
        "package.json",
        "apps/wrapper/src/probe/style.css",
      ],
    ],
    [
      "typecheck:tools",
      [
        ...tools,
        "vitest.config.ts",
        "vitest.readmes.config.ts",
        "tsdown.base.ts",
        ...withTsconfigs,
        ...workspaces.flatMap(directory => [
          `${directory}/package.json`,
          ...(existsSync(join(root, directory, "tsdown.config.ts"))
            ? [`${directory}/tsdown.config.ts`]
            : []),
        ]),
      ],
    ],
    [
      "test:tools",
      [
        ...tools,
        "vitest.config.ts",
        "tsdown.base.ts",
        ".oxlintrc.json",
        "stylelint.config.mjs",
        ".gitignore",
        ".changeset/config.json",
        "pnpm-workspace.yaml",
        ...withTsconfigs,
        "CONTRIBUTING.md",
        "README.md",
        "specs/client-kit.md",
        "specs/probe.md",
        "decisions/ADR-001-toolchain-and-signing.md",
        "runbook/development/probe.md",
        ...workspaces.flatMap(directory => [
          `${directory}/package.json`,
          ...(existsSync(join(root, directory, "README.md"))
            ? [`${directory}/README.md`]
            : []),
        ]),
        // The input audit (wireit-inputs.test.ts) derives what each workspace
        // script reads from every file of every workspace, so all of them are
        // inputs of the suite that runs it: a new file must re-run the audit.
        ...workspaceTrees(root, workspaces),
        "packages/probe/helper.ts",
        "packages/shell/probe/deep/data.json",
        "apps/probe/.env.local",
        "e2e/probe/helper.ts",
      ],
    ],
    [
      "check:deps",
      [
        ...manifests(root),
        ...tools,
        "pnpm-workspace.yaml",
        "tsconfig.json",
        "tsconfig.base.json",
      ],
    ],
    [
      "check:contracts",
      [
        ...sources,
        ...tools,
        "packages/probe/src/probe.jsx",
        "packages/probe/src/probe.cjsx",
        ...withTsconfigs,
      ],
    ],
    [
      "check:build-output",
      [
        ...tools.filter(path => !path.endsWith(".test.ts")),
        ...workspaces
          .filter(directory => directory !== "e2e")
          .map(directory => `${directory}/package.json`),
        ...withTsconfigs,
        "packages/contracts/src/probe/vectors/v.json",
        "packages/contracts/src/vectors/v.json",
        "packages/contracts/dist/testing.js",
        "apps/wrapper/dist/assets/probe.js",
        ...distFiles(root),
      ],
    ],
    [
      "check:package-files",
      [
        ...tools.filter(path => !path.endsWith(".test.ts")),
        ...workspaces
          .filter(directory => directory.startsWith("packages/"))
          .map(directory => `${directory}/package.json`),
        ...withTsconfigs,
        "packages/contracts/dist/runtime/probe-a1.js",
        "packages/contracts/dist/chunks/probe-b2.js",
        ...distFiles(root).filter(path => path.startsWith("packages/")),
      ],
    ],
  ];
};
