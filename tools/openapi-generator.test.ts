// The Play API document's generator runs as ADR-004 pins it:
// `openapi-typescript` 6.7.6 with its `undici` held at 6.29.0 by the pnpm
// override (outside its declared `^5.28` range), and under that override it
// loads and regenerates the committed types without a difference.

import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { generateContractsFiles } from "./generate-contracts.ts";

const root = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

const versionOf = (manifest: string): unknown =>
  (JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown }).version;

/** The `undici` version that package `name` itself resolves. */
const undiciOf = (name: string): unknown => {
  const home = dirname(realpathSync(require.resolve(`${name}/package.json`)));
  return versionOf(
    createRequire(join(home, "package.json")).resolve("undici/package.json"),
  );
};

/** The `undici` that `openapi-typescript` itself resolves. */
const generatorUndici = (): unknown => undiciOf("openapi-typescript");

describe("the API documents' generator", () => {
  it("is openapi-typescript 6.7.6", () => {
    expect(versionOf(require.resolve("openapi-typescript/package.json"))).toBe(
      "6.7.6",
    );
  });

  it("gets undici 6.29.0 through the override scoped to it", () => {
    expect(generatorUndici()).toBe("6.29.0");
    const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(
      /^overrides:\n {2}openapi-typescript>undici: 6\.29\.0$/mu,
    );
    expect(workspace).not.toMatch(/^ {2}undici:/mu);
  });

  it("leaves jsdom its own undici 8.x", () => {
    expect(undiciOf("jsdom")).toMatch(/^8\./u);
  });

  it("loads and regenerates the committed Play API types under it", async () => {
    const packageDir = join(root, "packages", "contracts");
    const generated = await generateContractsFiles(packageDir);
    expect(generated.get("src/generated/play.ts")).toBe(
      readFileSync(join(packageDir, "src", "generated", "play.ts"), "utf8"),
    );
  });

  it("regenerates the committed verify API types under it", async () => {
    const packageDir = join(root, "packages", "contracts");
    const generated = await generateContractsFiles(packageDir);
    expect(generated.get("src/generated/verify.ts")).toBe(
      readFileSync(join(packageDir, "src", "generated", "verify.ts"), "utf8"),
    );
  });
});
