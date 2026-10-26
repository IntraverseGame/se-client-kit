// Every preview spec ends with a clean secret scan (RFC-002, acceptance criterion
// 4: the scan is on in every preview test): each spec under `e2e/tests/preview/`
// takes the `secretScan` fixture and awaits `secretScan.expectClean()`. The
// check reads the source, so a spec added later that leaves the scan out fails
// here, and a negative case proves the check fails on such a spec.

import { describe, expect, it } from "vitest";

import { endsWithCleanScan, withoutCleanScan } from "./e2e-preview-scan.ts";
import { filesIn } from "./e2e-preview-support.ts";

const WITH_SCAN = `
test("a round", async ({ page, secretScan }) => {
  await play(page);
  await secretScan.expectClean();
});
`;

describe("the preview specs", () => {
  it("are the three rows", () => {
    expect(filesIn("preview").toSorted()).toEqual([
      "preview/t10-win.spec.ts",
      "preview/t11-loss.spec.ts",
      "preview/t12-cash-out.spec.ts",
    ]);
  });

  it("each takes the secretScan fixture and awaits expectClean()", () => {
    expect(withoutCleanScan("preview")).toEqual([]);
  });

  describe("the check itself", () => {
    it("accepts a spec that scans", () => {
      expect(endsWithCleanScan(WITH_SCAN)).toBe(true);
    });

    it("fails a spec that omits the call", () => {
      expect(endsWithCleanScan(WITH_SCAN.replace("expectClean", "other"))).toBe(
        false,
      );
    });

    it("fails a spec that does not take the fixture", () => {
      expect(
        endsWithCleanScan(
          WITH_SCAN.replace("{ page, secretScan }", "{ page }"),
        ),
      ).toBe(false);
    });

    it("fails a spec that does not await the call", () => {
      expect(
        endsWithCleanScan(WITH_SCAN.replace("await secretScan", "secretScan")),
      ).toBe(false);
    });

    it("is not satisfied by a comment", () => {
      expect(
        endsWithCleanScan(
          `// await secretScan.expectClean();\ntest("a", async ({ page }) => { await play(page); });`,
        ),
      ).toBe(false);
    });
  });
});
