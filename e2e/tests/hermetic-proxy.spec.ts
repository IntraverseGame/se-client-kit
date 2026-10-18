// The Firefox and WebKit block behind the hermetic routes (browser-flags.ts):
// both launch with a proxy at a dead loopback port and no bypass, and Firefox
// with WebRTC off and localhost sent through the proxy too. These tests prove
// that a request outside every route, a dedicated worker's socket, and a
// service worker's socket, each aimed at a loopback listener the test owns (by
// name, and by IP literal for the request), never reach it, and a control
// launch without the proxy proves the same request or socket would. WebRTC's
// STUN traffic is UDP, which the proxy does not carry: it is counted on UDP
// sockets on both loopback addresses, with a Firefox control that turns WebRTC
// back on; each probe's outcome is recorded as an annotation. WebKit has no
// such control, so its STUN test shows only that this probe sent no datagram
// to loopback, not that WebRTC traffic is blocked (an open gap, decided by the
// human, 2026-10-18). Before any of it, nothing may accept a connection at the
// dead proxy's address. Chromium's block is another one (host resolution),
// proven in hermetic-workers.spec.ts.

import type { Browser, LaunchOptions, Page, TestInfo } from "@playwright/test";

import { DEAD_PROXY, FIREFOX_BLOCK_PREFS } from "./harness/browser-flags.ts";
import { startBrowser, startedAlone } from "./harness/browser-start.ts";
import { expect, test } from "./harness/fixtures.ts";
import {
  countDatagramsOnLoopback,
  type LoopbackDatagrams,
} from "./harness/loopback-datagrams.ts";
import {
  expectNothingAccepts,
  listenOnLoopback,
  type LoopbackListener,
} from "./harness/loopback-listener.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import {
  fromPage,
  fromServiceWorker,
  fromWorker,
  openPage,
  probeStun,
  type StunProbe,
} from "./harness/outside-routes.ts";

type BlockedBrowser = "firefox" | "webkit";

/** The project's browser, which the describes below never run as Chromium. */
const blockedBrowser = (name: string): BlockedBrowser => {
  if (name === "firefox" || name === "webkit") return name;
  throw new Error(
    `${name} has no dead-proxy block: the test should be skipped`,
  );
};

/** The launch options each project must have: the block, and nothing else. */
const BLOCK: Readonly<Record<BlockedBrowser, LaunchOptions>> = {
  firefox: { proxy: DEAD_PROXY, firefoxUserPrefs: FIREFOX_BLOCK_PREFS },
  webkit: { proxy: DEAD_PROXY },
};

/**
 * The launch options a test may change from the project's; `proxy: undefined`
 * drops the project's proxy, for a control.
 */
type Overrides = Omit<LaunchOptions, "proxy"> & {
  readonly proxy?: LaunchOptions["proxy"] | undefined;
};

type BrowserTypes = Readonly<
  Record<
    BlockedBrowser,
    { readonly launch: (options: LaunchOptions) => Promise<Browser> }
  >
>;

/**
 * A browser of the test's own, through the start lock as every browser of the
 * suite (harness/browser-start.ts). It has the project's launch options, the
 * block included, unless `options` replaces some: `proxy: undefined` drops the
 * proxy for a control.
 */
const launch = (
  playwright: BrowserTypes,
  browserName: BlockedBrowser,
  options: Overrides = {},
): Promise<Browser> =>
  startBrowser(timeout =>
    // Playwright spreads these over the project's options, so a `proxy` given
    // as `undefined` drops the project's proxy; LaunchOptions cannot say
    // `undefined` under exactOptionalPropertyTypes, hence the assertion.
    playwright[browserName].launch({ ...options, timeout } as LaunchOptions),
  );

type Case = {
  readonly what: string;
  readonly url: (port: number) => string;
  readonly open: (page: Page, url: string) => Promise<string>;
  /** How the attempt ends under the block. */
  readonly blocked: string;
};

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
    url: port => `wss://localhost:${String(port)}/`,
    open: fromWorker,
    blocked: "closed 1006",
  },
  {
    what: "a socket from a service worker's install handler",
    url: port => `wss://localhost:${String(port)}/`,
    open: fromServiceWorker,
    blocked: "closed 1006",
  },
];

/**
 * Runs `open` in a browser of its own against a fresh loopback listener;
 * returns how it ended and how many connections the listener saw. The browser
 * and the listener are closed however it ends.
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
    // Counted after the browser is gone, so a late retry by a worker or a
    // service worker that was still running is counted too.
    connections = listener?.connections() ?? 0;
    await listener?.close();
  }
  return { ended, connections };
};

type StunOutcome = {
  readonly probe: StunProbe;
  readonly datagrams: number;
};

/**
 * The STUN probe in a browser of its own; counts what reached the sockets after
 * the browser is gone, and records the outcome as an annotation of the test, so
 * a run shows whether the browser had RTCPeerConnection and gathered.
 */
const stunAttempt = async (
  start: () => Promise<Browser>,
  testInfo: TestInfo,
  label: string,
): Promise<StunOutcome> => {
  let socket: LoopbackDatagrams | undefined;
  let browser: Browser | undefined;
  let probe: StunProbe;
  let datagrams = 0;
  try {
    socket = await countDatagramsOnLoopback();
    browser = await start();
    probe = await probeStun(await openPage(browser), socket.port);
  } finally {
    await browser?.close();
    datagrams = socket?.datagrams() ?? 0;
    await socket?.close();
  }
  testInfo.annotations.push({
    type: "stun-probe",
    description: `${label}: ${JSON.stringify({ ...probe, datagrams })}`,
  });
  return { probe, datagrams };
};

/** Firefox with WebRTC back on, the rest of the block kept: a control. */
const WEBRTC_ON: LaunchOptions = {
  firefoxUserPrefs: {
    ...FIREFOX_BLOCK_PREFS,
    "media.peerconnection.enabled": true,
  },
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
      const name = blockedBrowser(browserName);
      expect(await attempt(() => launch(playwright, name), blocked)).toEqual({
        ended: blocked.blocked,
        connections: 0,
      });
      // Control: the same, without the proxy, reaches the listener.
      const control = await attempt(
        () => launch(playwright, name, { proxy: undefined }),
        blocked,
      );
      expect(control.connections).toBeGreaterThan(0);
    });
  }
});

test.describe("WebKit: the STUN probe sends nothing to loopback", () => {
  test.skip(
    ({ browserName }) => browserName !== "webkit",
    "WebKit only; Firefox's WebRTC has its own tests below, Chromium's block is host resolution",
  );

  // A pass shows only that this probe sent no datagram to loopback: with no
  // WebKit control, it does not prove WebRTC traffic is blocked (the gap is
  // open, decided by the human, 2026-10-18). The annotation says whether
  // WebKit had RTCPeerConnection and what it gathered.
  test("no STUN datagram reaches 127.0.0.1 or ::1", async ({
    playwright,
  }, testInfo) => {
    const outcome = await stunAttempt(
      () => launch(playwright, "webkit"),
      testInfo,
      "webkit, blocked",
    );
    expect(outcome.datagrams).toBe(0);
  });
});

test.describe("Firefox: WebRTC is off", () => {
  test.skip(
    ({ browserName }) => browserName !== "firefox",
    "the WebRTC preference is Firefox's; WebKit has none (its STUN probe is above)",
  );

  test("the suite's browser has no RTCPeerConnection", async ({ page }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect(await page.evaluate(() => typeof RTCPeerConnection)).toBe(
      "undefined",
    );
  });

  test("the STUN probe finds no RTCPeerConnection and reaches no socket", async ({
    playwright,
  }, testInfo) => {
    expect(
      await stunAttempt(
        () => launch(playwright, "firefox"),
        testInfo,
        "firefox, blocked",
      ),
    ).toEqual({ probe: { probe: "no RTCPeerConnection" }, datagrams: 0 });
  });

  test("control: with WebRTC back on, the same STUN probe reaches the socket", async ({
    playwright,
  }, testInfo) => {
    const control = await stunAttempt(
      () => launch(playwright, "firefox", WEBRTC_ON),
      testInfo,
      "firefox, WebRTC back on",
    );
    expect(control.probe.probe).toBe("gathered");
    expect(control.datagrams).toBeGreaterThan(0);
  });
});
