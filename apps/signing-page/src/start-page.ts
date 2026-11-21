// The signing page on a real `window` (specs/signing-page.md): the host its
// run needs, from the platform. It reads `window.opener` first and nothing of
// the URL but its origin; `fetch` is called unbound from `window`, and the
// clock is the window's timers.

import {
  type OpenerWindow,
  type PageHost,
  runSigningPage,
} from "./signing-page.ts";

/** The element the page mounts into (`index.html`). */
export const ROOT_ID = "signer-root";

/** The host for a browser `window`; `root` is where the view goes. */
export const windowHost = (page: Window, root: HTMLElement): PageHost => ({
  readOpener: () => {
    const opener: unknown = page.opener;
    return opener === null || opener === undefined
      ? null
      : (opener as OpenerWindow);
  },
  dropOpener: () => {
    page.opener = null;
  },
  closeWindow: () => {
    page.close();
  },
  ownOrigin: page.location.origin,
  fetch: (input, init) => page.fetch(input, init),
  clock: {
    setTimeout: (callback, ms) => page.setTimeout(callback, ms),
    clearTimeout: handle => {
      page.clearTimeout(handle as number);
    },
  },
  events: page,
  root,
});

/** Mounts the page into `#signer-root` of `page` and runs it. */
export const startSigningPage = (page: Window): void => {
  const root = page.document.querySelector<HTMLElement>(`#${ROOT_ID}`);
  if (root === null) return;
  void runSigningPage(windowHost(page, root));
};
