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
