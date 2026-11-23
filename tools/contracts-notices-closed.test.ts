import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readLock, type SourceReader } from "./contracts-lock.ts";
import {
  type MemorySource,
  memorySource,
  notice,
  noticesFile,
} from "./fixtures/contracts-memory-source.ts";
import {
  syncInto as syncIntoPackage,
  syncWith,
} from "./fixtures/contracts-sync.ts";

// The notices rule fails closed: a list is checked on every sync, a first one
// included, and a list or a locked base it cannot read stops the sync
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

/** `reader`, reading `bytes` for `file`: bytes no string can hold. */
const withBytes = (
  reader: SourceReader,
  file: string,
  bytes: Uint8Array,
): SourceReader => ({
  ...reader,
  read: (source, path) => (path === file ? bytes : reader.read(source, path)),
});

describe("the key-delegation notices rule, failing closed", () => {
  it.each([
    [
      "a repeated id",
      [notice("a"), notice("a", "pending", "Other.")],
      /new notices list repeats an entry's id/u,
    ],
    [
      "a repeated hash",
      [notice("a"), { ...notice("b"), keccak256: notice("a").keccak256 }],
      /new notices list repeats an entry's keccak256/u,
    ],
    ["an unknown status", [notice("a", "draft")], /has an unknown status/u],
    [
      "an entry without text",
      [{ ...notice("a"), text: 1 }],
      /entry 0 has no text/u,
    ],
  ])(
    "refuses a first sync whose notices list has %s, and writes nothing",
    (_name, notices, error) => {
      const source = memorySource();
      source.files.set(
        "d/notices.json",
        `${JSON.stringify({ version: 1, notices }, null, 2)}\n`,
      );
      expect(() => {
        syncInto(source, true);
      }).toThrow(error);
      expect(readLock(packageDir).entries).toEqual([]);
    },
  );

  it("checks the list even when the lock lost its notices entry", () => {
    syncInto(memorySource());
    const lockFile = join(packageDir, "contracts.lock.json");
    const lock = JSON.parse(readFileSync(lockFile, "utf8")) as {
      entries: { path: string }[];
    };
    lock.entries = lock.entries.filter(
      entry => !entry.path.includes("notices"),
    );
    writeFileSync(lockFile, JSON.stringify(lock));
    const changed = memorySource();
    changed.files.set("d/notices.json", noticesFile(notice("a", "draft")));
    expect(() => {
      syncInto(changed);
    }).toThrow(/has an unknown status/u);
  });

  it("refuses a new notices list that is not UTF-8", () => {
    syncInto(memorySource());
    const notUtf8 = withBytes(
      memorySource().reader,
      "d/notices.json",
      Uint8Array.of(0x7b, 0xff, 0x7d),
    );
    expect(() => {
      syncWith(packageDir, notUtf8);
    }).toThrow(/new notices list is not UTF-8 JSON/u);
  });

  it("refuses to change the notices when the locked file is missing from disk", () => {
    syncInto(memorySource());
    rmSync(join(packageDir, "src/schemas/key-delegation/v1/notices.json"));
    expect(() => {
      syncInto(memorySource());
    }).toThrow(/locked notices list is missing or differs/u);
  });

  it("refuses a locked notices list it cannot read, even when the lock agrees", () => {
    const source = memorySource();
    source.files.set("d/notices.json", noticesFile(notice("a")));
    syncInto(source);
    const path = "src/schemas/key-delegation/v1/notices.json";
    const broken = '{"version":1}\n';
    writeFileSync(join(packageDir, path), broken);
    const lockFile = join(packageDir, "contracts.lock.json");
    const lock = JSON.parse(readFileSync(lockFile, "utf8")) as {
      entries: { path: string; sha256: string }[];
    };
    for (const entry of lock.entries.filter(e => e.path === path))
      entry.sha256 = createHash("sha256").update(broken).digest("hex");
    writeFileSync(lockFile, JSON.stringify(lock));
    expect(() => {
      syncInto(source);
    }).toThrow(/locked notices list has no "notices" array/u);
  });

  it("refuses a notices list it cannot read", () => {
    syncInto(memorySource());
    const changed = memorySource();
    changed.files.set("d/notices.json", '{"version":1}\n');
    expect(() => {
      syncInto(changed);
    }).toThrow(/new notices list has no "notices" array/u);
  });

  it("refuses to change the notices when the locked list is not the one on disk", () => {
    syncInto(memorySource());
    writeFileSync(
      join(packageDir, "src/schemas/key-delegation/v1/notices.json"),
      noticesFile(),
    );
    const next = memorySource();
    next.files.set("d/notices.json", noticesFile(notice("a"), notice("b")));
    expect(() => {
      syncInto(next);
    }).toThrow(/locked notices list is missing or differs/u);
  });
});
