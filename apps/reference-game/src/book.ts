// The page of a book round (the `playback` presentation): the mode it plays,
// and on `won` and `lost` the draw, shown at once with no animation: the drawn
// row (`Book <index>`), its display multiplier (`×<payoutMultiplier>`, never an
// amount), and the events as an ordered list, one item per event,
// `<index>. <type>` and its `data`, when present, as compact JSON text. The
// page names no event type and no `data` shape of any package: a real slot
// renderer is the game developer's. Every text goes in with `textContent` (or
// as a text node) only, so nothing in the data is ever parsed as markup.

import type {
  GameBookDraw,
  GameBookEvent,
  GameEventData,
} from "@intraverse/se-client-shell/controller";

import type { ElementBuilder } from "./dom.ts";
import type { GameView } from "./game.ts";

export type BookView = Extract<GameView, { kind: "book" }>;

/** How many code points of an event's `data` text the page shows. */
export const EVENT_DATA_TEXT_LIMIT = 200;

/**
 * An event's `data` as compact JSON text, cut to `EVENT_DATA_TEXT_LIMIT` code
 * points with `…` added when it is cut. The cut counts code points, never
 * UTF-16 code units, so a surrogate pair is never split.
 */
export const eventDataText = (data: GameEventData): string => {
  const text = JSON.stringify(data);
  const points = Array.from(text);
  return points.length <= EVENT_DATA_TEXT_LIMIT
    ? text
    : `${points.slice(0, EVENT_DATA_TEXT_LIMIT).join("")}…`;
};

/**
 * The drawn row's display multiplier with two fraction digits, as Coin Flip
 * shows its own (`×1.94`): a ratio, never an amount of money.
 */
const times = (multiplier: number): string => `×${multiplier.toFixed(2)}`;

export type BookPage = {
  readonly element: HTMLElement;
  /** Shows the round of `view`, or hides the book page when there is none. */
  readonly show: (view: BookView | undefined) => void;
};

export const createBookPage = (el: ElementBuilder): BookPage => {
  const mode = el("p", { class: "rg-book-mode" });
  const row = el("p", { class: "rg-book-row" });
  const events = el("ol", {
    class: "rg-events",
    // `list-style: none` drops the list's role in some screen readers.
    role: "list",
    "aria-labelledby": "rg-events-label",
  });
  const draw = el("div", { class: "rg-book-draw" }, [
    row,
    el("p", { id: "rg-events-label", class: "rg-events-label" }, ["Events"]),
    events,
  ]);
  const element = el("section", { class: "rg-book" }, [mode, draw]);
  element.hidden = true;

  const itemOf = (event: GameBookEvent): HTMLElement => {
    const item = el("li", { class: "rg-event" }, [
      el("span", { class: "rg-event-type" }, [
        `${String(event.index)}. ${event.type}`,
      ]),
    ]);
    if (event.data !== undefined) {
      const data = el("code", { class: "rg-event-data" });
      data.textContent = eventDataText(event.data);
      item.append(" ", data);
    }
    return item;
  };

  const showDraw = (shown: GameBookDraw | undefined): void => {
    draw.hidden = shown === undefined;
    if (shown === undefined) {
      row.textContent = "";
      events.replaceChildren();
      return;
    }
    row.textContent = `Book ${String(shown.index)} (${times(shown.payoutMultiplier)})`;
    events.replaceChildren(...shown.events.map(itemOf));
  };

  return Object.freeze({
    element,
    show: (view: BookView | undefined): void => {
      element.hidden = view === undefined;
      mode.textContent = view === undefined ? "" : `Mode: ${view.round.model}`;
      showDraw(view?.round.draw);
    },
  });
};
