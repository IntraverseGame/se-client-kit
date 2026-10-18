// What the hermetic-proxy tests (hermetic-proxy.spec.ts) run in a page: a
// page whose context has one route, the test pages' origin, so whatever else it
// or its workers ask for is outside every route; a request, a dedicated
// worker's socket, and a service worker's socket, each resolving with how it
// ended; and where Playwright routes a service worker's script fetch. The
// WebRTC probes are in webrtc-probes.ts. Test-only.

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
