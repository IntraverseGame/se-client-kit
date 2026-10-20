// The verify page's browser entry: wires the controller to the real `fetch`,
// timers, address bar, and clipboard, and mounts the view into `#verify-root`.
// It holds no key, no token, and no session, and it never imports `shell`. It
// persists nothing: the round id lives only in the URL.
// PROVISIONAL: the page's HTML (`verify/index.html`, with its `<meta>` policy)
// and its build are V-15 to V-17's, not built yet; this module is the entry
// that HTML will load.

import { ENVIRONMENT_CONFIG_PATH } from "./load-config.ts";
import { createVerifyPage, type VerifyPage } from "./page-state.ts";
import { mountPage } from "./render.ts";

export const startVerifyPage = (win: Window): void => {
  const doc = win.document;
  const host = doc.querySelector("#verify-root");
  if (host === null) return;
  // A late-bound controller: the view's actions call into it.
  const ref: { page?: VerifyPage } = {};
  const view = mountPage(doc, host, {
    submit: text => {
      void ref.page?.submit(text);
    },
    retry: () => {
      void ref.page?.retry();
    },
    // Async, so a missing clipboard API rejects (handled quietly by the view)
    // instead of throwing synchronously.
    copy: async text => {
      await win.navigator.clipboard.writeText(text);
    },
  });
  const page = createVerifyPage(
    {
      // Called unbound: a `fetch` taken off `window` must not be called as a method of another object.
      fetch: (input, init) => win.fetch(input, init),
      clock: {
        setTimeout: (callback, ms) => win.setTimeout(callback, ms),
        clearTimeout: handle => {
          win.clearTimeout(handle as number);
        },
      },
      origin: win.location.origin,
      configUrl: new URL(ENVIRONMENT_CONFIG_PATH, win.location.origin).href,
      location: {
        pathname: () => win.location.pathname,
        push: url => {
          win.history.pushState(null, "", url);
        },
        assign: url => {
          win.location.assign(url);
        },
      },
      isOffline: () => !win.navigator.onLine,
    },
    view,
  );
  ref.page = page;
  win.addEventListener("popstate", () => {
    void page.route();
  });
  void page.start();
};
