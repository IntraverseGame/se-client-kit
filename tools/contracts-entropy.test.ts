import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applySync, planSync, readLock, verifyLock } from "./contracts-lock.ts";
import { lockedFilesIn } from "./contracts-notices.ts";
import {
  ENTROPY_CASES,
  ENTROPY_PATHS,
  entropyPath,
} from "./fixtures/contracts-entropy.ts";
import {
  type MemorySource,
  memorySource,
  SOURCES,
} from "./fixtures/contracts-memory-source.ts";

let packageDir: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), "contracts-entropy-"));
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

const syncInto = (source: MemorySource): void => {
  applySync(
    packageDir,
    planSync(
      SOURCES,
      readLock(packageDir).entries,
      source.reader,
      { allowVectorChange: false },
      lockedFilesIn(packageDir),
    ),
  );
};

describe("the Solana entropy reads in the sync", () => {
  it("records each file under its manifest name, one group each", () => {
    syncInto(memorySource());
    const entries = readLock(packageDir).entries.filter(e =>
      e.path.startsWith("src/vectors/entropy/"),
    );
    expect(entries.map(e => [e.path, e.sourceName])).toEqual(
      ENTROPY_CASES.map(name => [
        entropyPath(name),
        `entropy/v1/solana/${name}`,
      ]),
    );
    expect(entries.map(e => e.path)).toEqual(ENTROPY_PATHS);
    expect(verifyLock(packageDir)).toEqual([]);
  });

  it("refuses to change one, as a vector", () => {
    syncInto(memorySource());
    const changed = memorySource();
    changed.files.set("e/skipped-slot.json", '{"e":99}\n');
    expect(() => {
      syncInto(changed);
    }).toThrow(/skipped-slot\.json: vector files are append-only/u);
  });
});
