import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  contractsScanScope,
  findCanaryProblems,
  MIN_SUBSTRING_BYTES,
  type CanaryDist,
  type Vector,
} from "./build-output-canary.ts";
import { loadVectors } from "./build-output-vectors.ts";

// The output canary against synthetic vectors and synthetic dists: it finds a
// vector's content in the final bytes however it got there.

const VECTOR_JSON = JSON.stringify(
  {
    domain: "example",
    cases: [
      { id: 1, expected: "0xaaaa", note: "first synthetic case" },
      { id: 2, expected: "0xbbbb", note: "second synthetic case" },
    ],
  },
  null,
  2,
);

const vector = (
  text: string,
  path = "packages/contracts/src/vectors/v.json",
): Vector => ({
  path,
  bytes: Buffer.from(text),
  minimumBytes: 1,
});

const dist = (
  name: string,
  files: Record<string, string | Buffer>,
): CanaryDist => ({
  name,
  files: new Map(
    Object.entries(files).map(([path, data]) => [path, Buffer.from(data)]),
  ),
});

const problems = (
  files: Record<string, string | Buffer>,
  vectors = [vector(VECTOR_JSON)],
): string[] => findCanaryProblems(vectors, [dist("wrapper", files)]);

describe("the output canary", () => {
  it("passes a dist that holds no vector", () => {
    expect(
      problems({ "index.html": "<!doctype html>", "a.js": "console.log(1)" }),
    ).toEqual([]);
  });

  it("finds an exact copy under another name (hash)", () => {
    expect(problems({ "assets/x-1a2b3c.json": VECTOR_JSON })).toEqual([
      "wrapper/dist/assets/x-1a2b3c.json: is a copy of the vector file packages/contracts/src/vectors/v.json",
    ]);
  });

  it("finds a binary copy by hash", () => {
    const bytes = Buffer.from([1, 2, 3, 4, 5, 250, 251]);
    const vectors: Vector[] = [
      { path: "packages/contracts/src/vectors/v.bin", bytes, minimumBytes: 1 },
    ];
    expect(problems({ "a.png": bytes }, vectors)).toHaveLength(1);
  });

  it.each([
    ["inlined JSON in JavaScript", `const v = ${VECTOR_JSON};\n`],
    ["minified JSON", `const v=${JSON.stringify(JSON.parse(VECTOR_JSON))};`],
    [
      "a JSON string literal (escaped)",
      `const v=${JSON.stringify(VECTOR_JSON)};`,
    ],
    [
      "a source map's sourcesContent",
      JSON.stringify({
        version: 3,
        sources: ["../v.json"],
        sourcesContent: [VECTOR_JSON],
      }),
    ],
    [
      "a base64 data URI",
      `a{background:url(data:application/json;base64,${Buffer.from(VECTOR_JSON).toString("base64")})}`,
    ],
    [
      "a larger file that contains the content",
      `/* header */\n${VECTOR_JSON}\n/* footer */`,
    ],
  ])("finds %s", (_name, text) => {
    expect(problems({ "assets/index.js": text })).toEqual([
      "wrapper/dist/assets/index.js: contains the content of the vector file packages/contracts/src/vectors/v.json",
    ]);
  });

  describe("a vector file that ends with a newline, as real files do", () => {
    const withNewline = `${VECTOR_JSON}\n`;
    const found = [
      "wrapper/dist/assets/index.js: contains the content of the vector file packages/contracts/src/vectors/v.json",
    ];

    it.each([
      ["the trailing newline trimmed", `const v = ${VECTOR_JSON};\n`],
      [
        "the trailing newline trimmed, in a string",
        JSON.stringify(VECTOR_JSON),
      ],
      [
        "the trailing newline trimmed, in a source map",
        JSON.stringify({ sourcesContent: [VECTOR_JSON] }),
      ],
      [
        "the trailing newline trimmed, as a base64 data URI",
        `url(data:application/json;base64,${Buffer.from(VECTOR_JSON).toString("base64")})`,
      ],
      [
        "CRLF line breaks",
        `const v = ${withNewline.replaceAll("\n", "\r\n")};`,
      ],
      [
        "CRLF line breaks and the trailing newline trimmed",
        `const v = ${VECTOR_JSON.replaceAll("\n", "\r\n")};`,
      ],
      [
        "CRLF line breaks, in a string",
        JSON.stringify(VECTOR_JSON.replaceAll("\n", "\r\n")),
      ],
    ])("finds a copy with %s", (_name, text) => {
      expect(
        problems({ "assets/index.js": text }, [vector(withNewline)]),
      ).toEqual(found);
    });

    it("finds an LF copy of a vector file that has CRLF line breaks", () => {
      const crlf = withNewline.replaceAll("\n", "\r\n");
      expect(
        problems({ "assets/index.js": `const v = ${VECTOR_JSON};` }, [
          vector(crlf),
        ]),
      ).toEqual(found);
    });

    it("still passes a file that holds only part of the vector", () => {
      const half = VECTOR_JSON.slice(0, VECTOR_JSON.length / 2);
      expect(
        problems({ "assets/index.js": half }, [vector(withNewline)]),
      ).toEqual([]);
    });
  });

  it("does not find a re-indented copy of a JSON vector (a stated limit)", () => {
    const reindented = JSON.stringify(JSON.parse(VECTOR_JSON), null, 4);
    expect(problems({ "assets/index.js": reindented })).toEqual([]);
  });

  it("finds a verbatim public/ copy (the dist holds the final files)", () => {
    expect(problems({ "vectors/v.json": VECTOR_JSON })).toHaveLength(1);
  });

  it("finds a vector in a package dist", () => {
    const found = findCanaryProblems(
      [vector(VECTOR_JSON)],
      [dist("shell", { "index.js": `export const v = ${VECTOR_JSON};\n` })],
    );
    expect(found).toEqual([
      "shell/dist/index.js: contains the content of the vector file packages/contracts/src/vectors/v.json",
    ]);
  });

  it("passes a file that only shares a short common substring", () => {
    const text = '{ "id": 1, "expected": "0xaaaa" }';
    expect(problems({ "a.js": `const x = ${text};` })).toEqual([]);
  });

  it("does not compare a vector below the minimum size as a substring", () => {
    const tiny = vector("[]", "packages/contracts/src/vectors/tiny.json");
    expect(Buffer.byteLength("[]")).toBeLessThan(MIN_SUBSTRING_BYTES);
    expect(problems({ "a.js": "const x = [];" }, [tiny])).toEqual([]);
  });

  it("still compares a tiny vector by hash against a whole file", () => {
    const tiny = vector("[]", "packages/contracts/src/vectors/tiny.json");
    expect(problems({ "copy.json": "[]" }, [tiny])).toHaveLength(1);
  });

  it("does not compare the compiled test-only entry below the minimum, even by hash", () => {
    const compiled: Vector = {
      path: "packages/contracts/dist/testing.js",
      bytes: Buffer.from("export {};\n"),
      minimumBytes: MIN_SUBSTRING_BYTES,
    };
    expect(problems({ "index.js": "export {};\n" }, [compiled])).toEqual([]);
  });

  it("finds the compiled test-only entry's content above the minimum", () => {
    const code = `export const vector = ${JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28])};\n`;
    const compiled: Vector = {
      path: "packages/contracts/dist/testing.js",
      bytes: Buffer.from(code),
      minimumBytes: MIN_SUBSTRING_BYTES,
    };
    expect(
      problems({ "assets/copy.js": `// c\n${code}` }, [compiled]),
    ).toHaveLength(1);
  });
});

describe("the contracts scan scope", () => {
  it("leaves out the test-only entry and its own chunks, and keeps the rest", () => {
    const files = new Map<string, Buffer>(
      Object.entries({
        "index.js": 'export * from "./schema-AAAA.js";\n',
        "schema-AAAA.js": "export const s = 1;\n",
        "testing.js":
          'import "./schema-AAAA.js";\nexport * from "./vec-BBBB.js";\n',
        "vec-BBBB.js": "export const v = [1];\n",
        "vec-BBBB.js.map": "{}",
        "testing.d.ts": "export {};\n",
        "stray.json": "{}",
      }).map(([path, text]) => [path, Buffer.from(text)]),
    );
    expect([...contractsScanScope(files).keys()].toSorted()).toEqual([
      "index.js",
      "schema-AAAA.js",
      "stray.json",
    ]);
  });
});

const withTree = (
  files: Record<string, string>,
  check: (root: string) => void,
): void => {
  const root = mkdtempSync(join(tmpdir(), "se-canary-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("loading the vectors", () => {
  it("fails, not passes, when packages/contracts/src is missing", () => {
    withTree({ "packages/contracts/package.json": "{}" }, root => {
      expect(loadVectors(root).problems).toEqual([
        "packages/contracts/src is missing: the output canary cannot fingerprint the vectors",
      ]);
    });
  });

  it("is a documented no-op for the substring scan when there is no vectors directory", () => {
    withTree({ "packages/contracts/src/index.ts": "export {};\n" }, root => {
      expect(loadVectors(root)).toEqual({ vectors: [], problems: [] });
    });
  });

  it("finds every file under vectors/ and the compiled entry", () => {
    withTree(
      {
        "packages/contracts/src/vectors/signing.json": "[1]",
        "packages/contracts/src/vectors/snapshot/valid/a.json": "{}",
        "packages/contracts/dist/testing.js": "export {};\n",
      },
      root => {
        expect(
          loadVectors(root)
            .vectors.map(found => found.path)
            .toSorted(),
        ).toEqual([
          "packages/contracts/dist/testing.js",
          "packages/contracts/src/vectors/signing.json",
          "packages/contracts/src/vectors/snapshot/valid/a.json",
        ]);
      },
    );
  });
});
