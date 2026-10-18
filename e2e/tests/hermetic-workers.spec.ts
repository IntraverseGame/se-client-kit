// Sockets the hermetic routes cannot see: a WebSocket opened by a dedicated
// worker or by a service worker's install handler is not intercepted by
// Playwright's routes and is not recorded. What stops it is the browser-level
// block (browser-flags.ts: no host name resolves). These tests prove that such
// a socket, aimed by name at a loopback listener the test owns, never reaches
// it, and a control run without the block proves the same socket would.

import type { Browser, BrowserType, Page, TestInfo } from "@playwright/test";

import { BLOCK_HOST_RESOLUTION } from "./harness/browser-flags.ts";
import {
  launchedCommandLines,
  startBrowser,
  startedAlone,
} from "./harness/browser-start.ts";
import { expect, test } from "./harness/fixtures.ts";
import { guardNetwork } from "./harness/hermetic.ts";
import {
  listenOnLoopback,
  type LoopbackListener,
} from "./harness/loopback-listener.ts";
import { PAGES_ORIGIN, TEST_PAGES } from "./harness/origins.ts";
import { serveDirectory } from "./harness/static-origin.ts";

const socketUrl = (listener: LoopbackListener): string =>
  `wss://localhost:${listener.port}/`;

/** Opens a socket from a dedicated worker; resolves with how it ended. */
const fromWorker = (page: Page, url: string): Promise<string> =>
  page.evaluate(
    target =>
      new Promise<string>(resolve => {
        const worker = new Worker(
          `/socket-worker.js?url=${encodeURIComponent(target)}`,
        );
        worker.addEventListener("message", event => {
          resolve(String(event.data));
        });
      }),
    url,
  );

/** Opens a socket from a service worker's install handler. */
const fromServiceWorker = (page: Page, url: string): Promise<string> =>
  page.evaluate(
    target =>
      new Promise<string>(resolve => {
        const channel = new BroadcastChannel("socket-result");
        channel.addEventListener("message", event => {
          resolve(String(event.data));
        });
        void navigator.serviceWorker.register(
          `/socket-sw.js?url=${encodeURIComponent(target)}`,
        );
      }),
    url,
  );

/**
 * Chrome's local network access checks also stop a public origin's socket to
 * the loopback listener, which would make the tests pass for the wrong reason.
 * Both launches below turn them off, so the only difference between them is the
 * host-resolution block.
 */
const ALLOW_LOOPBACK =
  "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults";

type Launched = { readonly page: Page; readonly close: () => Promise<void> };

/**
 * A hermetic page in a browser of its own, with or without the block. If
 * anything after the launch fails, the browser is closed before the error is
 * passed on, so a failed launch leaves no browser behind.
 */
const launchPage = async (
  launch: (args: readonly string[]) => Promise<Browser>,
  blocked: boolean,
): Promise<Launched> => {
  const browser = await launch(
    blocked ? [ALLOW_LOOPBACK, BLOCK_HOST_RESOLUTION] : [ALLOW_LOOPBACK],
  );
  try {
    const context = await browser.newContext({ serviceWorkers: "allow" });
    await guardNetwork(context);
    await serveDirectory(context, PAGES_ORIGIN, TEST_PAGES);
    const page = await context.newPage();
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    return { page, close: () => browser.close() };
  } catch (error: unknown) {
    await browser.close();
    throw error;
  }
};

const projectArgs = (testInfo: TestInfo): readonly string[] =>
  testInfo.project.use.launchOptions?.args ?? [];

type Opener = (page: Page, url: string) => Promise<string>;

const OPENERS: readonly (readonly [string, Opener])[] = [
  ["a dedicated worker", fromWorker],
  ["a service worker's install handler", fromServiceWorker],
];

type Launch = (args: readonly string[]) => Promise<Browser>;

/**
 * Each test here starts two browsers of its own besides the worker's, so it
 * starts them through the start lock, as the worker's browser is: on macOS a
 * Google Chrome whose start overlaps another's can hang for good
 * (harness/browser-start.ts).
 */
const launcher =
  (
    playwright: { readonly chromium: BrowserType },
    channel: string | undefined,
  ): Launch =>
  args =>
    startBrowser(timeout =>
      playwright.chromium.launch({
        args: [...args],
        timeout,
        ...(channel === undefined ? {} : { channel }),
      }),
    );

/**
 * Opens a socket from `open` in a fresh browser, with or without the block, and
 * returns how it ended and how many connections the listener saw. The listener
 * and the browser are closed however it ends, a failed launch included.
 */
const attempt = async (
  launch: Launch,
  open: Opener,
  blocked: boolean,
  listen: () => Promise<LoopbackListener> = listenOnLoopback,
): Promise<{ readonly ended: string; readonly connections: number }> => {
  let listener: LoopbackListener | undefined;
  let launched: Launched | undefined;
  try {
    listener = await listen();
    launched = await launchPage(launch, blocked);
    const ended = await open(launched.page, socketUrl(listener));
    return { ended, connections: listener.connections() };
  } finally {
    await launched?.close();
    await listener?.close();
  }
};

/**
 * A launch that fails partway: its browser is a stand-in (no real browser is
 * started) whose `newContext` fails, and which records whether it was closed.
 */
const failingPartway = (): {
  readonly launch: Launch;
  readonly closed: () => boolean;
} => {
  let closed = false;
  const browser = {
    newContext: () => Promise.reject(new Error("newContext failed on purpose")),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  };
  return {
    closed: () => closed,
    launch: () => Promise.resolve(browser as unknown as Browser),
  };
};

/** Creates the loopback listener and keeps it, to check it was closed. */
const keptListener = (): {
  readonly listen: () => Promise<LoopbackListener>;
  readonly listener: () => LoopbackListener | undefined;
} => {
  let kept: LoopbackListener | undefined;
  return {
    listener: () => kept,
    listen: async () => {
      kept = await listenOnLoopback();
      return kept;
    },
  };
};

test.describe("sockets outside the routes", () => {
  test("the suite's browser runs with the host-resolution block", ({
    browser,
  }, testInfo) => {
    expect(projectArgs(testInfo)).toContain(BLOCK_HOST_RESOLUTION);
    // The worker's browser itself, as launched: through the start lock, and
    // with the block on its command line (no other browser is open here).
    expect(startedAlone(browser)).toBe(true);
    expect(
      launchedCommandLines().filter(command =>
        command.includes(BLOCK_HOST_RESOLUTION),
      ),
    ).toHaveLength(1);
  });

  for (const [where, open] of OPENERS) {
    test(`a socket from ${where} never reaches a host`, async ({
      playwright,
    }, testInfo) => {
      const launch = launcher(playwright, testInfo.project.use.channel);
      expect(await attempt(launch, open, true)).toEqual({
        ended: "closed 1006",
        connections: 0,
      });
      // Control: the same socket, without the block, reaches the listener.
      const control = await attempt(launch, open, false);
      expect(control.connections).toBeGreaterThan(0);
    });
  }

  test("a launch that fails partway leaves no browser or listener open", async () => {
    const failing = failingPartway();
    const kept = keptListener();
    await expect(
      attempt(failing.launch, fromWorker, true, kept.listen),
    ).rejects.toThrow(/newContext failed on purpose/u);
    expect(failing.closed()).toBe(true);
    expect(kept.listener()?.listening()).toBe(false);
  });
});
