// What the hermetic-proxy tests (hermetic-proxy.spec.ts) run in a page: a
// page whose context has one route, the test pages' origin, so whatever else it
// or its workers ask for is outside every route; a request, a dedicated
// worker's socket, and a service worker's socket, each resolving with how it
// ended; and a STUN probe for WebRTC. Test-only.

import type { Browser, Page } from "@playwright/test";

import { PAGES_ORIGIN, TEST_PAGES } from "./origins.ts";
import { serveDirectory } from "./static-origin.ts";

/**
 * A page on the test pages' origin, the only route of its context: whatever
 * else it or its workers request is outside every route. The browser is closed
 * if anything after the launch fails.
 */
export const openPage = async (browser: Browser): Promise<Page> => {
  try {
    const context = await browser.newContext({ serviceWorkers: "allow" });
    await serveDirectory(context, PAGES_ORIGIN, TEST_PAGES);
    const page = await context.newPage();
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    return page;
  } catch (error: unknown) {
    await browser.close();
    throw error;
  }
};

/** A request from the page itself; resolves with how it ended. */
export const fromPage = (page: Page, url: string): Promise<string> =>
  page.evaluate(
    target =>
      fetch(target).then(
        () => "answered",
        (error: unknown) =>
          `failed ${error instanceof Error ? error.name : typeof error}`,
      ),
    url,
  );

/** A socket from a dedicated worker; resolves with how it ended. */
export const fromWorker = (page: Page, url: string): Promise<string> =>
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

/**
 * A socket from a service worker's install handler; resolves with how it ended,
 * or with the registration's failure.
 */
export const fromServiceWorker = (page: Page, url: string): Promise<string> =>
  page.evaluate(
    target =>
      new Promise<string>(resolve => {
        const channel = new BroadcastChannel("socket-result");
        channel.addEventListener("message", event => {
          resolve(String(event.data));
        });
        navigator.serviceWorker
          .register(`/socket-sw.js?url=${encodeURIComponent(target)}`)
          .catch((error: unknown) => {
            resolve(
              `register failed ${error instanceof Error ? error.name : typeof error}`,
            );
          });
      }),
    url,
  );

/** What the STUN probe saw in the page. */
export type StunProbe =
  | { readonly probe: "no RTCPeerConnection" }
  | {
      readonly probe: "gathered";
      /** Whether gathering completed, or the 3 s bound ended it. */
      readonly complete: boolean;
      /** The type of each ICE candidate gathered (`host`, `srflx`, ...). */
      readonly candidates: readonly string[];
    };

/**
 * Starts ICE gathering with STUN servers on `localhost`, `127.0.0.1`, and
 * `[::1]`, all at `port`; resolves once gathering is complete or 3 s have
 * passed, whichever is first. A STUN request goes out as soon as gathering
 * starts, so the bound only has to cover that start; the Firefox control sees
 * its datagrams within it.
 */
export const probeStun = (page: Page, port: number): Promise<StunProbe> =>
  page.evaluate(
    async targets => {
      if (typeof RTCPeerConnection === "undefined") {
        return { probe: "no RTCPeerConnection" } as const;
      }
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: targets }],
      });
      const candidates: string[] = [];
      connection.addEventListener("icecandidate", event => {
        if (event.candidate !== null) {
          candidates.push(event.candidate.type ?? "unknown");
        }
      });
      connection.createDataChannel("probe");
      await connection.setLocalDescription(await connection.createOffer());
      const complete = await new Promise<boolean>(resolve => {
        connection.addEventListener("icegatheringstatechange", () => {
          if (connection.iceGatheringState === "complete") resolve(true);
        });
        setTimeout(() => {
          resolve(false);
        }, 3000);
      });
      connection.close();
      return { probe: "gathered", complete, candidates } as const;
    },
    ["localhost", "127.0.0.1", "[::1]"].map(
      host => `stun:${host}:${String(port)}`,
    ),
  );

/**
 * Where Playwright routes a service worker's script fetch: in a context of
 * `browser` whose test pages are served by a route, a second route counts the
 * requests for `/socket-sw.js` and passes them on. The page registers the
 * script as a service worker (aimed at a port nothing listens on), then fetches
 * the same script itself. Where the registration's fetch is not routed, the
 * registration fails and the route counts only the page's fetch.
 * `beforeRegister` runs once the page is open and the route is in place, just
 * before the registration. With `register: false` the same window is run with
 * no registration (a baseline): the route, then the page's own fetch.
 */
export const serviceWorkerScriptRouting = async (
  browser: Browser,
  beforeRegister?: () => void,
  { register = true }: { readonly register?: boolean } = {},
): Promise<{
  readonly registered: string;
  readonly fetched: number;
  readonly routed: number;
}> => {
  const page = await openPage(browser);
  let routed = 0;
  await page.context().route(`${PAGES_ORIGIN}/socket-sw.js*`, route => {
    routed += 1;
    return route.fallback();
  });
  beforeRegister?.();
  const registered = register
    ? await page.evaluate(() =>
        navigator.serviceWorker
          .register(
            `/socket-sw.js?url=${encodeURIComponent("wss://localhost:9/")}`,
          )
          .then(
            () => "registered",
            (error: unknown) =>
              `register failed ${error instanceof Error ? error.name : typeof error}`,
          ),
      )
    : "not registered";
  const fetched = await page.evaluate(() =>
    fetch("/socket-sw.js?probe").then(response => response.status),
  );
  return { registered, fetched, routed };
};

/**
 * Whether a script can get WebRTC back from a new same-origin window, by the
 * `typeof` of `RTCPeerConnection` and of `webkitRTCPeerConnection` in each: a
 * new iframe read at once through `contentWindow`, through `frames[n]`, and
 * through `contentDocument`; a `srcdoc` iframe once it has loaded, read through
 * `frames[n]` and then through `contentWindow`; an `<object>`'s window once it
 * has loaded the test pages' blank page; a window from `window.open`; and a
 * window from a new iframe's own `open` (`frames[n].open`). A popup that did
 * not open is "not opened", and an object that did not load "not loaded".
 */
export const freshWindowsWebRtc = (
  page: Page,
): Promise<Readonly<Record<string, string>>> =>
  page.evaluate(async () => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- it runs in the page, inside the one function Playwright sends there
    const kinds = (target: unknown): string =>
      typeof target === "object" && target !== null
        ? [
            typeof Reflect.get(target, "RTCPeerConnection"),
            typeof Reflect.get(target, "webkitRTCPeerConnection"),
          ].join(",")
        : "no window";
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- it runs in the page, inside the one function Playwright sends there
    const appended = (): HTMLIFrameElement => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
      return frame;
    };
    const contentWindow = kinds(appended().contentWindow);
    appended();
    // `frames[n]`, read before anything touches the new frame's element.
    const frames = kinds(Reflect.get(window, String(window.length - 1)));
    const contentDocument = kinds(appended().contentDocument?.defaultView);
    const srcdoc = document.createElement("iframe");
    srcdoc.srcdoc = "<p>srcdoc</p>";
    await new Promise<void>(resolve => {
      srcdoc.addEventListener("load", () => {
        resolve();
      });
      document.body.append(srcdoc);
    });
    // `frames[n]` first: reading `contentWindow` would clear the window.
    const srcdocFrames = kinds(Reflect.get(window, String(window.length - 1)));
    const loaded = kinds(srcdoc.contentWindow);
    const object = document.createElement("object");
    object.type = "text/html";
    object.data = "/blank.html";
    const objectLoaded = await new Promise<boolean>(resolve => {
      object.addEventListener("load", () => {
        resolve(true);
      });
      object.addEventListener("error", () => {
        resolve(false);
      });
      document.body.append(object);
    });
    const objectWindow = objectLoaded
      ? kinds(object.contentWindow)
      : "not loaded";
    const popup = window.open("about:blank");
    const opened = popup === null ? "not opened" : kinds(popup);
    popup?.close();
    appended();
    const child: unknown = Reflect.get(window, String(window.length - 1));
    const childOpen: unknown =
      typeof child === "object" && child !== null
        ? Reflect.get(child, "open")
        : undefined;
    const childPopup: unknown =
      typeof childOpen === "function"
        ? Reflect.apply(childOpen, child, ["about:blank"])
        : null;
    const childOpened =
      typeof childPopup === "object" && childPopup !== null
        ? kinds(childPopup)
        : "not opened";
    (childPopup as Window | null)?.close();
    return {
      contentWindow,
      "frames[n]": frames,
      contentDocument,
      srcdoc: loaded,
      "srcdoc through frames[n]": srcdocFrames,
      object: objectWindow,
      "window.open": opened,
      "frames[n].open": childOpened,
    };
  });
