// The Firefox and WebKit block behind the hermetic routes (browser-flags.ts):
// both launch with a proxy at a dead loopback port and no bypass, and Firefox
// with localhost sent through the proxy too. These tests prove that a request
// outside every route and a dedicated worker's socket, each aimed at a
// loopback listener the test owns (by name, and by IP literal for the
// request), never reach it, and a control launch without the proxy proves the
// same would; and that a service worker's socket never reaches it either: in
// WebKit with the same control, and in Firefox, where Playwright does not
// route a service worker's script fetch, because the registration itself
// fails at the dead proxy (that failure is the block). A probe shows a route
// never sees the registration's fetch, and a control with the proxy at a
// listener shows that fetch arriving at the proxy. Before any of it, nothing may accept a connection at the dead
// proxy's address. WebRTC's part of the block is proven in
// hermetic-webrtc.spec.ts; Chromium's block is another one (host resolution),
// proven in hermetic-workers.spec.ts.

import type { Browser, Page } from "@playwright/test";

import {
  BLOCK,
  blockedBrowser,
  launch,
  type BlockedBrowser,
} from "./harness/blocked-launch.ts";
import { DEAD_PROXY } from "./harness/browser-flags.ts";
import { startedAlone } from "./harness/browser-start.ts";
import { expect, test } from "./harness/fixtures.ts";
import {
  expectNothingAccepts,
  listenAsProxy,
  listenOnLoopback,
  type LoopbackListener,
} from "./harness/loopback-listener.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import {
  fromPage,
  fromServiceWorker,
  fromWorker,
  openPage,
  serviceWorkerScriptRouting,
} from "./harness/outside-routes.ts";

type Case = {
  readonly what: string;
  readonly url: (port: number) => string;
  readonly open: (page: Page, url: string) => Promise<string>;
  /** How the attempt ends under the block. */
  readonly blocked: string;
};

const wss = (port: number): string => `wss://localhost:${String(port)}/`;

const CASES: readonly Case[] = [
  {
    what: "a request outside every route, to localhost by name",
    url: port => `https://localhost:${String(port)}/`,
    open: fromPage,
    blocked: "failed TypeError",
  },
  {
    what: "a request outside every route, to a loopback IP literal",
    url: port => `https://127.0.0.1:${String(port)}/`,
    open: fromPage,
    blocked: "failed TypeError",
  },
  {
    what: "a socket from a dedicated worker",
    url: wss,
    open: fromWorker,
    blocked: "closed 1006",
  },
];

const SERVICE_WORKER: Case = {
  what: "a socket from a service worker's install handler",
  url: wss,
  open: fromServiceWorker,
  blocked: "closed 1006",
};

/**
 * Runs `open` in a browser of its own against a fresh loopback listener;
 * returns how it ended and how many connections the listener saw, counted after
 * the browser is gone, so a late retry by a worker or a service worker that was
 * still running is counted too. The browser and the listener are closed however
 * it ends.
 */
const attempt = async (
  start: () => Promise<Browser>,
  { url, open }: Case,
): Promise<{ readonly ended: string; readonly connections: number }> => {
  let listener: LoopbackListener | undefined;
  let browser: Browser | undefined;
  let ended: string;
  let connections = 0;
  try {
    listener = await listenOnLoopback();
    browser = await start();
    const page = await openPage(browser);
    ended = await open(page, url(listener.port));
  } finally {
    await browser?.close();
    connections = listener?.connections() ?? 0;
    await listener?.close();
  }
  return { ended, connections };
};

/** The blocked attempt, then the control without the proxy. */
const blockedAndControl = async (
  playwright: Parameters<typeof launch>[0],
  name: BlockedBrowser,
  blocked: Case,
): Promise<{
  readonly blocked: { readonly ended: string; readonly connections: number };
  readonly control: number;
}> => ({
  blocked: await attempt(() => launch(playwright, name), blocked),
  control: (
    await attempt(() => launch(playwright, name, { proxy: undefined }), blocked)
  ).connections,
});

/** The request line of an HTTPS request through a proxy to the test pages. */
const TO_PAGES = `CONNECT ${new URL(PAGES_ORIGIN).host}:443 HTTP/1.1`;

type Routing = Awaited<ReturnType<typeof serviceWorkerScriptRouting>>;

/**
 * Firefox with its proxy at a listener that records request lines, running the
 * service worker routing probe twice in the same browser: first a baseline
 * window with no registration (the route, then the page's own fetch), then the
 * same window with the registration. The lines to the pages' host are counted
 * at the start and the end of each window: the browser may send requests of its
 * own to that host (a favicon, a preconnect), so the baseline must see none,
 * and the registration rejects only once its fetch has failed, while the
 * listener records a line before it closes the connection, so the
 * registration's own line is in its window.
 */
const throughListeningProxy = async (
  playwright: Parameters<typeof launch>[0],
): Promise<{
  readonly baseline: Routing;
  readonly duringBaseline: number;
  readonly routing: Routing;
  readonly duringRegistration: number;
}> => {
  const proxy = await listenAsProxy();
  const toPages = (): number =>
    proxy.requests().filter(line => line === TO_PAGES).length;
  let browser: Browser | undefined;
  let baseline: Routing;
  let routing: Routing;
  const counts = { baseline: 0, registration: 0 };
  try {
    browser = await launch(playwright, "firefox", {
      proxy: { server: proxy.server },
    });
    let start = 0;
    baseline = await serviceWorkerScriptRouting(
      browser,
      () => {
        start = toPages();
      },
      { register: false },
    );
    counts.baseline = toPages() - start;
    routing = await serviceWorkerScriptRouting(browser, () => {
      start = toPages();
    });
    counts.registration = toPages() - start;
  } finally {
    await browser?.close();
    await proxy.close();
  }
  return {
    baseline,
    duringBaseline: counts.baseline,
    routing,
    duringRegistration: counts.registration,
  };
};

// Nothing may answer at the dead proxy's address, or the proxy is a live one.
test.beforeAll(async () => {
  await expectNothingAccepts(DEAD_PROXY.server);
});

test.describe("Firefox and WebKit: traffic outside the routes", () => {
  test.skip(
    ({ browserName }) => browserName === "chromium",
    "Chromium's block is host resolution, proven in hermetic-workers.spec.ts",
  );

  test("the suite's browser runs with the dead-proxy block", ({
    browser,
    browserName,
  }, testInfo) => {
    expect(testInfo.project.use.launchOptions).toEqual(
      BLOCK[blockedBrowser(browserName)],
    );
    expect(startedAlone(browser)).toBe(true);
  });

  for (const blocked of CASES) {
    test(`${blocked.what} never reaches a host`, async ({
      playwright,
      browserName,
    }) => {
      const outcome = await blockedAndControl(
        playwright,
        blockedBrowser(browserName),
        blocked,
      );
      expect(outcome.blocked).toEqual({
        ended: blocked.blocked,
        connections: 0,
      });
      // Control: the same, without the proxy, reaches the listener.
      expect(outcome.control).toBeGreaterThan(0);
    });
  }
});

test.describe("WebKit: a service worker's socket", () => {
  test.skip(
    ({ browserName }) => browserName !== "webkit",
    "WebKit only: Firefox's service worker is the next block, Chromium's is in hermetic-workers.spec.ts",
  );

  test(`${SERVICE_WORKER.what} never reaches a host`, async ({
    playwright,
  }) => {
    const outcome = await blockedAndControl(
      playwright,
      "webkit",
      SERVICE_WORKER,
    );
    expect(outcome.blocked).toEqual({ ended: "closed 1006", connections: 0 });
    expect(outcome.control).toBeGreaterThan(0);
  });
});

test.describe("Firefox: a service worker cannot register", () => {
  test.skip(
    ({ browserName }) => browserName !== "firefox",
    "Firefox only: elsewhere Playwright routes a service worker's script fetch",
  );

  test("the registration fails, so its socket never reaches a host", async ({
    playwright,
  }) => {
    expect(
      await attempt(() => launch(playwright, "firefox"), SERVICE_WORKER),
    ).toEqual({ ended: "register failed TypeError", connections: 0 });
  });

  test("the cause: a route sees the page's fetch of the script, never the registration's", async ({
    playwright,
  }) => {
    const browser = await launch(playwright, "firefox");
    try {
      expect(await serviceWorkerScriptRouting(browser)).toEqual({
        registered: "register failed TypeError",
        fetched: 200,
        routed: 1,
      });
    } finally {
      await browser.close();
    }
  });

  test("control: with the proxy at a listener, the registration's script fetch arrives there", async ({
    playwright,
  }) => {
    const outcome = await throughListeningProxy(playwright);
    // The baseline window, with no registration, sends nothing to the pages'
    // host through the proxy; the same window with the registration does, and
    // the route still saw only the page's own fetch.
    expect(outcome).toEqual({
      baseline: { registered: "not registered", fetched: 200, routed: 1 },
      duringBaseline: 0,
      routing: {
        registered: "register failed TypeError",
        fetched: 200,
        routed: 1,
      },
      duringRegistration: expect.any(Number),
    });
    expect(outcome.duringRegistration).toBeGreaterThan(0);
  });
});
