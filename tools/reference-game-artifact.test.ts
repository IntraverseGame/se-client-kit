import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  REFERENCE_GAME_FILE_NAME,
  referenceGameArtifact,
  reproducedReferenceGame,
} from "./reference-game-artifact.ts";
import { readTar } from "./tar.ts";

const output = (entries: Record<string, string>): Map<string, Uint8Array> =>
  new Map(
    Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]),
  );

const DIST = {
  "index.html": "<!doctype html>",
  "assets/index-a1.js": "console.log(1);",
  "assets/index-b2.css": "body{}",
};

describe("referenceGameArtifact", () => {
  it("names the artifact without a version and gives a sha256 digest", () => {
    const artifact = referenceGameArtifact(output(DIST));
    expect(artifact.fileName).toBe("se-client-reference-game.tar");
    expect(artifact.fileName).toBe(REFERENCE_GAME_FILE_NAME);
    expect(artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("gives the same digest for the same files, whatever their order", () => {
    const reversed = Object.fromEntries(Object.entries(DIST).toReversed());
    expect(referenceGameArtifact(output(reversed)).digest).toBe(
      referenceGameArtifact(output(DIST)).digest,
    );
  });

  it("gives another digest when one byte changes", () => {
    expect(
      referenceGameArtifact(
        output({ ...DIST, "index.html": "<!DOCTYPE html>" }),
      ).digest,
    ).not.toBe(referenceGameArtifact(output(DIST)).digest);
  });

  it("holds exactly the output files", () => {
    expect(
      readTar(referenceGameArtifact(output(DIST)).archive).map(
        entry => entry.path,
      ),
    ).toEqual(Object.keys(DIST).toSorted());
  });

  it("refuses an output without index.html", () => {
    expect(() =>
      referenceGameArtifact(output({ "assets/index-a1.js": "" })),
    ).toThrow(/index\.html/u);
  });
});

describe("reproducedReferenceGame", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A checkout whose game build holds `entries`. */
  const checkout = (entries: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), "reference-game-"));
    roots.push(root);
    for (const [path, text] of Object.entries(entries)) {
      const file = join(root, "apps", "reference-game", "dist", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return root;
  };

  it("gives the first build's artifact when both builds are equal", () => {
    const result = reproducedReferenceGame(checkout(DIST), checkout(DIST));
    expect(result).toEqual({
      ok: true,
      artifact: referenceGameArtifact(output(DIST)),
    });
  });

  it("refuses two builds that differ, naming both digests", () => {
    const other = { ...DIST, "assets/index-a1.js": "console.log(2);" };
    const result = reproducedReferenceGame(checkout(DIST), checkout(other));
    expect(result).toEqual({
      ok: false,
      problem: `the reference game build is not reproducible: ${referenceGameArtifact(output(DIST)).digest} and ${referenceGameArtifact(output(other)).digest}`,
    });
  });
});
