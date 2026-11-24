import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { catalogSource } from "./contracts-catalog.ts";

const withEntropy = (run: (packageDir: string) => void): void => {
  const packageDir = mkdtempSync(join(tmpdir(), "contracts-catalog-entropy-"));
  try {
    const vectors = join(packageDir, "src", "vectors");
    for (const [folder, file] of [
      ["snapshot/valid", "a.json"],
      ["snapshot/invalid", "b.json"],
      ["snapshot/signature", "c.json"],
      ["snapshot/typed-data", "d.json"],
      ["snapshot/signed-action", "e.json"],
      ["kernel/v1", "f.json"],
      ["entropy/v1/solana", "g-h.json"],
    ] as const) {
      mkdirSync(join(vectors, folder), { recursive: true });
      writeFileSync(join(vectors, folder, file), "{}\n");
    }
    writeFileSync(join(vectors, "signing.json"), "{}\n");
    mkdirSync(join(vectors, "key-delegation", "v1"), { recursive: true });
    writeFileSync(
      join(vectors, "key-delegation", "v1", "vectors.json"),
      "{}\n",
    );
    run(packageDir);
  } finally {
    rmSync(packageDir, { recursive: true, force: true });
  }
};

describe("catalogSource, the Solana entropy reads", () => {
  it("exports the entropy/v1/solana/ folder as entropyVectors.solana, apart from the other vectors", () => {
    withEntropy(packageDir => {
      const source = catalogSource(packageDir);
      expect(source).toContain(
        'import vector6 from "./entropy/v1/solana/g-h.json" with { type: "json" };',
      );
      expect(source).toContain(
        'export const entropyVectors: EntropyVectors = {\n  solana: {\n    "g-h": vector6,\n  },\n};',
      );
      expect(source).toContain("  readonly solana: VectorSet;");
      const kernel = /export const kernelVectors[^;]*;/u.exec(source)?.[0];
      expect(kernel).toBeDefined();
      expect(kernel).not.toContain("vector6");
    });
  });
});
