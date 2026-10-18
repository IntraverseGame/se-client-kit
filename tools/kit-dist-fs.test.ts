import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runKitDistCheck } from "./kit-dist-fs.ts";

// The file-system side of the guard (tools/kit-dist-fs.ts) and its CLI
// (tools/check-kit-dist.ts), on a temporary tree: `packages/a` is a kit package
// with a built `dist/`, and `packages/b` depends on it through a
// `node_modules` link, as pnpm lays a workspace out.

const repository = join(import.meta.dirname, "..");
const tsx = join(repository, "node_modules", ".bin", "tsx");
const cli = join(repository, "tools", "check-kit-dist.ts");
const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

const A_MANIFEST = JSON.stringify({
  name: "@kit/a",
  exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
});

/** A fresh tree; returns its root and the consumer's directory. */
const tree = (): { root: string; b: string } => {
  const root = mkdtempSync(join(tmpdir(), "kit-dist-"));
  trees.push(root);
  write(join(root, "packages/a/package.json"), A_MANIFEST);
  write(join(root, "packages/a/dist/index.d.ts"), "export {};\n");
  write(join(root, "packages/a/dist/index.js"), "export {};\n");
  write(join(root, "packages/a/dist/extra.txt"), "served by path\n");
  write(
    join(root, "packages/b/package.json"),
    JSON.stringify({
      name: "@kit/b",
      dependencies: { "@kit/a": "workspace:*" },
    }),
  );
  mkdirSync(join(root, "packages/b/node_modules/@kit"), { recursive: true });
  symlinkSync("../../../a", join(root, "packages/b/node_modules/@kit/a"));
  return { root, b: join(root, "packages/b") };
};

describe("runKitDistCheck", () => {
  it("passes, with exit code 0 and one line, when everything exists", () => {
    const { root, b } = tree();
    expect(runKitDistCheck(root, b, ["test"])).toEqual({
      exitCode: 0,
      output: "packages/b (test): every kit build output it reads exists.",
    });
  });

  it("fails with exit code 1 and the message when an export is missing", () => {
    const { root, b } = tree();
    rmSync(join(root, "packages/a/dist/index.js"));
    const result = runKitDistCheck(root, b, ["test"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      "The test of packages/b reads the build output of other workspaces",
    );
    expect(result.output).toContain(
      '\n  @kit/a: packages/a/dist/index.js is missing (exports ".")\n',
    );
  });

  it("counts a directory where a file should be as missing", () => {
    const { root, b } = tree();
    rmSync(join(root, "packages/a/dist/index.d.ts"));
    mkdirSync(join(root, "packages/a/dist/index.d.ts"));
    expect(runKitDistCheck(root, b, ["typecheck"]).exitCode).toBe(1);
  });

  it("resolves the paths a script names from its workspace", () => {
    const { root, b } = tree();
    expect(
      runKitDistCheck(root, b, ["test", "../a/dist/extra.txt"]).exitCode,
    ).toBe(0);
    const missing = runKitDistCheck(root, b, ["test", "../a/dist/gone.txt"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.output).toContain(
      "\n  packages/a/dist/gone.txt: is missing (named by the script)\n",
    );
  });

  it("reports a missing link and an unreadable linked manifest, not a stack trace", () => {
    const unlinked = tree();
    rmSync(join(unlinked.root, "packages/b/node_modules/@kit/a"));
    expect(runKitDistCheck(unlinked.root, unlinked.b, ["test"])).toMatchObject({
      exitCode: 1,
      output: expect.stringContaining(
        "@kit/a: not linked in packages/b/node_modules",
      ),
    });
    const broken = tree();
    writeFileSync(join(broken.root, "packages/a/package.json"), "{ not json");
    expect(runKitDistCheck(broken.root, broken.b, ["test"])).toMatchObject({
      exitCode: 1,
      output: expect.stringContaining(
        "@kit/a: packages/a/package.json cannot be read (",
      ),
    });
  });

  it("refuses to run without a script name, with exit code 2", () => {
    const { root, b } = tree();
    expect(runKitDistCheck(root, b, []).exitCode).toBe(2);
  });
});

const run = (cwd: string) =>
  spawnSync(tsx, [cli, "test"], { cwd, encoding: "utf8" });

describe("the CLI", () => {
  it("exits 0 and prints one line when everything exists", () => {
    const { b } = tree();
    const result = run(b);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("every kit build output it reads exists.");
  });

  it("exits 1 and prints the message on stderr when a file is missing", () => {
    const { root, b } = tree();
    rmSync(join(root, "packages/a/dist/index.d.ts"));
    const result = run(b);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("packages/a/dist/index.d.ts is missing");
  });
});
