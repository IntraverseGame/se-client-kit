// The part of the WebKit block that a launch option cannot carry: WebKit has
// no preference that turns WebRTC off, and its STUN traffic is UDP, which the
// dead proxy does not carry (browser-flags.ts). So every context of a WebKit
// browser of the suite gets an init script that removes WebRTC from every
// frame before any page script runs: every global whose name starts with
// `RTC` or `webkitRTC` (`RTCPeerConnection`, `webkitRTCPeerConnection`, and
// the rest of the family) is deleted, as Firefox's
// `media.peerconnection.enabled: false` removes them there.
//
// A page could try to get a fresh `RTCPeerConnection` from a new same-origin
// window before that window's own init script has run. The script closes the
// handles it can: an iframe's or frame's `contentWindow` and `contentDocument`
// (and an object element's), and the window `window.open` returns, are
// cleared the same way before they are handed out. `frames[n]` and
// `window[n]` cannot be intercepted, so for them, and for a new window's own
// `open`, the removal rests on that window's own init script having run. The
// proof (hermetic-webrtc.spec.ts, with `freshWindowsWebRtc` of
// webrtc-probes.ts) checks eight ways: a new iframe through `contentWindow`,
// `frames[n]`, and `contentDocument`; a loaded `srcdoc` iframe through
// `frames[n]` and through `contentWindow`; an `<object>`'s window (a `blob:`
// document); `window.open`; and a new iframe's own `open`. A way it does not
// list is not proven closed.
//
// `applyContextBlocks` is the one place it is applied: to the worker's
// browser (worker-browser.ts) and to every browser a proof launches of its own
// (blocked-launch.ts), so every context gets it, a context the test makes with
// `browser.newContext` or `browser.newPage` included. It wraps the browser's
// `newContext`; Playwright's own `context` fixture and `newPage` go through
// it. Playwright's context reuse (UI mode, editor integrations) makes its
// context another way, so worker-browser.ts refuses it in WebKit.

/* oxlint-disable unicorn/consistent-function-scoping -- the helpers must live inside the one function Playwright sends to every frame */

import type { Browser } from "@playwright/test";

// Runs in every frame, before page scripts: nothing outside its own body.
const removeWebRtc = (): void => {
  const WEBRTC = /^(?:webkit)?RTC/u;
  const clear = (target: object): void => {
    try {
      for (const name of Object.getOwnPropertyNames(target)) {
        if (WEBRTC.test(name)) Reflect.deleteProperty(target, name);
      }
    } catch {
      // A cross-origin window cannot be listed; its own init script clears it.
    }
  };
  clear(globalThis);
  const wrapGetter = (
    prototype: object,
    property: string,
    windowOf: (value: unknown) => object | null,
  ): void => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    const getter = descriptor?.get;
    if (descriptor === undefined || getter === undefined) return;
    Object.defineProperty(prototype, property, {
      ...descriptor,
      get(this: unknown): unknown {
        const value: unknown = Reflect.apply(getter, this, []);
        const opened = windowOf(value);
        if (opened !== null) clear(opened);
        return value;
      },
    });
  };
  const asWindow = (value: unknown): object | null =>
    typeof value === "object" && value !== null ? value : null;
  const viewOf = (value: unknown): object | null =>
    value instanceof Document ? value.defaultView : null;
  for (const element of [
    HTMLIFrameElement,
    HTMLFrameElement,
    HTMLObjectElement,
  ]) {
    wrapGetter(element.prototype, "contentWindow", asWindow);
    wrapGetter(element.prototype, "contentDocument", viewOf);
  }
  const open = window.open.bind(window);
  window.open = (...args: Parameters<typeof window.open>): Window | null => {
    const opened = open(...args);
    if (opened !== null) clear(opened);
    return opened;
  };
};

/**
 * Gives every context `browser` makes from now on the context-level part of its
 * project's block: in WebKit, `removeWebRtc`; nothing in Chromium and Firefox,
 * whose blocks are all launch options. Returns the same browser.
 */
export const applyContextBlocks = (
  browser: Browser,
  browserName: string,
): Browser => {
  if (browserName !== "webkit") return browser;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext(options);
    await context.addInitScript(removeWebRtc);
    return context;
  };
  return browser;
};
