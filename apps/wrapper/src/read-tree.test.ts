// @vitest-environment node
// `readTree` on a real temporary directory (the release output check reads the
// written output from disk): regular files and directories are read; a
// symbolic link, to a file or to a directory, refuses the build.

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTree } from "../release-output-check.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "se-wrapper-read-tree-"));
  await mkdir(join(root, "out", "assets"), { recursive: true });
  await writeFile(join(root, "out", "index.html"), "<!doctype html>");
  await writeFile(join(root, "out", "assets", "a.js"), "1;");
  await writeFile(join(root, "elsewhere.html"), "<script>alert(1)</script>");
  await mkdir(join(root, "elsewhere"));
  await writeFile(join(root, "elsewhere", "b.js"), "2;");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const decoded = (
  files: ReadonlyMap<string, Uint8Array>,
): Record<string, string> =>
  Object.fromEntries(
    [...files].map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]),
  );

describe("readTree", () => {
  it("reads every regular file, by relative path with / separators", async () => {
    expect(decoded(await readTree(join(root, "out")))).toEqual({
      "index.html": "<!doctype html>",
      "assets/a.js": "1;",
    });
  });

  it("refuses a symbolic link to a file", async () => {
    await symlink(join(root, "elsewhere.html"), join(root, "out", "evil.html"));
    await expect(readTree(join(root, "out"))).rejects.toThrow(
      /evil\.html, a symbolic link \(isSymbolicLink\(\)\)/u,
    );
  });

  it("refuses a symbolic link to a directory", async () => {
    await symlink(join(root, "elsewhere"), join(root, "out", "sub"), "dir");
    await expect(readTree(join(root, "out"))).rejects.toThrow(
      /sub, a symbolic link \(isSymbolicLink\(\)\)/u,
    );
  });

  it("refuses an output directory that is itself a symbolic link", async () => {
    await symlink(join(root, "out"), join(root, "linked"), "dir");
    await expect(readTree(join(root, "linked"))).rejects.toThrow(
      /not a directory/u,
    );
  });
});
