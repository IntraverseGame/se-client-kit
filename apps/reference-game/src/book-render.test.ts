// The game's page on a book round (the `playback` presentation, issue #146):
// what each of the four statuses shows, the draw shown at once (the drawn row,
// its display multiplier, and the events as an ordered list), an event's data
// as text and never as markup, cut at `EVENT_DATA_TEXT_LIMIT` code points, no
// `action` ever sent, and the switch between a book round and a `steps` round.

import type { HelloMessage } from "@intraverse/se-client-shell/controller";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EVENT_DATA_TEXT_LIMIT, eventDataText } from "./book.ts";
import { BOOK, withEvents, withoutDraw } from "./fixtures/book-playback.ts";
import { CASH_OR_CRASH } from "./fixtures/cash-or-crash.ts";
import {
  alertText,
  boardShown,
  callButton,
  callsShown,
  detail,
  heading,
  mount,
  setDocumentFocus,
  tile,
} from "./fixtures/page.ts";
import {
  rejectMessage,
  SNAPSHOTS,
  snapshotMessage,
} from "./fixtures/snapshots.ts";
import { HEADING_ID } from "./render.ts";

const textOf = (host: HTMLElement, selector: string): string =>
  host.querySelector(selector)?.textContent ?? "";

const shown = (host: HTMLElement, selector: string): boolean =>
  host.querySelector<HTMLElement>(selector)?.hidden === false;

/** The text of each item of the events list, in order. */
const eventItems = (host: HTMLElement): string[] =>
  [...host.querySelectorAll(".rg-events > li")].map(
    item => item.textContent ?? "",
  );

const restores: (() => void)[] = [];

beforeEach(() => {
  delete document.documentElement.dataset["theme"];
  delete document.documentElement.dataset["device"];
});

afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});

describe("a book round, per status", () => {
  it.each<[keyof typeof BOOK, string, string]>([
    ["idle", "Ready to play", "Place a bet in the Wrapper to start a round."],
    ["starting", "Starting the round", "The round is being prepared."],
    ["won", "You won", "Book 41 was drawn."],
    ["lost", "You lost", "Book 7 was drawn."],
  ])("shows %s in the live region, with the mode", (name, title, text) => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK[name]));
    expect(heading(host)).toBe(title);
    expect(detail(host)).toBe(text);
    expect(shown(host, ".rg-book")).toBe(true);
    expect(textOf(host, ".rg-book-mode")).toBe("Mode: base");
    expect(callsShown(host)).toBe(false);
    expect(boardShown(host)).toBe(false);
    const main = host.querySelector<HTMLElement>(".rg-game");
    expect(main?.dataset["view"]).toBe("book");
    expect(main?.dataset["status"]).toBe(name);
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(document.documentElement.dataset["device"]).toBe("mobile");
  });

  it.each(["idle", "starting"] as const)("shows no draw on %s", name => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK[name]));
    expect(shown(host, ".rg-book-draw")).toBe(false);
    expect(eventItems(host)).toEqual([]);
  });

  it("shows the won draw at once: the row, its multiplier, and the events in order", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK.won));
    expect(shown(host, ".rg-book-draw")).toBe(true);
    expect(textOf(host, ".rg-book-row")).toBe("Book 41 (×1.94)");
    const list = host.querySelector(".rg-events");
    expect(list?.tagName).toBe("OL");
    expect(list?.getAttribute("aria-labelledby")).toBe("rg-events-label");
    expect(textOf(host, "#rg-events-label")).toBe("Events");
    expect(eventItems(host)).toEqual(['0. reveal {"side":"heads"}', "1. win"]);
  });

  it("shows the lost draw, with its multiplier and never an amount", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK.lost));
    expect(textOf(host, ".rg-book-row")).toBe("Book 7 (×0.00)");
    expect(eventItems(host)).toEqual(['0. reveal {"side":"tails"}', "1. lose"]);
    expect(host.textContent).not.toMatch(/€|EUR|payout/u);
  });

  it.each<["won" | "lost", string, string]>([
    ["won", "You won", "The round ended with a win."],
    ["lost", "You lost", "The round ended without a win."],
  ])(
    "shows a %s copy without a draw with its status, and no draw or events",
    (name, title, text) => {
      const { parent, host } = mount();
      parent.send(snapshotMessage(withoutDraw(BOOK[name])));
      expect(heading(host)).toBe(title);
      expect(detail(host)).toBe(text);
      expect(shown(host, ".rg-book-draw")).toBe(false);
      expect(textOf(host, ".rg-book-row")).toBe("");
      expect(eventItems(host)).toEqual([]);
    },
  );

  it("clears the draw when the next round's idle copy comes", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK.won));
    parent.send(snapshotMessage({ ...BOOK.idle, version: 4 }));
    expect(heading(host)).toBe("Ready to play");
    expect(shown(host, ".rg-book-draw")).toBe(false);
    expect(eventItems(host)).toEqual([]);
  });
});

describe("an event's data on the page", () => {
  it("is text, never markup: no element is made from it", () => {
    const { parent, host } = mount();
    const markup = '<img src=x onerror="globalThis.ran=1"><b>bold</b>';
    parent.send(
      snapshotMessage(
        withEvents([{ index: 0, type: "<i>type</i>", data: { html: markup } }]),
      ),
    );
    const data = host.querySelector(".rg-event-data");
    expect(data?.textContent).toBe(JSON.stringify({ html: markup }));
    expect(data?.children).toHaveLength(0);
    expect(textOf(host, ".rg-event-type")).toBe("0. <i>type</i>");
    expect(host.querySelector("img, b, i")).toBeNull();
    expect(Reflect.get(globalThis, "ran")).toBeUndefined();
  });

  it("is compact JSON text", () => {
    const data = { a: [1, 2.5, null, true], b: { c: "d" } };
    expect(eventDataText(data)).toBe('{"a":[1,2.5,null,true],"b":{"c":"d"}}');
  });

  it("is kept whole at the limit, and cut with … past it", () => {
    // `{"a":"` and `"}` are 8 code points around the string.
    const exact = { a: "x".repeat(EVENT_DATA_TEXT_LIMIT - 8) };
    expect(Array.from(eventDataText(exact))).toHaveLength(
      EVENT_DATA_TEXT_LIMIT,
    );
    expect(eventDataText(exact)).not.toMatch(/…$/u);
    const over = { a: "x".repeat(EVENT_DATA_TEXT_LIMIT) };
    const cut = eventDataText(over);
    expect(cut).toBe(
      `${JSON.stringify(over).slice(0, EVENT_DATA_TEXT_LIMIT)}…`,
    );
  });

  it("is cut in code points, so a surrogate pair at the cut stays whole", () => {
    // The emoji is the limit-th code point: two UTF-16 code units.
    const prefix = '{"a":"';
    const fill = "x".repeat(EVENT_DATA_TEXT_LIMIT - prefix.length - 1);
    const data = { a: `${fill}😀😀tail` };
    const cut = eventDataText(data);
    expect(cut).toBe(`${prefix}${fill}😀…`);
    expect(Array.from(cut)).toHaveLength(EVENT_DATA_TEXT_LIMIT + 1);
    expect(cut).toHaveLength(EVENT_DATA_TEXT_LIMIT + 2);
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);

    const { parent, host } = mount();
    parent.send(snapshotMessage(withEvents([{ index: 0, type: "t", data }])));
    expect(textOf(host, ".rg-event-data")).toBe(cut);
  });
});

describe("no pick on a book round", () => {
  it("says hello with both presentations", () => {
    const { parent } = mount();
    expect(parent.posted).toHaveLength(1);
    const hello = parent.posted[0]?.message as HelloMessage;
    expect(hello.presentations).toEqual(["steps", "playback"]);
    expect(hello.statuses).toHaveLength(7);
  });

  it.each(Object.keys(BOOK) as (keyof typeof BOOK)[])(
    "sends no action on %s, whatever is clicked or asked",
    name => {
      const { parent, host, game } = mount();
      parent.send(snapshotMessage(BOOK[name]));
      for (const element of host.querySelectorAll<HTMLElement>("*")) {
        element.click();
      }
      game.pick("heads");
      game.pickTile(0, 0);
      expect(parent.posted).toHaveLength(1);
      expect(parent.posted[0]?.message).toMatchObject({ type: "hello" });
    },
  );
});

describe("between a steps round and a book round", () => {
  it("drops a pending pick when a book copy comes, and ignores its late reject", () => {
    restores.push(setDocumentFocus(true));
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    const heads = callButton(host, "Heads");
    heads.focus();
    heads.click();
    expect(parent.posted).toHaveLength(2);
    parent.send(snapshotMessage({ ...BOOK.won, version: 4 }));
    expect(heading(host)).toBe("You won");
    expect(callsShown(host)).toBe(false);
    expect(document.activeElement?.id).toBe(HEADING_ID);
    parent.send(rejectMessage("pick-1", "busy"));
    expect(alertText(host)).toBe("");
    expect(heading(host)).toBe("You won");
  });

  it("moves focus to the heading when the board hides under a focused tile", () => {
    restores.push(setDocumentFocus(true));
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 0).focus();
    parent.send(snapshotMessage({ ...BOOK.idle, version: 9 }));
    expect(boardShown(host)).toBe(false);
    expect(document.activeElement?.id).toBe(HEADING_ID);
  });

  it("leaves focus to the Wrapper when the game's document has no focus", () => {
    restores.push(setDocumentFocus(false));
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 0).focus();
    parent.send(snapshotMessage({ ...BOOK.won, version: 9 }));
    expect(document.activeElement?.id).not.toBe(HEADING_ID);
  });

  it("ignores a copy with a lower version, of either presentation", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK.won));
    parent.send(snapshotMessage(SNAPSHOTS.idle));
    parent.send(snapshotMessage(BOOK.idle));
    expect(heading(host)).toBe("You won");
    expect(eventItems(host)).toHaveLength(2);
  });

  it("plays a steps round again after a book round", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(BOOK.won));
    parent.send(snapshotMessage(SNAPSHOTS.won));
    expect(heading(host)).toBe("You won");
    expect(detail(host)).toBe(
      "The coin landed tails. You called tails. The win pays ×1.94.",
    );
    expect(shown(host, ".rg-book")).toBe(false);
    parent.send(snapshotMessage({ ...SNAPSHOTS.active, version: 6 }));
    expect(callsShown(host)).toBe(true);
    callButton(host, "Tails").click();
    expect(parent.posted.at(-1)?.message).toMatchObject({
      type: "action",
      args: { step: 0, option: 1 },
    });
  });
});
