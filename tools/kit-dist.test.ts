import { describe, expect, it } from "vitest";

import {
  exportTargets,
  findMissingKitFiles,
  findMissingOwnFiles,
  formatMissingKitFiles,
  kitDependencies,
  type KitManifest,
  type KitPackage,
  type ResolvePackage,
  unsupportedExports,
} from "./kit-dist.ts";

// The guard before every script that reads a kit package's `dist/` (issue
// #53): every file the kit dependencies name in `exports`, direct or through
// another kit package, exists. These checks run on in-memory packages;
// tools/kit-dist-workspaces.test.ts holds the repository's own manifests to the
// guard.

const ENTRY = { types: "./dist/index.d.ts", default: "./dist/index.js" };

/** A resolver over packages keyed by name, wherever they are resolved from. */
const resolverOf =
  (packages: Readonly<Record<string, KitPackage>>): ResolvePackage =>
  (_from, name) =>
    packages[name];

const kit = (directory: string, manifest: KitManifest): KitPackage => ({
  directory,
  manifest,
});

// wrapper → shell → snapshot → contracts, and wrapper → contracts.
const PACKAGES = {
  "@kit/contracts": kit("packages/contracts", {
    exports: {
      ".": ENTRY,
      "./testing": {
        types: "./dist/testing.d.ts",
        default: "./dist/testing.js",
      },
    },
  }),
  "@kit/snapshot": kit("packages/snapshot", {
    dependencies: { "@kit/contracts": "workspace:*" },
    exports: { ".": ENTRY },
  }),
  "@kit/shell": kit("packages/shell", {
    dependencies: { "@kit/snapshot": "workspace:*" },
    devDependencies: { "@kit/dev-only": "workspace:*" },
    exports: {
      ".": ENTRY,
      "./controller": { types: "./dist/controller.d.ts" },
    },
  }),
};

const WRAPPER = kit("apps/wrapper", {
  dependencies: { "@kit/shell": "workspace:*" },
  devDependencies: { "@kit/contracts": "workspace:*", vite: "8.3.4" },
});

const WRAPPER_RUNTIME_ONLY = kit("apps/wrapper", {
  dependencies: { "@kit/shell": "workspace:*" },
});

const BUILT: ReadonlySet<string> = new Set([
  "packages/shell/dist/index.d.ts",
  "packages/shell/dist/index.js",
  "packages/shell/dist/controller.d.ts",
  "packages/snapshot/dist/index.d.ts",
  "packages/snapshot/dist/index.js",
  "packages/contracts/dist/index.d.ts",
  "packages/contracts/dist/index.js",
  "packages/contracts/dist/testing.d.ts",
  "packages/contracts/dist/testing.js",
]);

const existsExcept =
  (...missing: string[]) =>
  (path: string): boolean =>
    BUILT.has(path) && !missing.includes(path);

/** `resolverOf`, with `@kit/broken` resolving to an unreadable manifest. */
const withBroken =
  (packages: Readonly<Record<string, KitPackage>>): ResolvePackage =>
  (from, name) =>
    name === "@kit/broken"
      ? { problem: "@kit/broken: packages/broken/package.json cannot be read" }
      : resolverOf(packages)(from, name);

describe("kitDependencies", () => {
  const manifest: KitManifest = {
    dependencies: { "@kit/b": "workspace:*", noble: "2.0.0" },
    peerDependencies: { "@kit/a": "workspace:^" },
    devDependencies: { "@kit/c": "workspace:*", "@kit/b": "workspace:*" },
  };

  it("names the workspace: dependencies, sorted, with devDependencies for the consumer", () => {
    expect(kitDependencies(manifest, true)).toEqual([
      "@kit/a",
      "@kit/b",
      "@kit/c",
    ]);
  });

  it("leaves a dependency's devDependencies out", () => {
    expect(kitDependencies(manifest, false)).toEqual(["@kit/a", "@kit/b"]);
  });
});

describe("exportTargets", () => {
  it("reads every target of every subpath, the JavaScript ones included", () => {
    expect(
      exportTargets({
        ".": ENTRY,
        "./controller": { types: "./dist/controller.d.ts" },
        "./data.json": "./dist/data.json",
      }),
    ).toEqual([
      { subpath: ".", target: "dist/index.d.ts" },
      { subpath: ".", target: "dist/index.js" },
      { subpath: "./controller", target: "dist/controller.d.ts" },
      { subpath: "./data.json", target: "dist/data.json" },
    ]);
  });

  it("treats a string and top-level conditions as the . subpath, nested ones included", () => {
    expect(exportTargets("./dist/index.js")).toEqual([
      { subpath: ".", target: "dist/index.js" },
    ]);
    expect(
      exportTargets({
        import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
        require: "./dist/index.js",
      }),
    ).toEqual([
      { subpath: ".", target: "dist/index.d.ts" },
      { subpath: ".", target: "dist/index.js" },
    ]);
  });

  it("finds nothing in a manifest without exports", () => {
    expect(exportTargets(WRAPPER.manifest.exports)).toEqual([]);
  });
});

describe("findMissingKitFiles", () => {
  const resolve = resolverOf(PACKAGES);

  it("passes when every export of every kit dependency exists", () => {
    expect(findMissingKitFiles(WRAPPER, resolve, existsExcept())).toEqual([]);
  });

  it("reports a missing file reached through another kit package (#53)", () => {
    expect(
      findMissingKitFiles(
        WRAPPER_RUNTIME_ONLY,
        resolve,
        existsExcept("packages/snapshot/dist/index.js"),
      ),
    ).toEqual([
      '@kit/snapshot: packages/snapshot/dist/index.js is missing (exports ".")',
    ]);
  });

  it("reports every missing target and visits each package once", () => {
    expect(findMissingKitFiles(WRAPPER, resolve, () => false)).toEqual([
      '@kit/contracts: packages/contracts/dist/index.d.ts is missing (exports ".")',
      '@kit/contracts: packages/contracts/dist/index.js is missing (exports ".")',
      '@kit/contracts: packages/contracts/dist/testing.d.ts is missing (exports "./testing")',
      '@kit/contracts: packages/contracts/dist/testing.js is missing (exports "./testing")',
      '@kit/shell: packages/shell/dist/index.d.ts is missing (exports ".")',
      '@kit/shell: packages/shell/dist/index.js is missing (exports ".")',
      '@kit/shell: packages/shell/dist/controller.d.ts is missing (exports "./controller")',
      '@kit/snapshot: packages/snapshot/dist/index.d.ts is missing (exports ".")',
      '@kit/snapshot: packages/snapshot/dist/index.js is missing (exports ".")',
    ]);
  });

  it("reports a kit dependency that is not linked, and one without exports", () => {
    const consumer = kit("packages/shell", {
      dependencies: { "@kit/gone": "workspace:*", "@kit/bare": "workspace:*" },
    });
    expect(
      findMissingKitFiles(
        consumer,
        resolverOf({ "@kit/bare": kit("packages/bare", {}) }),
        () => true,
      ),
    ).toEqual([
      "@kit/bare: its package.json has no exports",
      "@kit/gone: not linked in packages/shell/node_modules (run `pnpm install --frozen-lockfile`)",
    ]);
  });

  it("follows a consumer's devDependencies but not a dependency's", () => {
    const consumer = kit("apps/game", {
      devDependencies: { "@kit/shell": "workspace:*" },
    });
    expect(findMissingKitFiles(consumer, resolve, existsExcept())).toEqual([]);
  });

  it("refuses an exports form it does not model, and reports an unreadable manifest", () => {
    const consumer = kit("apps/game", {
      dependencies: {
        "@kit/arrays": "workspace:*",
        "@kit/broken": "workspace:*",
        "@kit/patterns": "workspace:*",
      },
    });
    const packages: Readonly<Record<string, KitPackage>> = {
      "@kit/arrays": kit("packages/arrays", {
        exports: { ".": ["./dist/index.js", "./dist/fallback.js"] },
      }),
      "@kit/patterns": kit("packages/patterns", {
        exports: { "./*": "./dist/*.js", "./x": "./dist/x/*.js" },
      }),
    };
    expect(
      findMissingKitFiles(consumer, withBroken(packages), () => true),
    ).toEqual([
      '@kit/arrays: its exports use a fallback array in ".", which the guard does not model',
      "@kit/broken: packages/broken/package.json cannot be read",
      '@kit/patterns: its exports use the subpath pattern "./*", which the guard does not model',
      '@kit/patterns: its exports use the subpath pattern "./x", which the guard does not model',
    ]);
  });
});

describe("unsupportedExports", () => {
  it("names patterns and fallback arrays, at the top level too, and nothing else", () => {
    expect(unsupportedExports(["./a.js", "./b.js"])).toEqual([
      'a fallback array in "."',
    ]);
    expect(
      unsupportedExports({
        import: { default: ["./a.js"] },
        types: "./a.d.ts",
      }),
    ).toEqual(['a fallback array in "."']);
    expect(unsupportedExports({ "./*": { types: "./dist/*.d.ts" } })).toEqual([
      'the subpath pattern "./*"',
    ]);
    expect(unsupportedExports({ ".": ENTRY, "./internal": null })).toEqual([]);
    expect(unsupportedExports(WRAPPER.manifest.exports)).toEqual([]);
  });
});

describe("findMissingOwnFiles", () => {
  it("reports each file the script names that does not exist", () => {
    expect(
      findMissingOwnFiles(
        ["apps/wrapper/dist/index.html", "apps/reference-game/dist/index.html"],
        path => path.startsWith("apps/wrapper/"),
      ),
    ).toEqual([
      "apps/reference-game/dist/index.html: is missing (named by the script)",
    ]);
  });
});

describe("formatMissingKitFiles", () => {
  it("names the script, the workspace, each problem, and what to do", () => {
    const message = formatMissingKitFiles("test", "packages/shell", [
      "@kit/snapshot: packages/snapshot/dist/index.js is missing",
    ]);
    expect(message).toContain("The test of packages/shell");
    expect(message).toContain(
      "\n  @kit/snapshot: packages/snapshot/dist/index.js is missing\n",
    );
    expect(message).toContain("WIREIT_LOGGER=simple");
    expect(message).toContain("pnpm clean:cache && pnpm build");
    expect(message).toContain("runbook/development/ci-failures.md");
  });
});
