// The accessibility audit's own tests: it fails a page that breaks WCAG rules
// and passes one that does not, so a clean audit of a Wrapper state means
// something; and an audit that cannot finish (the page's clock paused, which
// axe's own timers need) fails within its bound instead of hanging the run.
// The Wrapper's own audit is in wrapper-smoke.spec.ts.

import { auditAccessibility } from "./harness/accessibility.ts";
import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";

test.describe("the accessibility audit", () => {
  test("fails a page with WCAG violations, naming the rules", async ({
    page,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/inaccessible.html`);
    const rules = (await auditAccessibility(page)).map(
      violation => violation.rule,
    );
    expect(rules).toEqual(expect.arrayContaining(["image-alt", "button-name"]));
  });

  test("passes a page with none", async ({ page }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("fails within its bound when it cannot finish", async ({ page }) => {
    await page.clock.install();
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1_000);
    await expect(auditAccessibility(page, { limitMs: 2_000 })).rejects.toThrow(
      "the accessibility audit did not finish in 2000 ms",
    );
  });

  test("audits only the part of the page it is limited to", async ({
    page,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/inaccessible.html`);
    expect(await auditAccessibility(page, { include: "h1" })).toEqual([]);
  });
});
