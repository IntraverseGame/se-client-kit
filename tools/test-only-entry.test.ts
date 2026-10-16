import { describe, expect, it } from "vitest";

import { findIllegalImports, isTestPath } from "./test-only-entry.ts";

const files = (entries: Record<string, string>): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries));

const IMPORT =
  'import { vectors } from "@intraverse/se-client-contracts/testing";\n';

describe("contracts test-only entry isolation", () => {
  it("accepts test files, test helpers, and the e2e suite", () => {
    const result = findIllegalImports(
      files({
        "packages/signing/src/sign.test.ts": IMPORT,
        "packages/signing/src/test/helpers.ts": IMPORT,
        "packages/shell/src/__tests__/a.ts": IMPORT,
        "e2e/tests/fake-play-api.ts": IMPORT,
      }),
    );
    expect(result).toEqual([]);
  });

  it("flags production code that imports the entry", () => {
    const result = findIllegalImports(
      files({
        "packages/shell/src/index.ts": IMPORT,
        "apps/wrapper/src/main.ts":
          "export * from '@intraverse/se-client-contracts/testing/signing';\n",
        "packages/snapshot/src/ok.ts":
          'import {} from "@intraverse/se-client-contracts";\n',
      }),
    );
    expect(result).toEqual([
      "apps/wrapper/src/main.ts",
      "packages/shell/src/index.ts",
    ]);
  });

  it("flags a relative import of the entry's source", () => {
    const result = findIllegalImports(
      files({
        "packages/snapshot/src/index.ts":
          'import {} from "../../contracts/src/testing.ts";\n',
        "packages/shell/src/index.ts":
          'import {} from "../../contracts/testing";\n',
      }),
    );
    expect(result).toEqual([
      "packages/shell/src/index.ts",
      "packages/snapshot/src/index.ts",
    ]);
  });

  it("does not flag the entry module itself or non-source files", () => {
    const result = findIllegalImports(
      files({
        "packages/contracts/src/testing.ts": "export {};\n",
        "packages/contracts/src/testing/index.ts":
          'export * from "./signing.ts";\n',
        "README.md": "@intraverse/se-client-contracts/testing",
      }),
    );
    expect(result).toEqual([]);
  });

  it("classifies test paths", () => {
    expect(isTestPath("a/b.test.ts")).toBe(true);
    expect(isTestPath("a/b.spec.tsx")).toBe(true);
    expect(isTestPath("a/tests/b.ts")).toBe(true);
    expect(isTestPath("tools/fixtures/cases.ts")).toBe(true);
    expect(isTestPath("e2e/x.ts")).toBe(true);
    expect(isTestPath("packages/shell/src/index.ts")).toBe(false);
    expect(isTestPath("packages/shell/src/testing.ts")).toBe(false);
  });
});
