// @vitest-environment node
import { statSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  isUnder,
  packageImportGuard,
  packagesDirFor,
} from "../package-import-guard.ts";
import {
  appRoot,
  KIT_PACKAGE_ASSET,
  kitPackageFile,
  scratchBuilds,
} from "./fixtures/scratch-build.ts";

// The guard's check of the assets a build copies: a kit package's file that
// Vite copies into the build (a `new URL(..., import.meta.url)`, a CSS `url()`,
// an HTML `src`) reaches no `resolveId` or `load` hook, so the guard refuses it
// when the bundle is generated. The game never inlines an asset
// (`assetsInlineLimit: 0`), so a small file is copied and refused too. The
// scratch builds use the game's own configuration; the hook is also run on its
// own, since Vite names an asset's original file relative to the build's root.

const scratch = scratchBuilds();
const buildScratch = scratch.build;

afterAll(() => {
  scratch.remove();
});

type Asset = {
  readonly type: "asset";
  readonly fileName: string;
  readonly originalFileNames: readonly string[];
};

/** Runs the guard's `configResolved` and `generateBundle` hooks directly. */
const generate = (root: string, assets: readonly Asset[]): void => {
  const guard = packageImportGuard();
  const configResolved = guard.configResolved as (config: {
    command: string;
    root: string;
  }) => void;
  const generateBundle = guard.generateBundle as (
    this: { error: (message: string) => never },
    options: object,
    bundle: Record<string, Asset>,
  ) => void;
  configResolved({ command: "build", root });
  const context = {
    error: (message: string): never => {
      throw new Error(message);
    },
  };
  generateBundle.call(
    context,
    {},
    Object.fromEntries(assets.map(asset => [asset.fileName, asset])),
  );
};

const asset = (original: string): Asset => ({
  type: "asset",
  fileName: "assets/file-abc123.md",
  originalFileNames: [original],
});

describe("the guard's check of copied assets", () => {
  it("resolves an asset's original file from the build's root", () => {
    expect(() =>
      generate(join(appRoot, "src"), [
        asset("../../../packages/shell/README.md"),
      ]),
    ).toThrow(
      /reference-game copies \.\.\/\.\.\/\.\.\/packages\/shell\/README\.md into its build as assets\/file-abc123\.md, a kit package's file/u,
    );
  });

  it("lets the game's own assets through", () => {
    expect(() =>
      generate(join(appRoot, "src"), [
        asset("styles.css"),
        asset("../README.md"),
      ]),
    ).not.toThrow();
  });
});

describe("the guard in a build", () => {
  it.each([
    [
      "new URL(..., import.meta.url)",
      'export const u = new URL("PACKAGE_FILE", import.meta.url).href;\n',
      {},
    ],
    [
      "a CSS url()",
      'import "./style.css";\nexport const x = 1;\n',
      { "style.css": 'body { background: url("PACKAGE_FILE"); }\n' },
    ],
    [
      "an HTML <img src>",
      "export const x = 1;\n",
      {
        "index.html":
          '<!doctype html><html><body><img src="PACKAGE_FILE" alt=""><script type="module" src="./entry.ts"></script></body></html>\n',
      },
    ],
  ])(
    "fails the build on a kit package's file copied as an asset by %s",
    async (name, source, files) => {
      await expect(
        buildScratch(
          `asset-${name.replaceAll(/[^a-z]+/gu, "-")}`,
          source,
          files,
        ),
      ).rejects.toThrow(
        /reference-game copies \S*packages\/shell\/README\.md into its build as assets\/README-[\w-]+\.md, a kit package's file/u,
      );
    },
  );

  it("fails the build on a kit package's file under 4 KiB too, which the game never inlines", async () => {
    const small = kitPackageFile("contracts", "README.md");
    expect(statSync(small).size).toBeLessThan(4096);
    await expect(
      buildScratch(
        "asset-small",
        'export const u = new URL("PACKAGE_FILE", import.meta.url).href;\n',
        {},
        small,
      ),
    ).rejects.toThrow(
      /reference-game copies \S*packages\/contracts\/README\.md /u,
    );
  });
});

describe("the guard's paths", () => {
  it.each([
    ["a space", "a%20b", "a b"],
    ["a non-ASCII character", "caf%C3%A9", "café"],
  ])(
    "finds packages/ in a checkout whose path has %s",
    (_name, encoded, decoded) => {
      const dir = packagesDirFor(
        `file:///work/${encoded}/apps/reference-game/package-import-guard.ts`,
      );
      expect(isUnder(dir, `/work/${decoded}/packages/shell/README.md`)).toBe(
        true,
      );
      expect(isUnder(dir, `/work/${decoded}/apps/reference-game/x.md`)).toBe(
        false,
      );
    },
  );
});

describe("the guard in a worker", () => {
  const WORKER_ENTRY =
    'export const w = () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });\n';

  it("fails the build on a worker that imports a kit package's file", async () => {
    await expect(
      buildScratch(
        "worker-kit-file",
        WORKER_ENTRY,
        {
          "worker.ts":
            'import { CONTROLLER_SCHEMA } from "PACKAGE_FILE";\nself.postMessage(CONTROLLER_SCHEMA);\n',
        },
        kitPackageFile("shell", "src", "controller-protocol.ts"),
      ),
    ).rejects.toThrow(/a kit package's file/u);
  });

  it("fails the build on a worker that imports a third-party package", async () => {
    await expect(
      buildScratch("worker-third-party", WORKER_ENTRY, {
        "worker.ts":
          'import { pad } from "scratch-dep";\nself.postMessage(pad);\n',
      }),
    ).rejects.toThrow(/reference-game imports the package scratch-dep /u);
  });
});

describe("the guard and symlinks", () => {
  it("fails the build on an HTML <img src> that is a symlink to a kit package's file", async () => {
    symlinkSync(
      KIT_PACKAGE_ASSET,
      join(scratch.dir("asset-symlink"), "link.md"),
    );
    await expect(
      buildScratch("asset-symlink", "export const x = 1;\n", {
        "index.html":
          '<!doctype html><html><body><img src="./link.md" alt=""><script type="module" src="./entry.ts"></script></body></html>\n',
      }),
    ).rejects.toThrow(
      /reference-game copies link\.md into its build as assets\/link-[\w-]+\.md, a kit package's file/u,
    );
  });
});
