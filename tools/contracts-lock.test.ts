import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GROUPS } from "./contracts-groups.ts";
import {
  applySync,
  LOCK_FILE,
  planSync,
  readLock,
  verifyLock,
} from "./contracts-lock.ts";
import {
  COMMIT_A,
  COMMIT_B,
  type MemorySource,
  memorySource,
  SOURCES,
} from "./fixtures/contracts-memory-source.ts";

const committedPackage = join(
  import.meta.dirname,
  "..",
  "packages",
  "contracts",
);

let packageDir: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), "contracts-lock-"));
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

const syncInto = (source: MemorySource, allowVectorChange = false): void => {
  applySync(
    packageDir,
    planSync(SOURCES, readLock(packageDir).entries, source.reader, {
      allowVectorChange,
    }),
  );
};

const lockText = (): string =>
  readFileSync(join(packageDir, LOCK_FILE), "utf8");

/** Rewrite fields of the first lock entry, then verify the package. */
const editFirstEntry = (fields: Record<string, string>): string[] => {
  const lock = JSON.parse(lockText()) as {
    entries: Record<string, string>[];
  };
  for (const entry of lock.entries.slice(0, 1)) Object.assign(entry, fields);
  writeFileSync(join(packageDir, LOCK_FILE), JSON.stringify(lock));
  return verifyLock(packageDir);
};

describe("sync", () => {
  it("copies each source to its pinned place and records where it came from", () => {
    syncInto(memorySource());
    const { entries, problems } = readLock(packageDir);
    expect(problems).toEqual([]);
    expect(entries.map(entry => entry.path)).toEqual([
      "src/schemas/play.v1.openapi.yaml",
      "src/schemas/se.snapshot.v1.schema.json",
      "src/schemas/verify.v1.openapi.yaml",
      "src/vectors/kernel/v1/derive.json",
      "src/vectors/kernel/v1/seed.json",
      "src/vectors/kernel/v1/shuffle-draw.json",
      "src/vectors/kernel/v1/steps-derive.json",
      "src/vectors/signing.json",
      "src/vectors/snapshot/invalid/b.json",
      "src/vectors/snapshot/signature/d.json",
      "src/vectors/snapshot/signed-action/f.json",
      "src/vectors/snapshot/typed-data/e.json",
      "src/vectors/snapshot/valid/a.json",
    ]);
    expect(entries.filter(e => e.path === "src/vectors/signing.json")).toEqual([
      {
        path: "src/vectors/signing.json",
        source: "contracts",
        sourceName: "test/vectors/signing.json",
        sourceCommit: COMMIT_A,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) as unknown,
      },
    ]);
    expect(
      entries
        .filter(e => e.path === "src/vectors/snapshot/valid/a.json")
        .map(e => e.sourceName),
    ).toEqual(["se.snapshot/1 vectors/valid/a.json"]);
    expect(
      readFileSync(join(packageDir, "src/vectors/signing.json"), "utf8"),
    ).toBe('{"s":3}\n');
    expect(verifyLock(packageDir)).toEqual([]);
  });

  it("is deterministic: syncing the same sources again changes nothing", () => {
    syncInto(memorySource());
    const first = lockText();
    syncInto(memorySource());
    expect(lockText()).toBe(first);
  });

  it("adds a vector and updates a file that is not a vector", () => {
    syncInto(memorySource());
    const next = memorySource();
    next.files.set("s/invalid/c.json", '{"c":4}\n');
    next.files.set("s/schema.json", '{"type":"string"}\n');
    next.commit = COMMIT_B;
    syncInto(next);
    expect(readLock(packageDir).entries.map(entry => entry.path)).toContain(
      "src/vectors/snapshot/invalid/c.json",
    );
    expect(verifyLock(packageDir)).toEqual([]);
  });

  it("refuses to change a locked vector, and leaves the package untouched", () => {
    syncInto(memorySource());
    const changed = memorySource();
    changed.files.set("s/valid/a.json", '{"a":99}\n');
    expect(() => {
      syncInto(changed);
    }).toThrow(/append-only; refusing to change/u);
    expect(verifyLock(packageDir)).toEqual([]);
  });

  it("records each fairness kernel vector set under its set id, append-only", () => {
    syncInto(memorySource());
    expect(
      readLock(packageDir)
        .entries.filter(e => e.path.startsWith("src/vectors/kernel/"))
        .map(e => [e.path, e.sourceName]),
    ).toEqual([
      ["src/vectors/kernel/v1/derive.json", "kernel/public/v1/derive"],
      ["src/vectors/kernel/v1/seed.json", "kernel/public/v1/seed"],
      [
        "src/vectors/kernel/v1/shuffle-draw.json",
        "kernel/public/v1/shuffle-draw",
      ],
      [
        "src/vectors/kernel/v1/steps-derive.json",
        "kernel/public/v1/steps-derive",
      ],
    ]);
    const changed = memorySource();
    changed.files.set("k/derive.json", '{"k":99}\n');
    expect(() => {
      syncInto(changed);
    }).toThrow(/derive\.json: vector files are append-only/u);
  });

  it("changes a locked vector only when told to", () => {
    syncInto(memorySource());
    const changed = memorySource();
    changed.files.set("s/valid/a.json", '{"a":99}\n');
    syncInto(changed, true);
    expect(verifyLock(packageDir)).toEqual([]);
    expect(
      readFileSync(
        join(packageDir, "src/vectors/snapshot/valid/a.json"),
        "utf8",
      ),
    ).toBe('{"a":99}\n');
  });

  it("refuses to remove a locked vector, unless told to", () => {
    syncInto(memorySource());
    const removed = memorySource();
    removed.files.delete("s/valid/a.json");
    removed.files.set("s/valid/z.json", "{}\n");
    expect(() => {
      syncInto(removed);
    }).toThrow(/append-only; refusing to remove/u);
    syncInto(removed, true);
    expect(readLock(packageDir).entries.map(entry => entry.path)).not.toContain(
      "src/vectors/snapshot/valid/a.json",
    );
  });

  it("fails clearly when a source file is missing", () => {
    const source = memorySource();
    source.files.delete("v/signing.json");
    expect(() => {
      syncInto(source);
    }).toThrow(/has no files/u);
  });

  it("fails clearly when a source directory is empty", () => {
    const source = memorySource();
    source.files.delete("s/valid/a.json");
    expect(() => {
      syncInto(source);
    }).toThrow(/has no files/u);
  });
});

describe("verify", () => {
  beforeEach(() => {
    syncInto(memorySource());
  });

  it("passes after a sync", () => {
    expect(verifyLock(packageDir)).toEqual([]);
  });

  it("fails when a vendored file changes without the lock", () => {
    writeFileSync(
      join(packageDir, "src/schemas/se.snapshot.v1.schema.json"),
      "{}\n",
    );
    expect(verifyLock(packageDir)).toEqual([
      `src/schemas/se.snapshot.v1.schema.json: content differs from ${LOCK_FILE} (sha256 mismatch)`,
    ]);
  });

  it("fails when a vendored file is missing", () => {
    rmSync(join(packageDir, "src/vectors/signing.json"));
    expect(verifyLock(packageDir)).toEqual([
      `src/vectors/signing.json: in ${LOCK_FILE} but missing on disk`,
    ]);
  });

  it("fails when a file in a managed location is not in the lock", () => {
    writeFileSync(
      join(packageDir, "src/vectors/snapshot/valid/extra.json"),
      "{}\n",
    );
    expect(verifyLock(packageDir)).toEqual([
      `src/vectors/snapshot/valid/extra.json: on disk but not in ${LOCK_FILE}`,
    ]);
  });

  it("fails on an entry without a full source commit or a source", () => {
    const problems = editFirstEntry({ sourceCommit: "abc", source: "" }).join(
      "\n",
    );
    expect(problems).toMatch(/sourceCommit is not a full commit hash/u);
    expect(problems).toMatch(/source is empty/u);
  });

  it("fails on a sourceName that is a path in a private repository", () => {
    expect(
      editFirstEntry({ sourceName: "internal/some/private/play.yaml" }),
    ).toEqual([
      'src/schemas/play.v1.openapi.yaml: sourceName must be the public name "play/v1 OpenAPI document"',
    ]);
  });

  it("fails on an entry outside every managed location", () => {
    writeFileSync(join(packageDir, "src/stray.json"), "{}\n");
    const problems = editFirstEntry({ path: "src/stray.json" }).join("\n");
    expect(problems).toMatch(/src\/stray\.json: not in a managed location/u);
  });

  it.each([
    ["not JSON", "{"],
    ["the wrong version", '{"lockVersion":2,"entries":[]}'],
    ["entries that are not a list", '{"lockVersion":1,"entries":{}}'],
    ["a malformed entry", '{"lockVersion":1,"entries":[{"path":1}]}'],
  ])("reports a lock file that is %s", (_name, text) => {
    writeFileSync(join(packageDir, LOCK_FILE), text);
    expect(readLock(packageDir).problems).not.toEqual([]);
    expect(verifyLock(packageDir)).not.toEqual([]);
  });
});

describe("the committed package", () => {
  it("matches its lock file", () => {
    expect(verifyLock(committedPackage)).toEqual([]);
  });

  it("has lock entries for every group the sync manages", () => {
    const { entries } = readLock(committedPackage);
    const missing = GROUPS.filter(
      group =>
        // A file is its own destination; a directory holds the entry below it.
        !entries.some(entry =>
          `${entry.path}/`.startsWith(`${group.destination}/`),
        ),
    ).map(group => group.id);
    expect(missing).toEqual([]);
  });
});
