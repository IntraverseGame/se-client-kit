import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toTypeAliases, withoutReferenceNotes } from "./generate-contracts.ts";

const generatedSnapshotTypes = (): string =>
  readFileSync(
    join(
      import.meta.dirname,
      "..",
      "packages",
      "contracts",
      "src",
      "generated",
      "snapshot.ts",
    ),
    "utf8",
  );

const note = (name: string): string =>
  ` * This interface was referenced by \`undefined\`'s JSON-Schema\n * via the \`definition\` "${name}".\n`;

describe("toTypeAliases", () => {
  it("rewrites an exported interface as a type alias", () => {
    expect(
      toTypeAliases(
        "/** A comment. */\nexport interface Amount {\nvalue: string\n}\n",
      ),
    ).toBe("/** A comment. */\nexport type Amount = {\nvalue: string\n}\n");
  });

  it("leaves type aliases and property text untouched", () => {
    const source =
      'export type RoundId = string\nexport type Step = {\nkind: "export interface X {"\n}\n';
    expect(toTypeAliases(source)).toBe(source);
  });

  it("fails on an interface that extends another", () => {
    expect(() =>
      toTypeAliases("export interface B extends A {\nb: string\n}\n"),
    ).toThrow("cannot rewrite as a type alias: export interface B extends A {");
  });

  it("leaves no interface in the committed Snapshot types", () => {
    expect(generatedSnapshotTypes()).not.toMatch(/^export interface /mu);
  });
});

describe("withoutReferenceNotes", () => {
  it("drops a doc comment that holds only reference notes", () => {
    expect(
      withoutReferenceNotes(
        `/**\n${note("Theme")} * \n${note("Theme")} */\nexport type Theme = {\n}\n`,
      ),
    ).toBe("export type Theme = {\n}\n");
  });

  it("keeps the description of a doc comment", () => {
    expect(
      withoutReferenceNotes(
        `/**\n * UUIDv7.\n * \n${note("RoundId")} * \n${note("RoundId")} */\nexport type RoundId = string\n`,
      ),
    ).toBe("/**\n * UUIDv7.\n */\nexport type RoundId = string\n");
  });

  it("fails on a reference note in another shape", () => {
    expect(() =>
      withoutReferenceNotes(
        "/**\n * This schema was referenced by `x`'s JSON-Schema.\n */\n",
      ),
    ).toThrow("cannot drop the reference note");
  });

  it("leaves no reference note in the committed Snapshot types", () => {
    expect(generatedSnapshotTypes()).not.toMatch(/was referenced by/u);
  });
});
