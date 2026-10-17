import { describe, expect, it } from "vitest";

import { readTar } from "./tar.ts";
import { wrapperArtifact } from "./wrapper-artifact.ts";

const output = (entries: Record<string, string>): Map<string, Uint8Array> =>
  new Map(
    Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]),
  );

const DIST = {
  "index.html": "<!doctype html>",
  "assets/index-a1.js": "console.log(1);",
  "headers.json": "{}",
  "integrity-manifest.json": '{"algorithm":"sha256","files":{}}',
};

describe("wrapperArtifact", () => {
  it("names the artifact by version and gives a sha256 digest", () => {
    const artifact = wrapperArtifact("1.2.3", output(DIST));
    expect(artifact.fileName).toBe("se-client-wrapper-1.2.3.tar");
    expect(artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("gives the same digest for the same files, whatever their order", () => {
    const reversed = Object.fromEntries(Object.entries(DIST).toReversed());
    expect(wrapperArtifact("1.2.3", output(reversed)).digest).toBe(
      wrapperArtifact("1.2.3", output(DIST)).digest,
    );
  });

  it("gives another digest when one byte changes", () => {
    expect(
      wrapperArtifact(
        "1.2.3",
        output({ ...DIST, "index.html": "<!DOCTYPE html>" }),
      ).digest,
    ).not.toBe(wrapperArtifact("1.2.3", output(DIST)).digest);
  });

  it("holds exactly the output files", () => {
    expect(
      readTar(wrapperArtifact("1.2.3", output(DIST)).archive).map(
        entry => entry.path,
      ),
    ).toEqual(Object.keys(DIST).toSorted());
  });

  it("refuses an output without the integrity manifest", () => {
    expect(() =>
      wrapperArtifact("1.2.3", output({ "index.html": "<!doctype html>" })),
    ).toThrow(/integrity-manifest\.json/u);
  });
});
