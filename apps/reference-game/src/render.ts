// The game's page: one heading and a line of detail in a polite live region,
// an alert for a pick the Wrapper did not accept, and the two calls. The DOM is
// built once and updated in place, so focus stays where the player left it.
// Elements are built with `createElement` and text goes in as text only: no
// markup string and no inline style. The text is English only: this is a
// sample, and the Snapshot's `context.language` is not used.

import type { RejectReason } from "@intraverse/se-client-shell/controller";

import { type CoinFlipRound, SIDES, type Side } from "./coin-flip.ts";
import type { GameView, ViewCause } from "./game.ts";

export const HEADING_ID = "rg-heading";

const SIDE_NAME: Readonly<Record<Side, string>> = Object.freeze({
  heads: "heads",
  tails: "tails",
});

const SIDE_LABEL: Readonly<Record<Side, string>> = Object.freeze({
  heads: "Heads",
  tails: "Tails",
});

const REJECTED: Readonly<Record<RejectReason, string>> = Object.freeze({
  not_legal: "That call is not allowed now. Try again.",
  not_active: "The round is not taking a call right now.",
  busy: "Your last call is still on its way. Wait a moment, then try again.",
  invalid: "The game sent a call the Wrapper could not read.",
});

/** A display multiplier (`×1.94`): a ratio, never an amount of money. */
const times = (multiplier: number): string => `×${multiplier.toFixed(2)}`;

type Text = { readonly heading: string; readonly detail: string };

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

/** The heading and detail of `view`. */
export const textOf = (view: GameView): Text => {
  switch (view.kind) {
    case "unavailable": {
      return view.reason === "not-framed"
        ? {
            heading: "Coin Flip runs inside the SuperEngine Wrapper",
            detail:
              "Open it from a game lobby: on its own, it has no round to show.",
          }
        : {
            heading: "Coin Flip cannot start",
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
        heading: "Not a Coin Flip round",
        detail: "This sample plays Coin Flip only: one flip, heads or tails.",
      };
    }
    case "round": {
      return roundText(view.round, view.pending);
    }
    default: {
      return { heading: "", detail: "" };
    }
  }
};

export type GamePage = {
  /**
   * Shows `view`. When the calls hide, focus moves to the heading if the
   * player's pick was answered or a call held focus, and only while the game's
   * document has focus: otherwise the Wrapper owns focus (W-46).
   */
  readonly show: (view: GameView, cause: ViewCause) => void;
  /** Called with the side the player clicks. */
  readonly onCall: (handler: (side: Side) => void) => void;
};

/** Builds the page into `host` and returns how to update it. */
export const createPage = (doc: Document, host: HTMLElement): GamePage => {
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Readonly<Record<string, string>>,
    children: readonly (Node | string)[] = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    element.append(...children);
    return element;
  };

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
  const main = el("main", { class: "rg-game" }, [
    el(
      "section",
      { class: "rg-state", "aria-live": "polite", "aria-atomic": "true" },
      [heading, detail],
    ),
    alert,
    calls,
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
    alert.textContent =
      round?.rejected === undefined ? "" : REJECTED[round.rejected];
    main.dataset["view"] = view.kind;
    if (round === undefined) delete main.dataset["status"];
    else main.dataset["status"] = round.round.status;
    const appearance = round?.round.appearance;
    if (appearance === undefined) delete root.dataset["theme"];
    else root.dataset["theme"] = appearance;
    if (round === undefined) delete root.dataset["device"];
    else root.dataset["device"] = round.round.device;
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
    if (
      calls.hidden &&
      (cause === "answered" || callFocused) &&
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
  });
};
