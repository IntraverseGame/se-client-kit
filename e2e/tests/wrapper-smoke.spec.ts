// A smoke run of the harness against the Wrapper's release bundle as it is
// today (`apps/wrapper/dist`, unmodified, served by the hermetic origin, with
// the environment configuration document the harness serves), opened with no
// launch code, so it shows the session-ended state and sends nothing to the
// Play API (session-open.spec.ts covers a launch). These tests prove that the
// fixtures work on the real bundle: it loads and accepts the configuration
// with no request outside the fake origins and no error or warning, its
// document passes the audit, the scan finds nothing, and going offline and
// back raises no error. A control shows the same check sees a refused
// configuration. They are not T-13, T-14, or T-15 (their own spec files, and
// pending.spec.ts).

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import { ENVIRONMENT_CONFIG_PATH } from "./harness/environment-config.ts";
import { expect, test } from "./harness/fixtures.ts";
import { WRAPPER_ORIGIN } from "./harness/origins.ts";

const CONFIG_URL = `${WRAPPER_ORIGIN}${ENVIRONMENT_CONFIG_PATH}`;

/** Lets the page finish what the configuration's arrival started. */
const settle = async (page: Page): Promise<void> => {
  for (let turn = 0; turn < 3; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn is one more task of the page
    await page.evaluate(
      () =>
        new Promise(resolve => {
          setTimeout(resolve, 0);
        }),
    );
  }
};

/**
 * Opens the Wrapper and waits until it has read its configuration document.
 * Returns the page's errors and warnings so far (the Wrapper logs a refused
 * configuration as a warning) and keeps collecting them.
 */
const openWrapper = async (page: Page): Promise<readonly string[]> => {
  const problems: string[] = [];
  page.on("pageerror", error => {
    problems.push(`pageerror: ${error.message}`);
  });
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  const configRead = page.waitForEvent(
    "requestfinished",
    request => request.url() === CONFIG_URL,
  );
  const response = await page.goto(`${WRAPPER_ORIGIN}/`);
  expect(response?.status()).toBe(200);
  await configRead;
  await settle(page);
  await expect(page.locator("#app")).toBeAttached();
  return problems;
};

test.describe("the Wrapper's release bundle (smoke)", () => {
  test("loads from the hermetic origin with no error", async ({ page }) => {
    const problems = await openWrapper(page);
    await expect(page).toHaveTitle("SuperEngine Wrapper");
    expect(problems).toEqual([]);
    await expect(
      page.getByRole("heading", { name: "The game cannot start" }),
    ).toHaveCount(0);
  });

  test("control: shows a refused configuration, which the check would see", async ({
    page,
    context,
  }) => {
    await context.route(CONFIG_URL, route =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ environment: "nowhere" }),
      }),
    );
    const problems = await openWrapper(page);
    await expect(
      page.getByRole("heading", { name: "The game cannot start" }),
    ).toBeVisible();
    expect(problems.length).toBeGreaterThan(0);
  });

  test("passes the accessibility audit as it renders today", async ({
    page,
  }) => {
    await openWrapper(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("leaves no secret the scan can find", async ({ page, secretScan }) => {
    await openWrapper(page);
    await secretScan.expectClean();
  });

  test("goes offline and back with no error", async ({ page, network }) => {
    const problems = await openWrapper(page);
    await network.goOffline();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await network.goOnline();
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    expect(problems).toEqual([]);
  });
});
