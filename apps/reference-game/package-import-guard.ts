import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

// The reference game depends on no package at run time
// (specs/client-kit/the-reference-game.md): it takes only the controller
// protocol's types, with `import type` from
// `@intraverse/se-client-shell/controller`, and a type import is erased before
// Vite resolves anything. So, in a build, every bare specifier that reaches
// Vite's resolver is a runtime import of a package (a kit package, a
// third-party one, or a development tool such as `vite` itself), and the guard
// fails the build on it. The bare ids a build may resolve are Vite's own
// helper ids, exactly those its build emits (`VITE_HELPERS`; any other
// `vite/...` id, such as `vite/module-runner`, is a package import), and
// virtual ids (`\0...`). The rule is scoped to the build so the component
// tests may import `vitest`; a kit package, and a file under the repository's
// `packages/` directory (a relative path into a package), are refused in the
// dev server and the tests too. A file under `packages/` that Vite copies into
// the build as an asset (a `new URL(..., import.meta.url)`, a CSS `url()`, an
// HTML `src` or `href`) is not loaded as a module, so `load` never sees it; the
// guard refuses it when the bundle is generated, from the asset's original
// file name (resolved through symlinks). A worker's module graph is built with
// `worker.plugins` only, so the game's Vite configuration lists the guard
// there too. The lint rule in .oxlintrc.json says the same at the source; this
// is the build-time proof.

const KIT_SCOPE = "@intraverse/";
/**
 * The bare helper ids Vite 8's build emits, found from real builds: the module
 * preload polyfill (injected for an HTML entry). Its other helpers
 * (`\0vite/preload-helper.js`, `\0rolldown_dynamic_import_helper.js`) are
 * virtual ids. A Vite upgrade that adds one fails the game's build test.
 */
export const VITE_HELPERS: ReadonlySet<string> = new Set([
  "vite/modulepreload-polyfill",
]);
const VIRTUAL = "\0";
const WINDOWS_PATH = /^[A-Za-z]:[\\/]/u;

/** A specifier that names a package, not a path or a virtual module. */
export const isBareSpecifier = (source: string): boolean =>
  !source.startsWith(".") &&
  !source.startsWith("/") &&
  !source.startsWith(VIRTUAL) &&
  !isAbsolute(source) &&
  !WINDOWS_PATH.test(source);

/** Whether a build may resolve `source`: a path, a virtual id, or Vite's own. */
export const isAllowedInBuild = (source: string): boolean =>
  !isBareSpecifier(source) || VITE_HELPERS.has(source);

/**
 * The repository's `packages/` directory, with a trailing separator, for the
 * guard module at `moduleUrl`: a file-system path (`fileURLToPath`), so a
 * checkout path with a space or a non-ASCII character, or on Windows, matches.
 */
export const packagesDirFor = (moduleUrl: string): string =>
  fileURLToPath(new URL("../../packages/", moduleUrl));

/** Whether `path` lies under `directory` (which ends in a separator). */
export const isUnder = (directory: string, path: string): boolean =>
  path.replaceAll("\\", "/").startsWith(directory.replaceAll("\\", "/"));

/** `path` with its symlinks resolved, or as it is when it cannot be read. */
const realPathOf = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

const fromWhere = (importer: string | undefined): string =>
  importer === undefined ? "" : ` (from ${importer})`;

export const packageImportGuard = (): Plugin => {
  const packagesDir = packagesDirFor(import.meta.url);
  let command: "build" | "serve" = "serve";
  let root = process.cwd();
  const inPackages = (path: string): boolean => isUnder(packagesDir, path);
  return {
    name: "se-reference-game-package-import-guard",
    enforce: "pre",
    configResolved(config) {
      ({ command, root } = config);
    },
    resolveId(source, importer) {
      if (source.startsWith(KIT_SCOPE)) {
        this.error(
          `reference-game imports ${source} at run time${fromWhere(importer)}; it takes only the controller types, with \`import type\` (specs/client-kit/the-reference-game.md)`,
        );
      }
      if (command === "build" && !isAllowedInBuild(source)) {
        this.error(
          `reference-game imports the package ${source} at run time${fromWhere(importer)}; the game depends on no package (specs/client-kit/the-reference-game.md)`,
        );
      }
      return null;
    },
    load(id) {
      if (inPackages(id)) {
        this.error(
          `reference-game loads ${id}, a kit package's file; it takes only the controller types, with \`import type\` (specs/client-kit/the-reference-game.md)`,
        );
      }
      return null;
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset") continue;
        for (const original of file.originalFileNames) {
          const path = resolve(root, original);
          if (inPackages(realPathOf(path))) {
            this.error(
              `reference-game copies ${original} into its build as ${file.fileName}, a kit package's file; it takes only the controller types, with \`import type\` (specs/client-kit/the-reference-game.md)`,
            );
          }
        }
      }
    },
  };
};
