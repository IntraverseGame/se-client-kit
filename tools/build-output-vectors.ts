// Finds the vector files the output canary fingerprints (see
// build-output-canary.ts). Nothing here is silent: a missing packages/contracts/src
// directory is a problem, while a missing vectors/ directory (the package is a
// skeleton today) simply yields no vectors, and the substring scan has nothing to
// look for until vectors exist.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { MIN_SUBSTRING_BYTES, type Vector } from "./build-output-canary.ts";

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

export type LoadedVectors = {
  readonly vectors: Vector[];
  readonly problems: string[];
};

export const loadVectors = (root: string): LoadedVectors => {
  const source = join(root, "packages", "contracts", "src");
  if (!existsSync(source)) {
    return {
      vectors: [],
      problems: [
        "packages/contracts/src is missing: the output canary cannot fingerprint the vectors",
      ],
    };
  }
  const vectors: Vector[] = [];
  const directory = join(source, "vectors");
  if (existsSync(directory) && statSync(directory).isDirectory()) {
    for (const file of walk(directory)) {
      vectors.push({
        path: relative(root, file).split(sep).join("/"),
        bytes: readFileSync(file),
        minimumBytes: 1,
      });
    }
  }
  const compiled = join(root, "packages", "contracts", "dist", "testing.js");
  if (existsSync(compiled)) {
    vectors.push({
      path: "packages/contracts/dist/testing.js",
      bytes: readFileSync(compiled),
      minimumBytes: MIN_SUBSTRING_BYTES,
    });
  }
  return { vectors, problems: [] };
};
