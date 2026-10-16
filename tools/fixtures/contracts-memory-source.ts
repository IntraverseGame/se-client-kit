// An in-memory contract source for the tests of tools/contracts-lock.ts: the
// files of a "repository" by path, no git and no disk.

import type { GroupSource, SourceReader } from "../contracts-lock.ts";

export const COMMIT_A = "a".repeat(40);
export const COMMIT_B = "b".repeat(40);

export const SOURCES: Readonly<Record<string, GroupSource>> = {
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
  "signing-vectors": {
    name: "contracts",
    repo: "r",
    ref: "main",
    path: "v/signing.json",
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
    ["v/signing.json", '{"s":3}\n'],
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
