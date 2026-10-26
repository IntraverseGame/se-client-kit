// The preview network (RFC-002): the shared game origin is fulfilled by a route
// from the reference game's build and reaches no socket (the origin is on no
// allow-list and its name resolves to nothing), while the allowed preview origin
// still reaches the local test server. Chromium only, in a browser of its own
// with the preview project's flags (preview-browser.ts), against a loopback
// test server that stands in for the stack.

import type { Browser } from "@playwright/test";

import { expect, test } from "../harness/worker-browser.ts";
import { parsePreviewEnvironment } from "../preview-support/preview-environment.ts";
import { installPreviewNetwork } from "../preview-support/preview-network.ts";
import { startTestServer, type TestServer } from "./loopback-server.ts";
import { launchPreviewBrowser } from "./preview-browser.ts";

const GAME_ORIGIN = "https://game.example-games.test";

test.describe("the preview network", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "loopback is reachable in the Chromium project only",
  );

  let startedServer: TestServer | undefined;
  let startedBrowser: Browser | undefined;

  /** The server and the browser, started for this describe. */
  const started = (): { server: TestServer; browser: Browser } => {
    if (startedServer === undefined || startedBrowser === undefined) {
      throw new Error("the server and the browser are not started");
    }
    return { server: startedServer, browser: startedBrowser };
  };

  test.beforeAll(async ({ playwright }) => {
    startedServer = await startTestServer();
    startedBrowser = await launchPreviewBrowser(playwright.chromium, [
      startedServer.origin,
    ]);
  });
  test.afterAll(async () => {
    await startedBrowser?.close();
    await startedServer?.close();
  });

  test("fulfils the game origin by a route, with no request to any socket", async () => {
    const { browser, server } = started();
    const context = await browser.newContext();
    try {
      const guard = await installPreviewNetwork(
        context,
        parsePreviewEnvironment({
          SE_E2E_PREVIEW_ORIGIN: server.origin,
          SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
          SE_E2E_PREVIEW_GAME_ORIGIN: GAME_ORIGIN,
        }),
      );
      const page = await context.newPage();
      await page.goto(`${server.origin}/`);
      const before = server.requests().length;
      const served = await page.evaluate(
        address =>
          fetch(address).then(async response => ({
            status: response.status,
            text: await response.text(),
          })),
        `${GAME_ORIGIN}/`,
      );
      expect(served.status).toBe(200);
      // The reference game's page, as built.
      expect(served.text).toContain('<div id="game">');
      expect(server.requests()).toHaveLength(before);
      expect(guard.refused()).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("still refuses an origin that is neither allowed nor the game's", async () => {
    const { browser, server } = started();
    const context = await browser.newContext();
    try {
      const guard = await installPreviewNetwork(
        context,
        parsePreviewEnvironment({
          SE_E2E_PREVIEW_ORIGIN: server.origin,
          SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
          SE_E2E_PREVIEW_GAME_ORIGIN: GAME_ORIGIN,
        }),
      );
      const page = await context.newPage();
      await page.goto(`${server.origin}/`);
      await page.evaluate(
        address => fetch(address).catch(() => null),
        "https://another-game.example-games.test/",
      );
      expect(guard.takeRefused()).toEqual([
        "https://another-game.example-games.test",
      ]);
    } finally {
      await context.close();
    }
  });
});
