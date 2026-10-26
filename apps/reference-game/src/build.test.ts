// @vitest-environment node
import { join } from "node:path";

import { build, createServer, loadConfigFromFile } from "vite";
import { afterAll, describe, expect, it } from "vitest";

import {
  isAllowedInBuild,
  packageImportGuard,
} from "../package-import-guard.ts";
import {
  appRoot,
  kitPackageFile,
  scratchBuilds,
} from "./fixtures/scratch-build.ts";

// The build of the reference game: the real Vite build of the app passes with
// the package-import guard on, its page carries the Content Security Policy,
// and its bundle holds no package code; the guard fails a build whose module
// graph reaches any package at run time (a kit package, a third-party one, or
// a development tool such as `vite` or `vitest`), lets a type import through
// (it is erased before anything resolves), and lets the dev server (and so the
// component tests) resolve a third-party package but never a kit one. Each case
// runs the actual Vite API; nothing is written to disk but the scratch
// sources. The copied-asset cases are in package-import-guard.test.ts.

/** The page's Content Security Policy: its own origin, and nothing inline. */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const scratch = scratchBuilds();
const buildScratch = scratch.build;

afterAll(() => {
  scratch.remove();
});

type Output = { readonly fileName: string; readonly text: string };

const outputsOf = (result: unknown): Output[] => {
  const results = Array.isArray(result) ? result : [result];
  return results.flatMap(item =>
    (
      item as {
        output: { fileName: string; code?: string; source?: unknown }[];
      }
    ).output.map(file => ({
      fileName: file.fileName,
      text: file.code ?? (typeof file.source === "string" ? file.source : ""),
    })),
  );
};

/** The names of a configuration's plugins (a non-object plugin as it is). */
const pluginNamesOf = (plugins: readonly unknown[] | undefined): unknown[] =>
  (plugins ?? []).map(plugin =>
    typeof plugin === "object" && plugin !== null && "name" in plugin
      ? plugin.name
      : plugin,
  );

/** The text of the output file `fileName`, empty when there is none. */
const textOf = (files: readonly Output[], fileName: string): string =>
  files.find(file => file.fileName === fileName)?.text ?? "";

describe("the reference game's build", () => {
  it("has the package-import guard in its Vite configuration", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      join(appRoot, "vite.config.ts"),
    );
    expect(pluginNamesOf(loaded?.config.plugins)).toContain(
      "se-reference-game-package-import-guard",
    );
  });

  it("builds the game into a page with its CSP and no package code", async () => {
    const result = await build({
      root: appRoot,
      logLevel: "silent",
      build: { write: false },
    });
    const files = outputsOf(result);
    expect(files.map(file => file.fileName)).toContain("index.html");
    const page = textOf(files, "index.html");
    expect(
      /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/u.exec(
        page,
      )?.[1],
    ).toBe(CSP);
    // No inline script or style for the policy to refuse.
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/u);
    expect(page).not.toMatch(/<style\b|\sstyle=/u);
    expect(files.some(file => file.fileName.endsWith(".js"))).toBe(true);
    for (const file of files) {
      expect(file.text).not.toContain("@intraverse/");
      expect(file.text).not.toContain("createControllerBridge");
    }
  }, 30_000);

  it("builds the board of rows that plays any steps round, Cash or Crash included", async () => {
    const result = await build({
      root: appRoot,
      logLevel: "silent",
      build: { write: false },
    });
    const files = outputsOf(result);
    const script = files.find(file => file.fileName.endsWith(".js"))?.text;
    const style = files.find(file => file.fileName.endsWith(".css"))?.text;
    expect(script).toContain("rg-tile");
    expect(script).toContain("Pick a tile in row");
    expect(style).toContain(".rg-board");
    expect(style).toContain(".rg-tile");
  }, 30_000);
});

describe("the package-import guard", () => {
  it("lets a type import of the controller subpath through", async () => {
    const result = await buildScratch(
      "type-import",
      'import type { HelloMessage } from "@intraverse/se-client-shell/controller";\n' +
        'export const schema: HelloMessage["schema"] = "se.controller/1";\n',
    );
    expect(outputsOf(result).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "a value import of the controller subpath",
      'import { CONTROLLER_SCHEMA } from "@intraverse/se-client-shell/controller";\nexport const s = CONTROLLER_SCHEMA;\n',
    ],
    [
      "the shell's main entry",
      'import { createLogger } from "@intraverse/se-client-shell";\nexport const l = createLogger;\n',
    ],
    [
      "a side-effect import of a kit package",
      'import "@intraverse/se-client-snapshot";\nexport const x = 1;\n',
    ],
    [
      "a dynamic import of a kit package",
      'export const load = () => import("@intraverse/se-client-signing");\n',
    ],
  ])("fails the build on %s", async (name, source) => {
    await expect(
      buildScratch(name.replaceAll(" ", "-"), source),
    ).rejects.toThrow(/reference-game imports @intraverse\//u);
  });

  it.each([
    [
      "Vite itself",
      'import { defineConfig } from "vite";\nexport const c = defineConfig;\n',
    ],
    [
      "Vitest",
      'import { describe } from "vitest";\nexport const d = describe;\n',
    ],
    ["a side-effect import of jsdom", 'import "jsdom";\nexport const x = 1;\n'],
    [
      "a Node built-in",
      'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n',
    ],
    [
      "a dynamic import of a package",
      'export const load = () => import("stylelint");\n',
    ],
    [
      "a Vite subpath that is not one of its helpers",
      'import { ModuleRunner } from "vite/module-runner";\nexport const m = ModuleRunner;\n',
    ],
  ])("fails the build on %s (a third-party package)", async (name, source) => {
    await expect(
      buildScratch(name.replaceAll(" ", "-"), source),
    ).rejects.toThrow(/reference-game imports the package /u);
  });

  it.each([
    ["vite/modulepreload-polyfill", true],
    ["vite/modulepreload-polyfill.js", false],
    ["vite/module-runner", false],
    ["vite/client", false],
    ["\0vite/preload-helper.js", true],
    ["/src/main.ts", true],
    ["./game.ts", true],
    ["../shared.ts", true],
    ["vite", false],
    ["vitest", false],
    ["@scope/name", false],
    ["lodash/fp", false],
    ["node:fs", false],
    ["virtual:anything", false],
  ])("lets a build resolve %s: %s", (source, allowed) => {
    expect(isAllowedInBuild(source)).toBe(allowed);
  });

  it("lets the dev server and the tests resolve a third-party package, never a kit one", async () => {
    const server = await createServer({
      root: appRoot,
      configFile: false,
      logLevel: "silent",
      plugins: [packageImportGuard()],
      server: { middlewareMode: true, ws: false },
    });
    try {
      const importer = join(appRoot, "src", "game.test.ts");
      await expect(
        server.pluginContainer.resolveId("vitest", importer),
      ).resolves.not.toBeNull();
      await expect(
        server.pluginContainer.resolveId(
          "@intraverse/se-client-shell",
          importer,
        ),
      ).rejects.toThrow(/reference-game imports @intraverse\//u);
    } finally {
      await server.close();
    }
  });

  it("fails the build on a relative path into a kit package", async () => {
    const target = kitPackageFile("shell", "src", "controller-protocol.ts");
    await expect(
      buildScratch(
        "relative",
        `import { CONTROLLER_SCHEMA } from ${JSON.stringify(target)};\nexport const s = CONTROLLER_SCHEMA;\n`,
      ),
    ).rejects.toThrow(/a kit package's file/u);
  });
});
