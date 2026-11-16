// The start control (W-57's labels, RFC-005 sections 5 and 6): one primary
// button of one width in every state and label, its label centred, no icon at
// rest, and a spinner at its right edge, out of the flow, while the start is in
// flight (`aria-busy`). It reads "Place bet" at `idle` and "Play again" beside
// a result, for every game. Its tooltip and `aria-keyshortcuts` name the Space
// shortcut, which works only while the focus is on the bar itself (Q5). Its
// right end is the autoplay segment when the deployment turns autoplay on and
// the session's rounds are book rounds (W-61): its popover offers the
// configuration's counts; during a run it shows the count left and stops the
// run. While the player owes the first pick of a steps round, the control's
// place holds "↑ Make your pick", which is not a control and is hidden from
// assistive technology; the status line says the same.

import { withCount } from "./bar-messages.ts";
import type { BetModel } from "./bet-stepper.ts";
import type { Builder } from "./dom.ts";
import { glyph } from "./icons.ts";
import type { Messages } from "./messages.ts";
import { popover } from "./popover.ts";
import type { Intents, ViewOptions } from "./view-options.ts";

export type StartArgs = {
  readonly el: Builder;
  readonly doc: Document;
  readonly m: Messages;
  readonly model: BetModel;
  readonly intents: Intents;
  readonly options: ViewOptions;
  readonly label: "action.placeBet" | "action.playAgain";
  /** The session's rounds are book rounds: autoplay may be offered. */
  readonly book: boolean;
};

/** The autoplay segment at rest: its popover offers the counts. */
const autoplaySegment = (args: StartArgs): HTMLElement | undefined => {
  const { el, doc, m, model, intents, options } = args;
  const counts = options.autoplay?.counts;
  const begin = intents.autoplay;
  if (!args.book || counts === undefined || begin === undefined) {
    return undefined;
  }
  const button = el(
    "button",
    {
      type: "button",
      class: "se-autoplay",
      "aria-label": m["autoplay.open"],
      "aria-haspopup": "true",
      "data-focus-key": "autoplay",
    },
    [glyph(doc, "up")],
  );
  button.disabled = options.calling === true || model.selected() === undefined;
  const pop = popover(el, doc, {
    className: "se-autoplay-anchor",
    button,
    align: "end",
    content: () => [
      el("h2", { class: "se-popover__title" }, [m["autoplay.heading"]]),
      el(
        "div",
        { class: "se-counts" },
        counts.map(count => {
          const choice = el(
            "button",
            {
              type: "button",
              class: "se-count",
              "aria-label": `${count} ${m["autoplay.count"]}`,
            },
            [String(count)],
          );
          choice.addEventListener("click", () => {
            const bet = model.selected();
            pop.close();
            if (bet !== undefined) begin(count, bet);
          });
          return choice;
        }),
      ),
      el("p", { class: "se-popover__hint" }, [m["autoplay.hint"]]),
    ],
  });
  return pop.element;
};

/** The run's stop: the count left and a stop square (W-61). */
const stopSegment = (
  args: StartArgs,
  left: number,
): HTMLButtonElement | undefined => {
  const { el, doc, m, intents } = args;
  const stop = intents.stopAutoplay;
  if (stop === undefined) return undefined;
  const button = el(
    "button",
    {
      type: "button",
      class: "se-autoplay se-autoplay--running",
      "aria-label": `${m["autoplay.stop"]}, ${withCount(m["autoplay.status"], left)}`,
      "data-focus-key": "autoplay-stop",
    },
    [el("span", { "aria-hidden": "true" }, [String(left)]), glyph(doc, "stop")],
  );
  button.addEventListener("click", stop);
  return button;
};

/** The start control, with its autoplay segment when offered. */
export const startControl = (args: StartArgs): HTMLElement => {
  const { el, m, model, intents, options } = args;
  const run = options.autoplay?.run;
  const busy = options.calling === true || run !== undefined;
  const start = el(
    "button",
    {
      type: "button",
      class: "se-start",
      title: m["start.shortcut"],
      "aria-keyshortcuts": "Space",
      "data-focus-key": "start",
    },
    [
      el("span", { class: "se-start__label" }, [m[args.label]]),
      el("span", { class: "se-spinner", "aria-hidden": "true" }),
    ],
  );
  // Busy, not removed: the control keeps its place and width (RFC-005).
  start.setAttribute("aria-disabled", String(busy));
  if (busy) start.setAttribute("aria-busy", "true");
  start.disabled = model.selected() === undefined;
  start.addEventListener("click", () => {
    const bet = model.selected();
    if (busy || bet === undefined) return;
    intents.start?.(bet);
  });
  const segment =
    run === undefined ? autoplaySegment(args) : stopSegment(args, run.left);
  return el(
    "div",
    {
      class: "se-start-group",
      ...(segment === undefined ? {} : { "data-autoplay": "" }),
    },
    [start, segment],
  );
};

/**
 * What holds the start control's place while the player owes the first pick:
 * text, not a control, hidden from assistive technology (RFC-005 section 5).
 */
export const pickPrompt = (
  el: Builder,
  doc: Document,
  m: Messages,
): HTMLElement =>
  el("div", { class: "se-pick-prompt", "aria-hidden": "true" }, [
    glyph(doc, "up"),
    m["start.pickPrompt"],
  ]);
