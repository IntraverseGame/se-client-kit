// The game's page on a `steps` round that is not Coin Flip (Cash or Crash
// `[3,3,4]`): a labelled row of tiles per step, the tiles held except in the row
// being played, what each state says, the pick and its answer, and where focus
// goes. Coin Flip's page is in render.test.ts.

import { beforeEach, describe, expect, it } from "vitest";

import { CASH_OR_CRASH } from "./fixtures/cash-or-crash.ts";
import {
  alertText,
  boardShown,
  callsShown,
  detail,
  heading,
  headingFocusCount,
  mount,
  setDocumentFocus,
  tile,
} from "./fixtures/page.ts";
import {
  rejectMessage,
  SNAPSHOTS,
  snapshotMessage,
} from "./fixtures/snapshots.ts";

/** The text of the label a row group names. */
const labelOf = (host: HTMLElement, row: Element): string | null =>
  host.querySelector(`#${row.getAttribute("aria-labelledby") ?? ""}`)
    ?.textContent ?? null;

beforeEach(() => {
  delete document.documentElement.dataset["theme"];
  delete document.documentElement.dataset["device"];
});

describe("rendering per state", () => {
  it.each<[keyof typeof CASH_OR_CRASH, string, string]>([
    [
      "idle",
      "Ready to play",
      "Place a bet in the Wrapper to start a round of 3 rows.",
    ],
    [
      "active",
      "Pick a tile in row 2",
      "Row 2 of 3 pays ×2.18. Cash out in the Wrapper to keep what you have.",
    ],
    ["resolving", "Settling the round", "The result is on its way."],
    ["lost", "You lost", "A tile ended the round."],
    [
      "wonByCashOut",
      "You won",
      "The round ended with a win. The round paid ×2.18.",
    ],
    [
      "wonExpired",
      "You won",
      "The time limit ended the round. The round paid ×1.46.",
    ],
  ])("shows %s", (name, title, text) => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH[name]));
    expect(heading(host)).toBe(title);
    expect(detail(host)).toBe(text);
    expect(host.querySelector("main")?.dataset["status"]).toBe(
      CASH_OR_CRASH[name].status,
    );
    expect(boardShown(host)).toBe(true);
    expect(callsShown(host)).toBe(false);
  });

  it("builds a labelled row per step, with a tile per option", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    const rows = [...host.querySelectorAll('.rg-row[role="group"]')];
    expect(rows).toHaveLength(3);
    expect(rows.map(row => labelOf(host, row))).toEqual([
      "Row 1 (×1.46)",
      "Row 2 (×2.18)",
      "Row 3 (×2.91)",
    ]);
    expect(rows.map(row => row.querySelectorAll("button").length)).toEqual([
      3, 3, 4,
    ]);
  });

  it("takes picks only in the row being played", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    expect(tile(host, 1, 0).getAttribute("aria-disabled")).toBe("false");
    expect(tile(host, 1, 2).getAttribute("aria-disabled")).toBe("false");
    expect(tile(host, 0, 0).getAttribute("aria-disabled")).toBe("true");
    expect(tile(host, 2, 3).getAttribute("aria-disabled")).toBe("true");
  });

  it("marks the tile that was picked and the one that crashed, in text and state", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    expect(tile(host, 0, 2).getAttribute("aria-pressed")).toBe("true");
    expect(tile(host, 0, 2).dataset["mark"]).toBe("chosen");
    expect(tile(host, 0, 1).textContent).toBe("Tile 2 (crash)");
    expect(tile(host, 0, 1).dataset["mark"]).toBe("crash");
    expect(tile(host, 1, 0).getAttribute("aria-pressed")).toBe("false");
    expect(tile(host, 1, 0).textContent).toBe("Tile 1");
  });

  it("holds every tile once the round is over", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.lost));
    for (const button of host.querySelectorAll(".rg-tile")) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
  });

  it("hides the board for Coin Flip and shows it again for rows", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    expect(boardShown(host)).toBe(false);
    expect(callsShown(host)).toBe(true);
    parent.send(snapshotMessage({ ...CASH_OR_CRASH.active, version: 9 }));
    expect(boardShown(host)).toBe(true);
    expect(callsShown(host)).toBe(false);
  });

  it("renders the Snapshot's text as text, never as markup", () => {
    const { parent, host } = mount();
    parent.send(
      snapshotMessage({
        ...CASH_OR_CRASH.wonByCashOut,
        roundId: "<img src=x onerror=alert(1)>",
      }),
    );
    expect(host.querySelector("img")).toBeNull();
  });
});

describe("a pick", () => {
  it("sends the row's index and the tile, and holds every tile until answered", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 2).click();
    expect(parent.posted.at(-1)?.message).toMatchObject({
      type: "action",
      verb: "pick",
      args: { step: 1, option: 2 },
    });
    expect(heading(host)).toBe("Picking tile 3 of row 2");
    expect(tile(host, 1, 2).getAttribute("aria-pressed")).toBe("true");
    expect(tile(host, 1, 0).getAttribute("aria-disabled")).toBe("true");
    tile(host, 1, 0).click();
    expect(parent.posted).toHaveLength(2);
  });

  it("shows a reject in the alert and lets the player pick again", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 0).click();
    parent.send(rejectMessage("pick-1", "not_legal"));
    expect(alertText(host)).toBe("That call is not allowed now. Try again.");
    expect(tile(host, 1, 0).getAttribute("aria-disabled")).toBe("false");
    tile(host, 1, 1).click();
    expect(parent.posted).toHaveLength(3);
  });

  it("ignores a click on a held tile", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 0, 0).click();
    expect(parent.posted).toHaveLength(1);
  });
});

describe("focus on the board", () => {
  it("moves to the heading when the player's own pick is answered", () => {
    const restore = setDocumentFocus(true);
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 0).focus();
    tile(host, 1, 0).click();
    const count = headingFocusCount(host);
    parent.send(snapshotMessage(CASH_OR_CRASH.resolving));
    expect(count()).toBe(1);
    restore();
  });

  it("does not move when the game's document has no focus", () => {
    const restore = setDocumentFocus(false);
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 0).focus();
    tile(host, 1, 0).click();
    const count = headingFocusCount(host);
    parent.send(snapshotMessage(CASH_OR_CRASH.resolving));
    expect(count()).toBe(0);
    restore();
  });

  it("does not move on an update that leaves the row open", () => {
    const restore = setDocumentFocus(true);
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    tile(host, 1, 0).focus();
    const count = headingFocusCount(host);
    parent.send(snapshotMessage({ ...CASH_OR_CRASH.active, version: 9 }));
    expect(count()).toBe(0);
    restore();
  });
});
