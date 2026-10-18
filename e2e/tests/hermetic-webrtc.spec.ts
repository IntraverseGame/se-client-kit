// WebRTC's part of the Firefox and WebKit block. Its STUN traffic is UDP,
// which the dead proxy does not carry, so WebRTC itself is removed: in Firefox
// by `media.peerconnection.enabled: false` (browser-flags.ts), in WebKit by an
// init script in every frame of every context (context-blocks.ts). These tests
// prove that the suite's browser has no `RTCPeerConnection`, that a script
// cannot get one back from a new window (the eight ways of webrtc-probes.ts's
// `freshWindowsWebRtc`), and that a STUN probe aimed at `localhost`,
// `127.0.0.1`, and `[::1]` finds none and sends nothing to UDP sockets on both
// loopback addresses; a control without the removal and without the proxy
// (in Firefox also with ICE allowed on loopback, which Firefox otherwise keeps
// away from it) shows the same probe gathers and its datagrams arrive.
// Each probe's outcome is recorded as a test annotation and printed as one
// line on stdout, as is the object routing probe's. Chromium's block is
// host resolution (hermetic-workers.spec.ts).

import type { Browser, TestInfo } from "@playwright/test";

import {
  blockedBrowser,
  FIREFOX_WEBRTC_ON,
  launch,
  type BlockedBrowser,
} from "./harness/blocked-launch.ts";
import { DEAD_PROXY } from "./harness/browser-flags.ts";
import { expect, test } from "./harness/fixtures.ts";
import {
  countDatagramsOnLoopback,
  type LoopbackDatagrams,
} from "./harness/loopback-datagrams.ts";
import { expectNothingAccepts } from "./harness/loopback-listener.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { openPage } from "./harness/outside-routes.ts";
import {
  freshWindowsWebRtc,
  objectRouting,
  probeStun,
  type StunProbe,
} from "./harness/webrtc-probes.ts";

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
  const description = `${label}: ${JSON.stringify({ ...probe, datagrams })}`;
  testInfo.annotations.push({ type: "stun-probe", description });
  // Also one plain line on stdout, so the CI log shows it: the outcome only
  // (the probe's result and the count), nothing secret.
  console.log(`stun-probe ${description}`);
  return { probe, datagrams };
};

/** What `objectRouting` finds in each blocked project. */
const OBJECT_ROUTING: Readonly<
  Record<BlockedBrowser, { readonly loaded: string; readonly routed: number }>
> = {
  firefox: { loaded: "error", routed: 0 },
  webkit: { loaded: "load", routed: 1 },
};

/** Every window the fresh-window probe looks at, with no WebRTC in it. */
const NO_WEBRTC = {
  contentWindow: "undefined,undefined",
  "frames[n]": "undefined,undefined",
  contentDocument: "undefined,undefined",
  srcdoc: "undefined,undefined",
  "srcdoc through frames[n]": "undefined,undefined",
  object: "undefined,undefined",
  "window.open": "undefined,undefined",
  "frames[n].open": "undefined,undefined",
};

// Nothing may answer at the dead proxy's address, or the proxy is a live one.
test.beforeAll(async () => {
  await expectNothingAccepts(DEAD_PROXY.server);
});

test.describe("Firefox and WebKit: WebRTC is off", () => {
  test.skip(
    ({ browserName }) => browserName === "chromium",
    "Chromium's block is host resolution, proven in hermetic-workers.spec.ts",
  );

  test("the suite's browser has no RTCPeerConnection", async ({ page }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect(
      await page.evaluate(() => [
        typeof Reflect.get(globalThis, "RTCPeerConnection"),
        typeof Reflect.get(globalThis, "webkitRTCPeerConnection"),
      ]),
    ).toEqual(["undefined", "undefined"]);
  });

  test("a script gets no RTCPeerConnection back from a new window", async ({
    page,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect(await freshWindowsWebRtc(page)).toEqual(NO_WEBRTC);
  });

  // Why the fresh-window probe's `<object>` holds a `blob:` document: in
  // Firefox, Playwright does not route an object's document request, and the
  // request fails; in WebKit the route serves it.
  test("an <object>'s document request is routed in WebKit, not in Firefox", async ({
    page,
    browserName,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    const routing = await objectRouting(page);
    // One plain line on stdout, so the CI log shows it: the outcome only.
    console.log(`object-routing ${browserName}: ${JSON.stringify(routing)}`);
    expect(routing).toEqual(OBJECT_ROUTING[blockedBrowser(browserName)]);
  });

  test("the STUN probe finds no RTCPeerConnection and reaches no socket", async ({
    playwright,
    browserName,
  }, testInfo) => {
    const name = blockedBrowser(browserName);
    expect(
      await stunAttempt(
        () => launch(playwright, name),
        testInfo,
        `${name}, blocked`,
      ),
    ).toEqual({ probe: { probe: "no RTCPeerConnection" }, datagrams: 0 });
  });
});

test.describe("Firefox: the control", () => {
  test.skip(
    ({ browserName }) => browserName !== "firefox",
    "Firefox's WebRTC is removed by a preference; WebKit's control is the next one",
  );

  test("with WebRTC back on and no proxy, the same STUN probe reaches the sockets", async ({
    playwright,
  }, testInfo) => {
    const control = await stunAttempt(
      () => launch(playwright, "firefox", FIREFOX_WEBRTC_ON),
      testInfo,
      "firefox, WebRTC back on, no proxy",
    );
    expect(control.probe.probe).toBe("gathered");
    expect(control.datagrams).toBeGreaterThan(0);
  });
});

test.describe("WebKit: the control", () => {
  test.skip(
    ({ browserName }) => browserName !== "webkit",
    "WebKit's WebRTC is removed by an init script; Firefox's control is the previous one",
  );

  test("without the init script and the proxy, the same STUN probe reaches the sockets", async ({
    playwright,
  }, testInfo) => {
    const control = await stunAttempt(
      () =>
        launch(
          playwright,
          "webkit",
          { proxy: undefined },
          { contextBlocks: false },
        ),
      testInfo,
      "webkit, no init script, no proxy",
    );
    expect(control.probe.probe).toBe("gathered");
    expect(control.datagrams).toBeGreaterThan(0);
  });
});
