// The vendored Play API and verify API documents and the Snapshot schema refer only inside
// themselves (`#/...`), so generating their types reads nothing else: no other
// file and no network (tools/generate-contracts.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schemas = join(
  import.meta.dirname,
  "..",
  "packages",
  "contracts",
  "src",
  "schemas",
);

/** Every `$ref` value in a YAML document, as written. */
const yamlRefs = (text: string): string[] =>
  [...text.matchAll(/\$ref:\s*(\S+?)\s*[,}\n]/gu)].map(match =>
    (match[1] ?? "").replaceAll(/^["']|["']$/gu, ""),
  );

/** Every `$ref` value in a parsed JSON document. */
const jsonRefs = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(item => jsonRefs(item));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "$ref" ? [String(item)] : jsonRefs(item),
  );
};

const isLocal = (ref: string): boolean => /^#(?:\/|$)/u.test(ref);

/** How many times `$ref` is written in the text. */
const refCount = (text: string): number => text.split("$ref").length - 1;

describe("the vendored documents' references", () => {
  it("are all local in the Play API document", () => {
    const text = readFileSync(join(schemas, "play.v1.openapi.yaml"), "utf8");
    const refs = yamlRefs(text);
    expect(refs.length).toBe(refCount(text));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(ref => !isLocal(ref))).toEqual([]);
  });

  it("are all local in the verify API document", () => {
    const text = readFileSync(join(schemas, "verify.v1.openapi.yaml"), "utf8");
    const refs = yamlRefs(text);
    expect(refs.length).toBe(refCount(text));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(ref => !isLocal(ref))).toEqual([]);
  });

  it("are all local in the Snapshot schema", () => {
    const refs = jsonRefs(
      JSON.parse(
        readFileSync(join(schemas, "se.snapshot.v1.schema.json"), "utf8"),
      ),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(ref => !isLocal(ref))).toEqual([]);
  });
});
