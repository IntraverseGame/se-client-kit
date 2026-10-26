// The board of a `steps` round that is not Coin Flip: a labelled group per row
// and a button per tile. The tiles are built when the rows' shape changes and
// updated in place otherwise, so focus stays where the player left it. A tile
// takes a pick only in the row being played, and not while a pick waits for its
// answer; the other tiles are held (`aria-disabled`). A picked tile is
// `aria-pressed`, and the tile that ended a revealed row says so in its text.

import type { GameStep } from "@intraverse/se-client-shell/controller";

import type { ElementBuilder } from "./dom.ts";
import type { GameView } from "./game.ts";

export type StepsView = Extract<GameView, { kind: "steps" }>;

export type Board = {
  readonly element: HTMLElement;
  /** Shows the rows of `view`, or hides the board when there is none. */
  readonly show: (view: StepsView | undefined) => void;
  /** Whether `node` is in the board. */
  readonly contains: (node: Node) => boolean;
  /** Called with the row's `index` and the tile the player clicks. */
  readonly onTile: (handler: (step: number, option: number) => void) => void;
};

/** A display multiplier (`×1.94`): a ratio, never an amount of money. */
const times = (multiplier: number): string => `×${multiplier.toFixed(2)}`;

const markTile = (tile: HTMLButtonElement, view: StepsView): void => {
  const { round, pending } = view;
  const step = Number(tile.dataset["step"]);
  const option = Number(tile.dataset["option"]);
  const row = round.steps.find(candidate => candidate.index === step);
  const asked = pending?.step === step && pending.option === option;
  const chosen = row?.selectedIndex === option;
  const crash = row?.losingIndex === option;
  const actionable = round.open && pending === undefined && round.step === step;
  tile.setAttribute("aria-disabled", String(!actionable));
  tile.setAttribute("aria-pressed", String(chosen || asked));
  tile.dataset["mark"] = crash ? "crash" : chosen ? "chosen" : "open";
  tile.textContent = `Tile ${String(option + 1)}${crash ? " (crash)" : ""}`;
};

export const createBoard = (el: ElementBuilder): Board => {
  const element = el("div", { class: "rg-board" });
  element.hidden = true;
  let handler: ((step: number, option: number) => void) | undefined;
  // The rows' shape the board was built for; it is rebuilt only when it changes.
  let shape = "";
  let tiles: HTMLButtonElement[] = [];

  const rowOf = (step: GameStep, position: number): HTMLElement => {
    const labelId = `rg-row-${String(position)}-label`;
    const row = el(
      "div",
      { class: "rg-row", role: "group", "aria-labelledby": labelId },
      [
        el("p", { id: labelId, class: "rg-row-label" }, [
          `Row ${String(position + 1)} (${times(step.multiplier)})`,
        ]),
      ],
    );
    const rowTiles = Array.from({ length: step.optionCount }, (_, option) => {
      const tile = el(
        "button",
        {
          type: "button",
          class: "rg-button rg-tile",
          "data-step": String(step.index),
          "data-option": String(option),
        },
        [`Tile ${String(option + 1)}`],
      );
      tile.addEventListener("click", () => {
        if (tile.getAttribute("aria-disabled") !== "true") {
          handler?.(step.index, option);
        }
      });
      return tile;
    });
    row.append(el("div", { class: "rg-tiles" }, rowTiles));
    tiles.push(...rowTiles);
    return row;
  };

  const build = (steps: readonly GameStep[]): void => {
    tiles = [];
    element.replaceChildren(
      ...steps.map((step, position) => rowOf(step, position)),
    );
  };

  return Object.freeze({
    element,
    show: (view: StepsView | undefined): void => {
      element.hidden = view === undefined;
      if (view === undefined) return;
      const next = view.round.steps
        .map(step => `${String(step.index)}:${String(step.optionCount)}`)
        .join(",");
      if (next !== shape) {
        shape = next;
        build(view.round.steps);
      }
      for (const tile of tiles) markTile(tile, view);
    },
    contains: (node: Node): boolean => element.contains(node),
    onTile: (next): void => {
      handler = next;
    },
  });
};
