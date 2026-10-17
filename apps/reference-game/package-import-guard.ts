import { isAbsolute } from "node:path";

import type { Plugin } from "vite";

// The reference game depends on no package at run time
// (specs/client-kit/the-reference-game.md): it takes only the controller
// protocol's types, with `import type` from
// `@intraverse/se-client-shell/controller`, and a type import is erased before
// Vite resolves anything. So, in a build, every bare specifier that reaches
// Vite's resolver is a runtime import of a package (a kit package, a
// third-party one, or a development tool such as `vite` itself), and the guard
// fails the build on it. Vite's own helper ids (`vite/...`, such as
// `vite/modulepreload-polyfill`) and virtual ids (`\0...`) are the only bare
// ids a build may resolve. The rule is scoped to the build so the component
// tests may import `vitest`; a kit package, and a file under the repository's
// `packages/` directory (a relative path into a package), are refused in the
// dev server and the tests too. The lint rule in .oxlintrc.json says the same
// at the source; this is the build-time proof.

const KIT_SCOPE = "@intraverse/";
const VITE_HELPER = "vite/";
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
  !isBareSpecifier(source) || source.startsWith(VITE_HELPER);

const fromWhere = (importer: string | undefined): string =>
  importer === undefined ? "" : ` (from ${importer})`;

export const packageImportGuard = (): Plugin => {
  const packagesDir = new URL("../../packages/", import.meta.url).pathname;
  let command: "build" | "serve" = "serve";
  return {
    name: "se-reference-game-package-import-guard",
    enforce: "pre",
    configResolved(config) {
      ({ command } = config);
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
      if (id.replaceAll("\\", "/").startsWith(packagesDir)) {
        this.error(
          `reference-game loads ${id}, a kit package's file; it takes only the controller types, with \`import type\` (specs/client-kit/the-reference-game.md)`,
        );
      }
      return null;
    },
  };
};
