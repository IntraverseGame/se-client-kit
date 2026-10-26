// The game's page: one heading and a line of detail in a polite live region,
// an alert for a pick the Wrapper did not accept, and the picks: the two calls
// of Coin Flip, or the board of rows (board.ts) of any other `steps` round. The
// DOM is built once and updated in place, so focus stays where the player left
// it. Elements are built with `createElement` and text goes in as text only: no
// markup string and no inline style (dom.ts). The text (texts.ts) is English
// only: this is a sample, and the Snapshot's `context.language` is not used.

import { createBoard } from "./board.ts";
import { SIDES, type Side } from "./coin-flip.ts";
import { elementBuilder } from "./dom.ts";
import type { GameView, ViewCause } from "./game.ts";
import { REJECTED, textOf } from "./texts.ts";

export const HEADING_ID = "rg-heading";

const SIDE_LABEL: Readonly<Record<Side, string>> = Object.freeze({
  heads: "Heads",
  tails: "Tails",
});

export type GamePage = {
  /**
   * Shows `view`. When the calls hide, focus moves to the heading if the
   * player's pick was answered or a call held focus, and only while the game's
   * document has focus: otherwise the Wrapper owns focus (W-46).
   */
  readonly show: (view: GameView, cause: ViewCause) => void;
  /** Called with the side the player clicks. */
  readonly onCall: (handler: (side: Side) => void) => void;
  /** Called with the row and tile the player clicks (a `steps` round). */
  readonly onTile: (handler: (step: number, option: number) => void) => void;
};

/** Builds the page into `host` and returns how to update it. */
export const createPage = (doc: Document, host: HTMLElement): GamePage => {
  const el = elementBuilder(doc);

  const heading = el("h1", {
    id: HEADING_ID,
    class: "rg-heading",
    tabindex: "-1",
  });
  const detail = el("p", { class: "rg-detail" });
  const alert = el("p", { class: "rg-alert", role: "alert" });
  let handler: ((side: Side) => void) | undefined;
  const buttons = SIDES.map(side => {
    const button = el(
      "button",
      { type: "button", class: "rg-button", "data-side": side },
      [SIDE_LABEL[side]],
    );
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-disabled") !== "true") handler?.(side);
    });
    return button;
  });
  const calls = el(
    "div",
    { class: "rg-calls", role: "group", "aria-labelledby": "rg-calls-label" },
    [
      el("p", { id: "rg-calls-label", class: "rg-visually-hidden" }, [
        "Your call",
      ]),
      ...buttons,
    ],
  );
  const board = createBoard(el);
  const main = el("main", { class: "rg-game" }, [
    el(
      "section",
      { class: "rg-state", "aria-live": "polite", "aria-atomic": "true" },
      [heading, detail],
    ),
    alert,
    calls,
    board.element,
  ]);
  host.replaceChildren(main);

  const root = doc.documentElement;
  const show = (view: GameView, cause: ViewCause): void => {
    // Hiding a focused control would drop focus to the page: it goes to the
    // heading instead. The game yields when its document does not have focus
    // (decided in human review, 2026-10-18): at a round's end the Wrapper moves
    // focus to its own result heading (W-46), and the game never pulls it back
    // into the frame, whichever of the two updates comes first.
    const active = doc.activeElement;
    const callFocused = active !== null && calls.contains(active);
    const text = textOf(view);
    heading.textContent = text.heading;
    detail.textContent = text.detail;
    const round = view.kind === "round" ? view : undefined;
    const rows = view.kind === "steps" ? view : undefined;
    const shown = round ?? rows;
    alert.textContent =
      shown?.rejected === undefined ? "" : REJECTED[shown.rejected];
    main.dataset["view"] = view.kind;
    if (shown === undefined) delete main.dataset["status"];
    else main.dataset["status"] = shown.round.status;
    const appearance = shown?.round.appearance;
    if (appearance === undefined) delete root.dataset["theme"];
    else root.dataset["theme"] = appearance;
    if (shown === undefined) delete root.dataset["device"];
    else root.dataset["device"] = shown.round.device;
    const boardFocused = active !== null && board.contains(active);
    const rowsOpen =
      rows !== undefined && (rows.round.open || rows.pending !== undefined);
    board.show(rows);
    const showCalls =
      round !== undefined && (round.round.open || round.pending !== undefined);
    calls.hidden = !showCalls;
    for (const button of buttons) {
      const busy = round?.pending !== undefined;
      button.setAttribute("aria-disabled", String(busy || !showCalls));
      button.setAttribute(
        "aria-pressed",
        String(round?.pending === button.dataset["side"]),
      );
    }
    // On a board, focus leaves a tile once its row locks: when a Snapshot
    // answers the player's own pick, or when no row takes a pick, the heading
    // takes it (as it does when Coin Flip's calls hide). A `reject` also answers
    // the pick (cause `answered`) but leaves the row open for another pick, so a
    // tile that holds focus keeps it, as Coin Flip's calls do. A reject for a
    // pick a Snapshot already answered never reaches here (game.ts ignores it).
    // Coin Flip's own rule below applies to every view but a board, whose calls
    // are always hidden.
    const rejected = rows?.rejected !== undefined;
    const boardNeedsHeading =
      rows !== undefined &&
      ((boardFocused && ((cause === "answered" && !rejected) || !rowsOpen)) ||
        (!rowsOpen && cause === "answered"));
    if (
      ((rows === undefined &&
        calls.hidden &&
        (cause === "answered" || callFocused)) ||
        boardNeedsHeading) &&
      doc.hasFocus()
    ) {
      heading.focus({ preventScroll: true });
    }
  };

  return Object.freeze({
    show,
    onCall: (next: (side: Side) => void): void => {
      handler = next;
    },
    onTile: board.onTile,
  });
};
