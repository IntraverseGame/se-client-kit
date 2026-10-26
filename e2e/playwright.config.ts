import { defineConfig, devices } from "@playwright/test";

import {
  BLOCK_HOST_RESOLUTION,
  DEAD_PROXY,
  FIREFOX_BLOCK_PREFS,
} from "./tests/harness/browser-flags.ts";
import {
  PREVIEW_GLOBAL_SETUP,
  PREVIEW_GLOBAL_TIMEOUT_MS,
  PREVIEW_PROJECT,
  PREVIEW_TEST_MATCH,
  PREVIEW_TEST_TIMEOUT_MS,
  previewSetup,
} from "./tests/preview-support/preview-config.ts";

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
//
// A fourth project, `preview`, runs the suite against a real stack (RFC-002,
// runbook/preview-e2e.md). It is defined only when the launcher's entry marker is
// set (`pnpm test:e2e:preview`, tests/preview-support/run-preview.ts), and asked
// for without the marker this file throws a refusal. The preview variables are
// read only under the marker, so a run of the fake projects never reads them,
// and the three fake projects below keep their own constants and never run the
// preview specs. Playwright loads this file in the runner and in every worker;
// the marker is inherited, and the check is the same in each.
const preview = previewSetup(process.env, process.argv);
const channel = process.env["SE_E2E_BROWSER_CHANNEL"];

// On CI only, the whole run is bounded, so a hang (a test, or its teardown,
// that outlives its own timeout) fails the job with Playwright's report
// instead of running until the job's 30-minute timeout. 10 minutes is well
// above a normal run: the slowest `test:e2e` step in recent CI runs, build
// included, took 92 s (Firefox), and setup and the browser install leave the
// rest of the job's 30 minutes for it. A local run is not bounded.
const CI_GLOBAL_TIMEOUT_MS = 10 * 60 * 1000;
const onCi = process.env["CI"] !== undefined && process.env["CI"] !== "";

export default defineConfig({
  testDir: "./tests",
  forbidOnly: true,
  ...(preview.active
    ? {
        globalTimeout: PREVIEW_GLOBAL_TIMEOUT_MS,
        globalSetup: PREVIEW_GLOBAL_SETUP,
      }
    : onCi
      ? { globalTimeout: CI_GLOBAL_TIMEOUT_MS }
      : {}),
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    serviceWorkers: "allow",
    // Off, and never on: the round tests give the Wrapper's key draw the
    // signed-action vector's test key as an `addInitScript` argument
    // (tests/harness/round-play.ts), and a trace would write it to a file. The
    // round fixture fails a test that runs with tracing on.
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "preview/**",
      use: {
        ...devices["Desktop Chrome"],
        // No host name resolves: traffic outside a route reaches no host.
        launchOptions: { args: [BLOCK_HOST_RESOLUTION] },
        ...(channel === undefined || channel === "" ? {} : { channel }),
      },
    },
    {
      name: "firefox",
      testIgnore: "preview/**",
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
      testIgnore: "preview/**",
      use: {
        ...devices["Desktop Safari"],
        // Outside a route, a dead proxy (browser-flags.ts).
        launchOptions: { proxy: DEAD_PROXY },
      },
    },
    ...(preview.active
      ? [
          {
            name: PREVIEW_PROJECT,
            testMatch: PREVIEW_TEST_MATCH,
            timeout: PREVIEW_TEST_TIMEOUT_MS,
            retries: 0,
            use: {
              ...devices["Desktop Chrome"],
              // The hosts of the allow-list resolve; no other name does. The
              // browser's whole environment is the allow-list's (never the
              // runner's).
              launchOptions: {
                args: [...preview.browserArgs],
                env: { ...preview.browserEnv },
              },
              ...(channel === undefined || channel === "" ? {} : { channel }),
            },
          },
        ]
      : []),
  ],
});
