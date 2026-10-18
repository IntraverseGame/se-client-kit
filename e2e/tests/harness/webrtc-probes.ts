// What the WebRTC proofs (hermetic-webrtc.spec.ts) run in a page: a STUN probe
// that counts on loopback what WebRTC sends, the fresh-window probe that looks
// for WebRTC in every new window a script can get, and the `<object>` routing
// probe. Test-only.

import type { Page } from "@playwright/test";

import { PAGES_ORIGIN } from "./origins.ts";

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
 * Where the fresh-window probe's `<object>` takes its document from: `"routed"`
 * is the test pages' `/blank.html`, for a browser where Playwright routes an
 * object's document request (WebKit); `"blob"` is a `blob:` URL the page makes,
 * with the page's origin and no request, for one where it does not (Firefox,
 * where the request fails). `objectRouting` below shows which.
 */
export type ObjectDocument = "routed" | "blob";

/**
 * Whether a script can get WebRTC back from a new same-origin window, by the
 * `typeof` of `RTCPeerConnection` and of `webkitRTCPeerConnection` in each: a
 * new iframe read at once through `contentWindow`, through `frames[n]`, and
 * through `contentDocument`; a `srcdoc` iframe once it has loaded, read through
 * `frames[n]` and then through `contentWindow`; an `<object>`'s window once it
 * has loaded the HTML document `objectDocument` names; a window from
 * `window.open`; and a window from a new iframe's own `open`
 * (`frames[n].open`). A popup that did not open is "not opened", and an object
 * that fired an error, or no event within 5 s, "not loaded".
 */
export const freshWindowsWebRtc = (
  page: Page,
  objectDocument: ObjectDocument,
): Promise<Readonly<Record<string, string>>> =>
  page.evaluate(async documentFrom => {
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
    object.data =
      documentFrom === "routed"
        ? "/blank.html"
        : URL.createObjectURL(
            new Blob(["<!doctype html><title>object</title>"], {
              type: "text/html",
            }),
          );
    const objectLoaded = await new Promise<boolean>(resolve => {
      object.addEventListener("load", () => {
        resolve(true);
      });
      object.addEventListener("error", () => {
        resolve(false);
      });
      // No event at all: "not loaded", rather than a hung test.
      setTimeout(() => {
        resolve(false);
      }, 5000);
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
  }, objectDocument);

/**
 * Where Playwright routes an `<object>`'s document request: a route on the
 * page's context counts the requests for `/blank.html?object` and passes them
 * on, and the page loads that URL into an `<object>`. Resolves with which event
 * the object fired ("load", "error", or "no event" within 5 s) and how many
 * requests the route saw.
 */
export const objectRouting = async (
  page: Page,
): Promise<{ readonly loaded: string; readonly routed: number }> => {
  let routed = 0;
  await page.context().route(`${PAGES_ORIGIN}/blank.html?object`, route => {
    routed += 1;
    return route.fallback();
  });
  const loaded = await page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const object = document.createElement("object");
        object.type = "text/html";
        object.data = "/blank.html?object";
        object.addEventListener("load", () => {
          resolve("load");
        });
        object.addEventListener("error", () => {
          resolve("error");
        });
        setTimeout(() => {
          resolve("no event");
        }, 5000);
        document.body.append(object);
      }),
  );
  return { loaded, routed };
};
