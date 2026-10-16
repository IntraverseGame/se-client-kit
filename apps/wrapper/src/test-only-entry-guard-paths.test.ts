// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ASSET_CASES,
  ASSET_OK_CASES,
  CSS_COMPOSES_CASES,
  CSS_IMPORT_CASES,
  UNPARSABLE_CASES,
} from "./fixtures/guard-assets.ts";
import {
  STRAY_QUOTE_CASES,
  useGuardScratch,
  VECTOR,
} from "./fixtures/guard-scratch.ts";
import { WORKER_CASES } from "./fixtures/guard-workers.ts";

// Every form in which a vectors path can reach the Wrapper bundle must fail a
// real Vite build with the guard on (see test-only-entry-guard.test.ts).

const { bundle } = useGuardScratch();

describe("the Wrapper's test-only-entry guard, path and literal forms", () => {
  it.each([
    ["a vectors JSON file by relative path", "src/vector-json.ts"],
    ["a vectors TypeScript file by relative path", "src/vector-ts.ts"],
    ["import.meta.glob over the vectors", "src/vector-glob.ts"],
    ["a ?raw import of a vectors file", "src/vector-raw.ts"],
    ["a new URL asset in the vectors", "src/vector-url.ts"],
    ["the entry under a differently cased path", "src/mixed-case.ts"],
    ["a new URL with a /./ segment", "src/url-dot.ts"],
    ["a new URL with an x/.. segment", "src/url-updir.ts"],
    ["a new URL with a doubled slash", "src/url-slashes.ts"],
    ["a new URL with backslashes", "src/url-backslash.ts"],
    ["a new URL with a \\x hex escape", "src/url-hex.ts"],
    ["a new URL with a \\u{...} escape", "src/url-unicode.ts"],
    ["a new URL with an octal escape", "src/url-octal.ts"],
    ["a new URL with a line continuation", "src/url-continuation.ts"],
  ])("fails a build that reaches %s", async (_name, entry) => {
    await expect(bundle(entry, { guard: true })).rejects.toThrow(
      /test-only entry or a vector/u,
    );
  });

  it("builds a module with ordinary escapes and an unrelated new URL", async () => {
    const code = await bundle("src/escapes-ok.ts", { guard: true });
    expect(code).toContain("data:image/png");
  });

  it("lets those same imports into the bundle without the guard (the defects)", async () => {
    const code = await bundle("src/vector-ts.ts", { guard: false });
    expect(code).toMatch(VECTOR);
  });

  it.each(STRAY_QUOTE_CASES)("fails a build when %s", async (_name, entry) => {
    await expect(bundle(entry, { guard: true })).rejects.toThrow(
      /test-only entry or a vector/u,
    );
  });

  describe("workers, which Vite bundles with their own plugin pipeline", () => {
    it.each(WORKER_CASES)("fails a build with %s", async (_name, entry) => {
      await expect(bundle(entry, { guard: true })).rejects.toThrow(
        /test-only entry or a vector/u,
      );
    });

    it.each(["es", "iife"] as const)(
      "fails with worker.format %s",
      async format => {
        await expect(
          bundle("src/worker-url-direct.ts", {
            guard: true,
            workerFormat: format,
          }),
        ).rejects.toThrow(/test-only entry or a vector/u);
      },
    );

    it.each(WORKER_CASES)(
      "would not fail without worker.plugins, for %s (the defect)",
      async (_name, entry) => {
        await expect(
          bundle(entry, { guard: true, noWorkerGuard: true }),
        ).resolves.toBeTypeOf("string");
      },
    );
  });

  it("refuses a script module it cannot parse (a malformed escape)", async () => {
    await expect(
      bundle("src/url-malformed.ts", { guard: true }),
    ).rejects.toThrow(/cannot parse/u);
  });

  describe("CSS and HTML, whose paths Vite decodes before it reads them", () => {
    it.each(ASSET_CASES)("fails a build with %s", async (_name, entry) => {
      await expect(bundle(entry, { guard: true })).rejects.toThrow(
        /test-only entry or a vector/u,
      );
    });

    it.each(ASSET_CASES)(
      "builds without the guard, for %s (the defect)",
      async (_name, entry) => {
        await expect(bundle(entry, { guard: false })).resolves.toBeTypeOf(
          "string",
        );
      },
    );

    it.each(ASSET_OK_CASES)("builds %s", async (_name, entry) => {
      await expect(bundle(entry, { guard: true })).resolves.toBeTypeOf(
        "string",
      );
    });
  });

  describe("script modules the guard cannot parse", () => {
    it.each(UNPARSABLE_CASES)("refuses %s", async (_name, entry) => {
      await expect(bundle(entry, { guard: true })).rejects.toThrow(
        /cannot parse/u,
      );
    });

    it.each(UNPARSABLE_CASES)(
      "builds without the guard, for %s (Vite accepts it)",
      async (_name, entry) => {
        await expect(bundle(entry, { guard: false })).resolves.toBeTypeOf(
          "string",
        );
      },
    );

    it("lets unparsable third-party code through (the resolve layer covers it)", async () => {
      await expect(
        bundle("src/uses-bad-lib.ts", { guard: true }),
      ).resolves.toBeTypeOf("string");
    });
  });

  describe("CSS @import, which Vite inlines by reading the imported file itself", () => {
    it.each(CSS_IMPORT_CASES)("fails a build with %s", async (_name, entry) => {
      await expect(bundle(entry, { guard: true })).rejects.toThrow(/@import/u);
    });

    it.each(CSS_IMPORT_CASES)(
      "builds without the guard, for %s (the defect)",
      async (_name, entry) => {
        await expect(bundle(entry, { guard: false })).resolves.toBeTypeOf(
          "string",
        );
      },
    );
  });

  describe("CSS Modules composes from a file, which Vite loads by reading it", () => {
    it.each(CSS_COMPOSES_CASES)(
      "fails a build with %s",
      async (_name, entry) => {
        await expect(bundle(entry, { guard: true })).rejects.toThrow(
          /composes/u,
        );
      },
    );

    it.each(CSS_COMPOSES_CASES)(
      "builds without the guard, for %s (the defect)",
      async (_name, entry) => {
        await expect(bundle(entry, { guard: false })).resolves.toBeTypeOf(
          "string",
        );
      },
    );
  });
});
