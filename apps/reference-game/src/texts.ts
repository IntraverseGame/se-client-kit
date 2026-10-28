// What the game's page says: the heading and the line of detail of each view,
// and the explanation of each reject. English only: this is a sample, and the
// Snapshot's `context.language` is not used. Text only; no markup.

import type { RejectReason } from "@intraverse/se-client-shell/controller";

import type { BookRound } from "./book-round.ts";
import type { CoinFlipRound, Side } from "./coin-flip.ts";
import type { GameView, TilePick } from "./game.ts";
import type { StepsRound } from "./steps-round.ts";

const SIDE_NAME: Readonly<Record<Side, string>> = Object.freeze({
  heads: "heads",
  tails: "tails",
});

export const REJECTED: Readonly<Record<RejectReason, string>> = Object.freeze({
  not_legal: "That call is not allowed now. Try again.",
  not_active: "The round is not taking a call right now.",
  busy: "Your last call is still on its way. Wait a moment, then try again.",
  invalid: "The game sent a call the Wrapper could not read.",
});

/** A display multiplier (`×1.94`): a ratio, never an amount of money. */
const times = (multiplier: number): string => `×${multiplier.toFixed(2)}`;

export type Text = { readonly heading: string; readonly detail: string };

const called = (side: Side | undefined): string =>
  side === undefined ? "" : ` You called ${SIDE_NAME[side]}.`;

const landed = (side: Side | undefined): string =>
  side === undefined ? "" : `The coin landed ${SIDE_NAME[side]}.`;

const activeText = (round: CoinFlipRound, pending: Side | undefined): Text => {
  if (pending !== undefined) {
    return {
      heading: `Calling ${SIDE_NAME[pending]}`,
      detail: "Waiting for the Wrapper to take your call.",
    };
  }
  if (round.open) {
    return {
      heading: "Call it: heads or tails",
      detail: `A win pays ${times(round.multiplier)}.`,
    };
  }
  return {
    heading: "Waiting for the flip",
    detail: `Your call is in.${called(round.call)}`,
  };
};

const roundText = (round: CoinFlipRound, pending: Side | undefined): Text => {
  switch (round.status) {
    case "idle": {
      return {
        heading: "Ready to flip",
        detail: `Place a bet in the Wrapper to start a round. A win pays ${times(round.multiplier)}.`,
      };
    }
    case "starting": {
      return {
        heading: "Starting the round",
        detail: "The Wrapper is opening the round. Your call comes next.",
      };
    }
    case "active": {
      return activeText(round, pending);
    }
    case "resolving": {
      return {
        heading: "Flipping the coin",
        detail: `The result is on its way.${called(round.call)}`,
      };
    }
    case "won": {
      return {
        heading: "You won",
        detail:
          `${landed(round.landed)}${called(round.call)} The win pays ${times(round.multiplier)}.`.trim(),
      };
    }
    case "lost": {
      return {
        heading: "You lost",
        detail: `${landed(round.landed)}${called(round.call)}`.trim(),
      };
    }
    case "canceled": {
      const why = round.expired
        ? "The round expired before it finished."
        : "The round was canceled.";
      const reveal =
        round.landed === undefined ? "" : ` ${landed(round.landed)}`;
      return { heading: "Round canceled", detail: `${why}${reveal}` };
    }
    default: {
      // A status outside the seven never parses (protocol.ts).
      return { heading: "Waiting for the round", detail: "" };
    }
  }
};

/** A step's row number as the player reads it (rows count from 1). */
const rowNumber = (round: StepsRound, step: number): number =>
  round.steps.findIndex(candidate => candidate.index === step) + 1;

const stepsActiveText = (
  round: StepsRound,
  pending: TilePick | undefined,
): Text => {
  if (pending !== undefined) {
    return {
      heading: `Picking tile ${String(pending.option + 1)} of row ${String(rowNumber(round, pending.step))}`,
      detail: "Waiting for the Wrapper to take your pick.",
    };
  }
  const row =
    round.step === undefined
      ? undefined
      : round.steps.find(candidate => candidate.index === round.step);
  if (round.open && row !== undefined && round.step !== undefined) {
    return {
      heading: `Pick a tile in row ${String(rowNumber(round, round.step))}`,
      detail: `Row ${String(rowNumber(round, round.step))} of ${String(round.steps.length)} pays ×${row.multiplier.toFixed(2)}. Cash out in the Wrapper to keep what you have.`,
    };
  }
  return { heading: "Waiting for the next row", detail: "" };
};

const stepsText = (round: StepsRound, pending: TilePick | undefined): Text => {
  const earned =
    round.currentMultiplier === undefined
      ? ""
      : ` The round paid ×${round.currentMultiplier.toFixed(2)}.`;
  switch (round.status) {
    case "idle": {
      return {
        heading: "Ready to play",
        detail: `Place a bet in the Wrapper to start a round of ${String(round.steps.length)} rows.`,
      };
    }
    case "starting": {
      return {
        heading: "Starting the round",
        detail: "The Wrapper is opening the round. Your first pick comes next.",
      };
    }
    case "active": {
      return stepsActiveText(round, pending);
    }
    case "resolving": {
      return {
        heading: "Settling the round",
        detail: "The result is on its way.",
      };
    }
    case "won": {
      return {
        heading: "You won",
        detail: round.expired
          ? `The time limit ended the round.${earned}`
          : `The round ended with a win.${earned}`.trim(),
      };
    }
    case "lost": {
      return { heading: "You lost", detail: "A tile ended the round." };
    }
    case "canceled": {
      return {
        heading: "Round canceled",
        detail: round.expired
          ? "The round expired before it finished."
          : "The round was canceled.",
      };
    }
    default: {
      // A status outside the seven never parses (protocol.ts).
      return { heading: "Waiting for the round", detail: "" };
    }
  }
};

/**
 * A book round's state. The draw itself (its row, multiplier, and events) is
 * shown below the live region (book.ts); here it is only named.
 */
const bookText = (round: BookRound): Text => {
  const drawn =
    round.draw === undefined
      ? undefined
      : `Book ${String(round.draw.index)} was drawn.`;
  switch (round.status) {
    case "idle": {
      return {
        heading: "Ready to play",
        detail: "Place a bet in the Wrapper to start a round.",
      };
    }
    case "starting": {
      return {
        heading: "Starting the round",
        detail: "The round is being prepared.",
      };
    }
    case "won": {
      return {
        heading: "You won",
        detail: drawn ?? "The round ended with a win.",
      };
    }
    case "lost": {
      return {
        heading: "You lost",
        detail: drawn ?? "The round ended without a win.",
      };
    }
    default: {
      // A book round shows only these four statuses (book-snapshot.ts).
      return { heading: "Waiting for the round", detail: "" };
    }
  }
};

/** The heading and detail of `view`. */
export const textOf = (view: GameView): Text => {
  switch (view.kind) {
    case "unavailable": {
      return view.reason === "not-framed"
        ? {
            heading: "This game runs inside the SuperEngine Wrapper",
            detail:
              "Open it from a game lobby: on its own, it has no round to show.",
          }
        : {
            heading: "This game cannot start",
            detail:
              "The page that opened it did not say where it runs, so the game talks to nobody.",
          };
    }
    case "waiting": {
      return {
        heading: "Waiting for the round",
        detail: "The Wrapper sends the round when it is ready.",
      };
    }
    case "unsupported": {
      return {
        heading: "Nothing to play",
        detail: "This round has no rows. The sample plays rounds with rows.",
      };
    }
    case "round": {
      return roundText(view.round, view.pending);
    }
    case "steps": {
      return stepsText(view.round, view.pending);
    }
    case "book": {
      return bookText(view.round);
    }
    default: {
      return { heading: "", detail: "" };
    }
  }
};
