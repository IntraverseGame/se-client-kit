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
  "kernel-vectors-round-secret-hash": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/round-secret-hash.json",
  },
  "kernel-vectors-coin-flip-payout": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/coin-flip-payout.json",
  },
  "kernel-vectors-weighted-draw": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/weighted-draw.json",
  },
  "kernel-vectors-book-draw": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/book-draw.json",
  },
  "kernel-vectors-book-table-commitment": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "k/book-table-commitment.json",
  },
  "key-delegation-notices": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "d/notices.json",
  },
  "key-delegation-vectors": {
    name: "backend",
    repo: "r",
    ref: "main",
    path: "d/vectors.json",
  },
};

/** One entry of a notices list. */
export type NoticeEntry = {
  readonly id: string;
  readonly text: string;
  readonly keccak256: string;
  readonly status: string;
};

/** A notices list of the given entries, as the backend's file spells it. */
export const noticesFile = (...notices: readonly NoticeEntry[]): string =>
  `${JSON.stringify({ version: 1, notices }, null, 2)}\n`;

/** A notices entry; its hash is made up, since the sync does not check it. */
export const notice = (
  id: string,
  status = "pending",
  text = `Notice ${id}.`,
): NoticeEntry => ({
  id,
  text,
  keccak256: `0x${id.padStart(64, "0")}`,
  status,
});

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
    ["k/round-secret-hash.json", '{"k":12}\n'],
    ["k/coin-flip-payout.json", '{"k":13}\n'],
    ["k/weighted-draw.json", '{"k":14}\n'],
    ["k/book-draw.json", '{"k":15}\n'],
    ["k/book-table-commitment.json", '{"k":16}\n'],
    ["d/notices.json", noticesFile(notice("a"))],
    ["d/vectors.json", '{"d":17}\n'],
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
