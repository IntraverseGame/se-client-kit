// The browser entry: the one place that reads globals. The parent window is
// `window.parent` only when the game is framed (a top-level page is its own
// parent), and its origin comes from the game's URL and the browser
// (parent-origin.ts). The stylesheet is linked from index.html.

import { mountGame } from "./mount.ts";
import { parentOriginOf } from "./parent-origin.ts";

const host = document.querySelector<HTMLElement>("#game");
if (host !== null) {
  const framed = window.parent !== window;
  mountGame({
    doc: document,
    host,
    parent: framed ? window.parent : undefined,
    parentOrigin: framed
      ? parentOriginOf(location.search, [...(location.ancestorOrigins ?? [])])
      : undefined,
    listen: handler => {
      const listener = (event: MessageEvent): void => {
        handler({
          source: event.source,
          origin: event.origin,
          data: event.data,
        });
      };
      window.addEventListener("message", listener);
      return () => {
        window.removeEventListener("message", listener);
      };
    },
  });
}
