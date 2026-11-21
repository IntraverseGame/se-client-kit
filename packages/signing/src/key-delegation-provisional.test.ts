import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// S3 landed on provisional constants copied from the backend's published
// vectors; S2 deleted them and moved their tests onto the vendored
// `key-delegation/v1 vectors` (fixtures/key-delegation-vectors.ts).

describe("the provisional constants S3 used", () => {
  // Spelled in parts, so this file does not name them itself.
  const name = ["provisional", "key-delegation"].join("-");

  it("are gone, and no file of the package names them", () => {
    const source = import.meta.dirname;
    const files = readdirSync(source, { recursive: true, encoding: "utf8" });
    expect(files).not.toContain(join("fixtures", `${name}.ts`));
    const naming = files
      .filter(file => file.endsWith(".ts"))
      .filter(file => readFileSync(join(source, file), "utf8").includes(name));
    expect(naming).toEqual([]);
  });
});
