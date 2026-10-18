// The network harness's own tests: going offline fails the Play API and the
// page sees it, coming back restores both, and cutting only the Play API
// leaves the rest of the page online. Offline, the page's request reaches the
// fake's route per project (`OFFLINE_ROUTED`), and the harness's `sent` sees it
// in every project.

import type { Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures.ts";
import { OFFLINE_ROUTED } from "./harness/network.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { servedFor } from "./harness/wrapper-page.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

const snapshotCall = (page: Page): Promise<string> =>
  page.evaluate(() =>
    fetch("/play/v1/snapshot").then(
      response => `status ${response.status}`,
      (error: unknown) =>
        error instanceof TypeError ? "network failure" : "other",
    ),
  );

/** Posts `body` to the move's route, as the Wrapper sends a move. */
const continueCall = (page: Page, body: unknown): Promise<string> =>
  page.evaluate(
    sentBody =>
      fetch("/play/v1/rounds:continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sentBody),
      }).then(
        response => `status ${response.status}`,
        (error: unknown) =>
          error instanceof TypeError ? "network failure" : "other",
      ),
    body,
  );

const onLine = (page: Page): Promise<boolean> =>
  page.evaluate(() => navigator.onLine);

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

test.describe("the network harness", () => {
  test("takes the browser offline and back", async ({ page, network }) => {
    // Without a token the fake answers 401: it is reachable.
    expect(await snapshotCall(page)).toBe("status 401");
    await page.evaluate(() => {
      globalThis.addEventListener("offline", () => {
        Reflect.set(globalThis, "sawOffline", true);
      });
    });
    await network.goOffline();
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(globalThis, "sawOffline") === true),
      )
      .toBe(true);
    expect(await onLine(page)).toBe(false);
    expect(await snapshotCall(page)).toBe("network failure");
    await network.goOnline();
    expect(await onLine(page)).toBe(true);
    expect(await snapshotCall(page)).toBe("status 401");
  });

  test("offline, a request is sent in every project, and routed per OFFLINE_ROUTED", async ({
    page,
    fakePlayApi,
    network,
    browserName,
  }) => {
    const body = { probe: "offline" };
    await network.goOffline();
    const outcome = await continueCall(page, body);
    expect(outcome).toBe("network failure");
    // The context's `request` event sees it, whether a route does or not.
    await expect.poll(() => network.sent("continueRound")).toEqual([body]);
    const routed = servedFor(fakePlayApi, "continueRound").length > 0;
    // One plain line on stdout, so the CI log shows it: the outcome only.
    console.log(`offline-routing ${browserName}: ${String(routed)}`);
    expect(routed).toBe(OFFLINE_ROUTED[browserName]);
    await network.goOnline();
  });

  test("cuts only the Play API", async ({ page, network }) => {
    network.cutPlayApi();
    expect(await snapshotCall(page)).toBe("network failure");
    expect(await onLine(page)).toBe(true);
    const page2 = await page.evaluate(
      async () => (await fetch("/blank.html")).status,
    );
    expect(page2).toBe(200);
    network.restorePlayApi();
    expect(await snapshotCall(page)).toBe("status 401");
  });
});
