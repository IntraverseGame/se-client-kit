// The scan's one excuse is narrow: a `SecurityError` is excused only in a
// frame whose origin, recorded before any page code ran, is "null". A
// `SecurityError` in a frame with a real origin is reported, and so is one in a
// page that wrote "null" over `self.origin` itself.

import type { Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";

/** Makes the IndexedDB listing fail with a `SecurityError`. */
const failWithSecurityError = (page: Page): Promise<void> =>
  page.evaluate(() => {
    IDBFactory.prototype.databases = () =>
      Promise.reject(new DOMException("refused on purpose", "SecurityError"));
  });

const UNREADABLE = {
  channel: "unreadable",
  secret: "SecurityError",
  detail: "indexeddb: SecurityError",
};

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

test("reports a SecurityError in a frame with a real origin", async ({
  page,
  secretScan,
}) => {
  expect(await page.evaluate(() => globalThis.origin)).toBe(PAGES_ORIGIN);
  await failWithSecurityError(page);
  expect(await secretScan.findings()).toEqual([UNREADABLE]);
});

test("reports a SecurityError in a page that fakes an opaque origin", async ({
  page,
  secretScan,
}) => {
  await page.evaluate(() => {
    // `origin` is replaceable: a page can write over it.
    Reflect.set(globalThis, "origin", "null");
  });
  expect(await page.evaluate(() => globalThis.origin)).toBe("null");
  await failWithSecurityError(page);
  expect(await secretScan.findings()).toEqual([UNREADABLE]);
});
