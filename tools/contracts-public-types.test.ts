import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The runtime entry of `contracts` lists its public types by name. This keeps
// that list and the generated types in step: a new definition must be exported
// or deliberately left out here.

const source = join(import.meta.dirname, "..", "packages", "contracts", "src");

/** Generated names that are deliberately not public. */
const NOT_PUBLIC: readonly string[] = ["Snapshot1"];

const generatedNames = (): string[] =>
  [
    ...readFileSync(join(source, "generated", "snapshot.ts"), "utf8").matchAll(
      /^export (?:interface|type) ([A-Za-z0-9]+)/gmu,
    ),
  ]
    .map(match => match[1] ?? "")
    .toSorted();

const exportedNames = (): string[] => {
  const text = readFileSync(join(source, "index.ts"), "utf8");
  // The local re-export (`export type { ... };`); the names come from the
  // generated module through the `import type` above it.
  const list = /^export type \{([^}]*)\};$/mu.exec(text)?.[1];
  return (list ?? "")
    .split(",")
    .map(name => name.trim())
    .filter(name => name !== "")
    .toSorted();
};

describe("the public types of contracts", () => {
  it("exports every generated type except the ones left out on purpose", () => {
    expect(exportedNames()).toEqual(
      generatedNames().filter(name => !NOT_PUBLIC.includes(name)),
    );
  });

  it("leaves out only names the generator still emits", () => {
    expect(NOT_PUBLIC.filter(name => !generatedNames().includes(name))).toEqual(
      [],
    );
  });
});
