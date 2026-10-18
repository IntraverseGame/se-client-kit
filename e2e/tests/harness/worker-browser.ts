// Playwright's `test` with one change, its worker browser, the base of the
// suite's fixtures (fixtures.ts): each worker's browser is launched with the
// project's options, as Playwright launches it, but through `startBrowser`
// (browser-start.ts), so it never starts while another browser does, and a
// start that deadlocks is replaced once; and in a project whose block has a
// context-level part (WebKit's WebRTC removal, context-blocks.ts), every
// context it makes gets that part. Two parts of Playwright's own fixture are
// not reproduced: a remote browser (`connectOptions`, which the suite does not
// use) fails the worker instead of being launched locally in its place, and
// the `PLAYWRIGHT_DASHBOARD` bind of the browser is not made. Context reuse
// (Playwright's UI mode and editor integrations, `PW_TEST_REUSE_CONTEXT`)
// fails the worker in WebKit: a reused context is made without `newContext`,
// so it would not get the WebRTC removal.

import {
  type Browser,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  test as playwrightTest,
  expect,
} from "@playwright/test";

import { startBrowser } from "./browser-start.ts";
import { applyContextBlocks } from "./context-blocks.ts";

type WorkerArgs = PlaywrightWorkerArgs & PlaywrightWorkerOptions;

type WorkerBrowser = (
  args: WorkerArgs,
  use: (browser: Browser) => Promise<void>,
) => Promise<void>;

// `_reuseContext` is Playwright's own worker fixture (whether the `context`
// fixture reuses one context across tests); its types do not list it, so the
// function is asserted to the public fixture type. Playwright reads the
// fixtures a function needs from its destructuring, so it must be named here.
const workerBrowser = (async (
  {
    playwright,
    browserName,
    connectOptions,
    _reuseContext,
  }: WorkerArgs & { readonly _reuseContext: boolean },
  use: (browser: Browser) => Promise<void>,
): Promise<void> => {
  if (connectOptions !== undefined) {
    throw new Error(
      "connectOptions is not supported: the suite launches its browsers itself (harness/worker-browser.ts)",
    );
  }
  if (browserName === "webkit" && _reuseContext) {
    throw new Error(
      "Context reuse (UI mode, an editor integration, or PW_TEST_REUSE_CONTEXT) is not supported in the WebKit project: a reused context bypasses the WebKit WebRTC removal (harness/context-blocks.ts)",
    );
  }
  const browser = applyContextBlocks(
    await startBrowser(timeout => playwright[browserName].launch({ timeout })),
    browserName,
  );
  await use(browser);
  await browser.close({ reason: "Test ended." });
}) as WorkerBrowser;

export const test = playwrightTest.extend({
  browser: [workerBrowser, { scope: "worker", timeout: 0 }],
});

export { expect };
