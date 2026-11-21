import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readLock, verifyLock } from "./contracts-lock.ts";
import {
  type MemorySource,
  memorySource,
  notice,
  noticesFile,
} from "./fixtures/contracts-memory-source.ts";
import { syncInto as syncIntoPackage } from "./fixtures/contracts-sync.ts";

// The key-delegation groups of the sync: the vectors are append-only like any
// vector, and the notices list by its own rule, which no flag lifts
// (specs/client-kit/how-the-kit-gets-its-contracts.md, rule 1).

let packageDir: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), "contracts-notices-"));
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

const syncInto = (source: MemorySource, allowVectorChange = false): void => {
  syncIntoPackage(packageDir, source, allowVectorChange);
};

describe("the key-delegation sync", () => {
  it("records the key-delegation notices and vectors under the manifest's names", () => {
    syncInto(memorySource());
    expect(
      readLock(packageDir)
        .entries.filter(e => e.path.includes("/key-delegation/"))
        .map(e => [e.path, e.sourceName]),
    ).toEqual([
      [
        "src/schemas/key-delegation/v1/notices.json",
        "key-delegation/v1 notices",
      ],
      [
        "src/vectors/key-delegation/v1/vectors.json",
        "key-delegation/v1 vectors",
      ],
    ]);
  });

  it("refuses to change the locked key-delegation vectors, append-only", () => {
    syncInto(memorySource());
    const changed = memorySource();
    changed.files.set("d/vectors.json", '{"d":99}\n');
    expect(() => {
      syncInto(changed);
    }).toThrow(/vectors\.json: vector files are append-only/u);
  });

  it("adds a notice anywhere in any status, reorders, and moves a status forward", () => {
    const source = memorySource();
    source.files.set("d/notices.json", noticesFile(notice("a"), notice("b")));
    syncInto(source);
    const next = memorySource();
    next.files.set(
      "d/notices.json",
      noticesFile(
        notice("a", "approved"),
        notice("c", "approved"),
        notice("b", "retired"),
        notice("d", "pending"),
      ),
    );
    syncInto(next);
    const later = memorySource();
    later.files.set(
      "d/notices.json",
      noticesFile(
        notice("d", "approved"),
        notice("b", "retired"),
        notice("a", "retired"),
        notice("c", "approved"),
      ),
    );
    syncInto(later);
    expect(verifyLock(packageDir)).toEqual([]);
  });

  it.each([
    ["removes an entry", [notice("b", "retired")], /notice "a" was removed/u],
    [
      "removes the last entry",
      [notice("a", "approved")],
      /notice "b" was removed/u,
    ],
    [
      "renames an entry",
      [notice("b", "retired"), { ...notice("a", "approved"), id: "x" }],
      /notice "a" was removed or renamed/u,
    ],
    [
      "changes an entry's text",
      [notice("b", "retired"), notice("a", "approved", "Other.")],
      /notice "a" changed its text/u,
    ],
    [
      "changes an entry's hash",
      [
        { ...notice("a", "approved"), keccak256: `0x${"f".repeat(64)}` },
        notice("b", "retired"),
      ],
      /notice "a" changed its keccak256/u,
    ],
    [
      "moves a status back from approved",
      [notice("a", "pending"), notice("b", "retired")],
      /notice "a" moved its status back/u,
    ],
    [
      "moves a status back from retired",
      [notice("a", "approved"), notice("b", "approved")],
      /notice "b" moved its status back/u,
    ],
    [
      "gives a locked entry an unknown status",
      [notice("a", "draft"), notice("b", "retired")],
      /new notices list's entry 0 has an unknown status/u,
    ],
    [
      "adds an entry with an unknown status",
      [notice("a", "approved"), notice("b", "retired"), notice("c", "draft")],
      /new notices list's entry 2 has an unknown status/u,
    ],
    [
      "repeats an id",
      [
        notice("a", "approved"),
        notice("b", "retired"),
        notice("a", "approved", "Other."),
      ],
      /new notices list repeats an entry's id/u,
    ],
    [
      "repeats a hash",
      [
        notice("a", "approved"),
        notice("b", "retired"),
        { ...notice("c"), keccak256: notice("a").keccak256 },
      ],
      /new notices list repeats an entry's keccak256/u,
    ],
    [
      "has an entry without an id",
      [
        notice("a", "approved"),
        notice("b", "retired"),
        { ...notice("c"), id: 3 },
      ],
      /entry 2 has no id or keccak256 to match by/u,
    ],
  ])(
    "refuses a notices list that %s, even when told to change vectors",
    (_name, notices, error) => {
      const source = memorySource();
      source.files.set(
        "d/notices.json",
        noticesFile(notice("a", "approved"), notice("b", "retired")),
      );
      syncInto(source);
      const changed = memorySource();
      changed.files.set(
        "d/notices.json",
        `${JSON.stringify({ version: 1, notices }, null, 2)}\n`,
      );
      expect(() => {
        syncInto(changed, true);
      }).toThrow(error);
      expect(verifyLock(packageDir)).toEqual([]);
    },
  );
});
