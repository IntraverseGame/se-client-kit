import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The runtime entry of `contracts` lists its public types by name. This keeps
// that list and the generated types in step: a new definition must be exported
// or deliberately left out here.

const source = join(import.meta.dirname, "..", "packages", "contracts", "src");

type GeneratedModule = {
  readonly file: string;
  /** Generated names that are deliberately not public. */
  readonly notPublic: readonly string[];
};

const MODULES: readonly GeneratedModule[] = [
  // `Snapshot1` is the generator's structural copy of `Snapshot`, and
  // `Amount1` its copy of `Amount` for `payout` (a `$ref` with its own
  // description).
  { file: "snapshot.ts", notPublic: ["Amount1", "Snapshot1"] },
  // The Play API document has no webhooks, no `$defs`, and no external
  // documents: all three are empty.
  { file: "play.ts", notPublic: ["$defs", "external", "webhooks"] },
  // Likewise the verify API document.
  { file: "verify.ts", notPublic: ["$defs", "external", "webhooks"] },
];

const generatedNames = (file: string): string[] =>
  [
    ...readFileSync(join(source, "generated", file), "utf8").matchAll(
      /^export (?:interface|type) ([A-Za-z0-9$]+)/gmu,
    ),
  ]
    .map(match => match[1] ?? "")
    .toSorted();

/** The generated names the entry re-exports, before any `as` rename. */
const exportedNames = (file: string): string[] => {
  const text = readFileSync(join(source, "index.ts"), "utf8");
  const list = new RegExp(
    `^export type \\{([^}]*)\\} from "\\./generated/${file.replace(".", "\\.")}";$`,
    "mu",
  ).exec(text)?.[1];
  return (list ?? "")
    .split(",")
    .map(entry => entry.trim().split(/\s+as\s+/u)[0] ?? "")
    .filter(name => name !== "")
    .toSorted();
};

describe.each(MODULES)("the public types of generated/$file", module => {
  it("exports every generated type except the ones left out on purpose", () => {
    expect(exportedNames(module.file)).toEqual(
      generatedNames(module.file).filter(
        name => !module.notPublic.includes(name),
      ),
    );
  });

  it("leaves out only names the generator still emits", () => {
    expect(
      module.notPublic.filter(
        name => !generatedNames(module.file).includes(name),
      ),
    ).toEqual([]);
  });
});
