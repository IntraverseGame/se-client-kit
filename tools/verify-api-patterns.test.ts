// The verify page's reader (`apps/verify/src/verify-api.ts`) spells the vendored
// verify API document's string patterns and limits itself, since the document
// is data and not importable code. This test holds each spelling to the
// document, so a document that changes a pattern fails here until the reader
// follows (specs/verify-page.md, A-1).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const document = readFileSync(
  join(
    root,
    "packages",
    "contracts",
    "src",
    "schemas",
    "verify.v1.openapi.yaml",
  ),
  "utf8",
);

type Reader = { readonly PATTERNS: Readonly<Record<string, string>> };
const reader = (await import(
  pathToFileURL(join(root, "apps", "verify", "src", "verify-readers.ts")).href
)) as Reader;

/** The text of schema `name` under `components.schemas` (4-space indent). */
const schema = (name: string): string => {
  const start = document.indexOf(`\n    ${name}:\n`);
  if (start < 0) throw new Error(`no schema ${name}`);
  const rest = document.slice(start + 1);
  const end = rest.search(/\n {4}[A-Za-z0-9]+:\n/u);
  return end < 0 ? rest : rest.slice(0, end);
};

/** The first `pattern` written in `text`, unquoted. */
const patternIn = (text: string): string | undefined =>
  /pattern: "([^"\n]*)"/u.exec(text)?.[1];

/** The `pattern` of property `property` of schema `name` (8-space indent). */
const patternOf = (name: string, property: string): string | undefined => {
  const text = schema(name);
  const start = text.indexOf(`\n        ${property}:\n`);
  if (start < 0) return undefined;
  const rest = text.slice(start + 1);
  const end = rest.slice(1).search(/\n {8}[A-Za-z0-9]+:\n/u);
  return patternIn(end < 0 ? rest : rest.slice(0, end + 1));
};

describe("the verify page's reader against the vendored verify API document", () => {
  it.each([
    ["roundId", "RoundId"],
    ["hex32", "Hex32"],
    ["address", "Address"],
    ["signature", "Signature"],
    ["hexBytes", "HexBytes"],
    ["amount", "Amount"],
  ] as const)("spells %s as the document's %s", (key, name) => {
    expect(patternIn(schema(name))).toBeDefined();
    expect(reader.PATTERNS[key]).toBe(patternIn(schema(name)));
  });

  it.each([
    ["amount", "DrawnRow", "multiplierMilli"],
    ["cost", "BookVerification", "cost"],
    ["positive", "BookVerification", "totalWeight"],
  ] as const)("spells %s as the document's %s.%s (V-21)", (key, name, prop) => {
    expect(patternOf(name, prop)).toBeDefined();
    expect(reader.PATTERNS[key]).toBe(patternOf(name, prop));
  });

  it("holds a book round's int64 fields to integers from their minimum (V-21)", () => {
    expect(schema("DrawnRow")).toMatch(
      /index:\n {10}type: integer\n {10}format: int64\n {10}minimum: 0\b/u,
    );
    expect(schema("BookVerification")).toMatch(
      /entryCount:\n {10}type: integer\n {10}format: int64\n {10}minimum: 1\b/u,
    );
    expect(schema("BookVerification")).toMatch(/required: \[mode\]/u);
  });

  it("spells the house edge's pattern as an amount's", () => {
    expect(patternIn(schema("PayoutTerms"))).toBe(reader.PATTERNS["amount"]);
  });

  it("keeps an amount to 78 digits and decimals to 77", () => {
    const amount = schema("Amount");
    expect(amount).toMatch(/maxLength: 78\b/u);
    expect(amount).toMatch(/maximum: 77\b/u);
  });

  it("names the kernel version `kernel.version`, an integer from 1", () => {
    const kernel = schema("Kernel");
    expect(kernel).toMatch(/required: \[name, version, vectorSets\]/u);
    expect(kernel).toMatch(/version:\n {10}type: integer\n {10}minimum: 1\b/u);
  });
});
