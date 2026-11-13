// The fairness chip's view (W-59, RFC-005 section 3): a button at the start of
// the status slot, with a 44 px hit area, whose popover lists what the shell
// checked (fairness.ts decides which). The popover is not a dialog and traps no
// focus; Escape closes it and returns the focus to the chip (popover.ts). The
// chip's text change is not announced (the status line is, W-46). The round
// id, its copy control, and the verify link show in it only once the round has
// ended (W-39). Colour never carries the chip's meaning alone (W-47): its
// words do.

import type { BarMessageKey } from "./bar-messages.ts";
import type { Builder, Child } from "./dom.ts";
import type { ChipKind, ChipPlan } from "./fairness.ts";
import { glyph, type GlyphName } from "./icons.ts";
import type { Messages } from "./messages.ts";
import { type Popover, popover } from "./popover.ts";
import { roundIdAndVerify } from "./round-id-view.ts";
import type { ViewOptions } from "./view-options.ts";

const CHIP: Readonly<
  Record<ChipKind, { readonly text: BarMessageKey; readonly glyph: GlyphName }>
> = {
  how: { text: "chip.how", glyph: "shield" },
  checking: { text: "chip.checking", glyph: "shield" },
  checked: { text: "chip.checked", glyph: "shield-ok" },
  dev: { text: "chip.dev", glyph: "shield-ok" },
  "not-verified": { text: "chip.notVerified", glyph: "shield-off" },
  recorded: { text: "chip.recorded", glyph: "shield" },
};

/** Checks 1 to 4 of W-26 in full, then check 5 and the tip check (W-26b). */
const CONFIG_CHECKS: readonly BarMessageKey[] = [
  "pop.checkRound",
  "pop.checkKey",
  "pop.checkBet",
  "pop.checkSecret",
  "pop.checkChain",
  "pop.checkTarget",
  "pop.checkSigner",
  "pop.checkReady",
];

/** What W-26's checks do not cover (RFC-005 section 3). */
const NOT_COVERED: readonly BarMessageKey[] = [
  "pop.notReady",
  "pop.notOnChain",
  "pop.notTerms",
  "pop.notExpiry",
  "pop.notOutcome",
];

/** The player label of a failure's machine code (W-48). */
export const failureText = (m: Messages, plan: ChipPlan): readonly string[] => {
  const failure =
    plan.failure === undefined
      ? m["fail.unknown"]
      : m[`fail.${plan.failure}` as const];
  return plan.tipFailure === undefined
    ? [failure]
    : [failure, m[`tip.${plan.tipFailure}` as const]];
};

export type ChipContext = {
  readonly el: Builder;
  readonly doc: Document;
  readonly m: Messages;
  readonly options: ViewOptions;
  readonly announce: (text: string) => void;
};

const list = (
  el: Builder,
  items: readonly string[],
  mark?: string,
): HTMLElement =>
  el(
    "ul",
    { class: "se-checks" },
    items.map(item =>
      el("li", {}, [
        item,
        mark !== undefined &&
          el("span", { class: "se-checks__mark" }, [` (${mark})`]),
      ]),
    ),
  );

/** The popover's content for a plan. */
export const chipContent = (
  context: ChipContext,
  plan: ChipPlan,
): readonly Child[] => {
  const { el, m, options, announce } = context;
  const foot =
    plan.endedRoundId === undefined
      ? []
      : [
          el(
            "div",
            { class: "se-popover__foot" },
            roundIdAndVerify(el, m, plan.endedRoundId, options, announce),
          ),
        ];
  const title = (key: BarMessageKey): HTMLElement =>
    el("h2", { class: "se-popover__title" }, [m[key]]);
  const para = (key: BarMessageKey): HTMLElement => el("p", {}, [m[key]]);
  switch (plan.kind) {
    case "how": {
      return plan.game === "book"
        ? [title("pop.how"), para("pop.howBook"), para("pop.howBookVerify")]
        : [
            title("pop.how"),
            para("pop.howConfig"),
            list(el, [...CONFIG_CHECKS.map(key => m[key]), m["pop.checkTip"]]),
            para("pop.howKey"),
          ];
    }
    case "checking":
    case "checked":
    case "dev": {
      const done = plan.kind !== "checking";
      return [
        title(done ? "pop.checked" : "pop.checking"),
        list(
          el,
          [
            ...CONFIG_CHECKS.map(key => m[key]),
            m[plan.kind === "dev" ? "pop.checkTipDev" : "pop.checkTip"],
          ],
          m[done ? "pop.passed" : "pop.pending"],
        ),
        el("h3", { class: "se-popover__title" }, [m["pop.notCovered"]]),
        list(
          el,
          NOT_COVERED.map(key => m[key]),
        ),
        ...foot,
      ];
    }
    case "not-verified": {
      return [
        title(plan.chainUnverified === true ? "pop.failedChain" : "pop.failed"),
        el("h3", { class: "se-popover__title" }, [m["pop.failedBy"]]),
        list(el, failureText(m, plan)),
        ...foot,
      ];
    }
    default: {
      return [
        title("pop.recorded"),
        para("pop.recordedRecord"),
        para("pop.recordedDraw"),
        ...foot,
      ];
    }
  }
};

export type ChipView = {
  readonly element: HTMLElement;
  /** Shows the plan; the chip is hidden when there is none. */
  readonly show: (plan: ChipPlan | undefined, context: ChipContext) => void;
};

/** The chip, built once and kept, so an open popover survives an update. */
export const createChipView = (el: Builder, doc: Document): ChipView => {
  let shown: { plan: ChipPlan; context: ChipContext } | undefined;
  let signature = "";
  const button = el("button", {
    type: "button",
    class: "se-chip",
    "data-focus-key": "chip",
  });
  const pop: Popover = popover(el, doc, {
    className: "se-chip-anchor",
    button,
    content: () =>
      shown === undefined ? [] : chipContent(shown.context, shown.plan),
  });
  return Object.freeze({
    element: pop.element,
    show: (plan, context): void => {
      pop.element.hidden = plan === undefined;
      if (plan === undefined) {
        // Nothing of the round stays in the page (a final state, W-44).
        shown = undefined;
        signature = "";
        pop.close();
        pop.refresh();
        return;
      }
      shown = { plan, context };
      const next = JSON.stringify(plan);
      if (next === signature) return;
      signature = next;
      const { m } = context;
      const chip = CHIP[plan.kind];
      button.dataset["kind"] = plan.kind;
      button.setAttribute(
        "aria-label",
        `${m[chip.text]}: ${m["chip.openLabel"]}`,
      );
      button.replaceChildren(
        glyph(doc, chip.glyph),
        el("span", {}, [m[chip.text]]),
      );
      pop.refresh();
    },
  });
};
