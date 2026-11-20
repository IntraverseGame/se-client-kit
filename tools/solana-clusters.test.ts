import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type GenesisTable = {
  readonly SOLANA_GENESIS_HASHES: ReadonlyMap<bigint | number, string>;
};

const root = join(import.meta.dirname, "..");

const load = async (path: string): Promise<GenesisTable> =>
  (await import(pathToFileURL(join(root, path)).href)) as GenesisTable;

const GENESIS_HASHES: readonly (readonly [string, string])[] = [
  ["101", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"],
  ["102", "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"],
  ["103", "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"],
];

const entriesOf = (table: GenesisTable): (readonly [string, string])[] =>
  [...table.SOLANA_GENESIS_HASHES].map(([cluster, hash]) => [
    String(cluster),
    hash,
  ]);

describe("the Solana genesis hashes pinned in code", () => {
  it.each([
    "packages/shell/src/solana-clusters.ts",
    "apps/verify/src/solana-clusters.ts",
  ])("%s holds exactly the spec's table", async path => {
    expect(entriesOf(await load(path))).toEqual(GENESIS_HASHES);
  });

  it("is the table of specs/client-kit/the-shell-package.md", () => {
    const spec = readFileSync(
      join(root, "specs", "client-kit", "the-shell-package.md"),
      "utf8",
    ).replaceAll(/\s+/gu, " ");
    for (const [cluster, hash] of GENESIS_HASHES) {
      expect(spec).toContain(`| ${cluster} | \`${hash}\` |`);
    }
  });
});
