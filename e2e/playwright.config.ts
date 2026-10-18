import { defineConfig, devices } from "@playwright/test";

import {
  BLOCK_HOST_RESOLUTION,
  DEAD_PROXY,
  FIREFOX_BLOCK_PREFS,
} from "./tests/harness/browser-flags.ts";

// The suites run against the Wrapper's release bundle and the in-repo fake Play
// API, all served by context routes, with no real network
// (specs/client-kit/testing-and-ci.md). `SE_E2E_BROWSER_CHANNEL` runs the
// Chromium project on an installed browser channel (such as `chrome`) where
// Playwright's own build cannot be downloaded. Development only: CI does not
// use it and always runs Playwright's own browsers.
//
// Three projects. `pnpm test:e2e` runs one of them, `SE_E2E_PROJECT`
// (default `chromium`, so a local run needs Chromium only); CI runs each in a
// job of its own (.github/workflows/ci.yml, `e2e-fake`).
const channel = process.env["SE_E2E_BROWSER_CHANNEL"];

export default defineConfig({
  testDir: "./tests",
  forbidOnly: true,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    serviceWorkers: "allow",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // No host name resolves: traffic outside a route reaches no host.
        launchOptions: { args: [BLOCK_HOST_RESOLUTION] },
        ...(channel === undefined || channel === "" ? {} : { channel }),
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // Outside a route, a dead proxy; no WebRTC (browser-flags.ts).
        launchOptions: {
          proxy: DEAD_PROXY,
          firefoxUserPrefs: FIREFOX_BLOCK_PREFS,
        },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        // Outside a route, a dead proxy (browser-flags.ts).
        launchOptions: { proxy: DEAD_PROXY },
      },
    },
  ],
});
