// Playwright's `test` with one change, the base of the suite's fixtures
// (fixtures.ts): each worker's browser is launched with the project's options,
// as Playwright launches it, but through `startBrowser` (browser-start.ts), so
// it never starts while another browser does, and a start that deadlocks is
// replaced once. Two parts of Playwright's own fixture are not reproduced: a
// remote browser (`connectOptions`, which the suite does not use) fails the
// worker instead of being launched locally in its place, and the
// `PLAYWRIGHT_DASHBOARD` bind of the browser is not made.

import { test as playwrightTest, expect } from "@playwright/test";

import { startBrowser } from "./browser-start.ts";

export const test = playwrightTest.extend({
  browser: [
    async ({ playwright, browserName, connectOptions }, use) => {
      if (connectOptions !== undefined) {
        throw new Error(
          "connectOptions is not supported: the suite launches its browsers itself (harness/worker-browser.ts)",
        );
      }
      const browser = await startBrowser(timeout =>
        playwright[browserName].launch({ timeout }),
      );
      await use(browser);
      await browser.close({ reason: "Test ended." });
    },
    { scope: "worker", timeout: 0 },
  ],
});

export { expect };
