// Scratch Vite builds for the package-import guard's tests (build.test.ts and
// package-import-guard.test.ts): a scratch project under `tmpdir()`, built in
// memory with the game's own configuration (its guard, its worker guard, and
// its inline limit). The scratch root holds a stand-in third-party package,
// `scratch-dep`, under `node_modules`, so a bare import resolves there and only
// the guard can refuse it. Nothing is written to disk but the scratch sources.

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { build } from "vite";

export const appRoot = join(import.meta.dirname, "..", "..");

/** A file of a kit package, by its path below `packages/`. */
export const kitPackageFile = (...segments: string[]): string =>
  join(appRoot, "..", "..", "packages", ...segments);

/** A kit package's file over Vite's 4 KiB default inline limit. */
export const KIT_PACKAGE_ASSET = kitPackageFile("shell", "README.md");

export type ScratchBuilds = {
  /**
   * Builds `entry.ts` (with `files` beside it; an `index.html` among them is
   * the entry instead) in the scratch project `name`. `source` and `files` may
   * name `PACKAGE_FILE`, replaced by the path from the project to `target`.
   */
  readonly build: (
    name: string,
    source: string,
    files?: Readonly<Record<string, string>>,
    target?: string,
  ) => Promise<unknown>;
  /** The scratch project `name`'s directory, created if needed. */
  readonly dir: (name: string) => string;
  /** Removes the scratch directory. */
  readonly remove: () => void;
};

export const scratchBuilds = (): ScratchBuilds => {
  // The real path: Vite resolves a relative URL from its importer's real path,
  // and macOS's `tmpdir()` is a symlink.
  const scratch = realpathSync(
    mkdtempSync(join(tmpdir(), "se-reference-game-guard-")),
  );
  const dep = join(scratch, "node_modules", "scratch-dep");
  mkdirSync(dep, { recursive: true });
  writeFileSync(
    join(dep, "package.json"),
    JSON.stringify({ name: "scratch-dep", type: "module", main: "index.js" }),
  );
  writeFileSync(join(dep, "index.js"), "export const pad = 1;\n");
  const dirOf = (name: string): string => {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  return {
    dir: dirOf,
    build: (name, source, files = {}, target = KIT_PACKAGE_ASSET) => {
      const dir = dirOf(name);
      const toPackage = relative(dir, target).replaceAll("\\", "/");
      const entry = join(dir, "entry.ts");
      writeFileSync(entry, source.replaceAll("PACKAGE_FILE", toPackage));
      for (const [file, text] of Object.entries(files)) {
        writeFileSync(
          join(dir, file),
          text.replaceAll("PACKAGE_FILE", toPackage),
        );
      }
      return build({
        root: dir,
        configFile: join(appRoot, "vite.config.ts"),
        logLevel: "silent",
        // The kit packages hold no image; a Markdown file stands in for one.
        assetsInclude: ["**/*.md"],
        build: {
          write: false,
          rollupOptions: {
            input: "index.html" in files ? join(dir, "index.html") : entry,
          },
        },
      });
    },
    remove: () => {
      rmSync(scratch, { recursive: true, force: true });
    },
  };
};
