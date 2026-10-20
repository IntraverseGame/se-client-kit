// An in-memory contract source for the tests of tools/contracts-lock.ts: the
// files of a "repository" by path, no git and no disk.

import type { GroupSource, SourceReader } from "../contracts-lock.ts";

export const COMMIT_A = "a".repeat(40);
export const COMMIT_B = "b".repeat(40);

export const SOURCES: Readonly<Record<string, GroupSource>> = {
  "play-api-document": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "p/play.yaml",
  },
  "verify-api-document": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "p/verify.yaml",
  },
  "snapshot-schema": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "s/schema.json",
  },
  "snapshot-vectors-valid": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "s/valid",
  },
  "snapshot-vectors-invalid": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "s/invalid",
  },
  "snapshot-vectors-signature": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "s/signature",
  },
  "snapshot-vectors-typed-data": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "s/typed-data",
  },
  "snapshot-vectors-signed-action": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "s/signed-action",
  },
  "signing-vectors": {
    name: "contracts",
    repo: "r",
    ref: "main",
    path: "v/signing.json",
  },
  "kernel-vectors-seed": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/seed.json",
  },
  "kernel-vectors-steps-derive": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/steps-derive.json",
  },
  "kernel-vectors-derive": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/derive.json",
  },
  "kernel-vectors-shuffle-draw": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/shuffle-draw.json",
  },
};

export type MemorySource = {
  readonly files: Map<string, string>;
  /** The commit every file reports. */
  commit: string;
  readonly reader: SourceReader;
};

/** A source holding one file for each group, all at `COMMIT_A`. */
export const memorySource = (): MemorySource => {
  const files = new Map<string, string>([
    ["s/schema.json", '{"type":"object"}\n'],
    ["s/valid/a.json", '{"a":1}\n'],
    ["s/invalid/b.json", '{"b":2}\n'],
    ["s/signature/d.json", '{"d":5}\n'],
    ["s/typed-data/e.json", '{"e":6}\n'],
    ["s/signed-action/f.json", '{"f":7}\n'],
    ["p/play.yaml", "openapi: 3.0.3\n"],
    ["p/verify.yaml", "openapi: 3.0.3\n"],
    ["v/signing.json", '{"s":3}\n'],
    ["k/seed.json", '{"k":8}\n'],
    ["k/steps-derive.json", '{"k":9}\n'],
    ["k/derive.json", '{"k":10}\n'],
    ["k/shuffle-draw.json", '{"k":11}\n'],
  ]);
  const source: MemorySource = {
    files,
    commit: COMMIT_A,
    reader: {
      list: ({ path }) =>
        [...files.keys()]
          .filter(file => file === path || file.startsWith(`${path}/`))
          .toSorted(),
      read: (_source, file) => new TextEncoder().encode(files.get(file)),
      commit: () => source.commit,
    },
  };
  return source;
};
