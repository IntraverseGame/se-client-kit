// The round receipt (W-59, W-39, RFC-005; decided by the human, 2026-11-13):
// one compact chip at the end of the status line, after the status heading,
// with a 44 px hit area and a chevron, whose popover lists what the shell
// checked (fairness.ts decides which) and, once the round has ended, the full
// round id, its copy control, and the verify link. Its visible label is short
// ("Fairness", "Checking…", "Checked", "Not verified", "Recorded", and the
// shortened round id once the round has ended); its accessible name says it
// in full, with Q1's words ("Checked before play", ...). The popover opens in
// the top layer (popover.ts), is not a dialog, and traps no focus; Escape
// closes it and returns the focus to the chip. The chip's text change is not
// announced (the status line is, W-46). Colour never carries its meaning
// alone (W-47): its words do.

import type { BarMessageKey } from "./bar-messages.ts";
import type { Builder, Child } from "./dom.ts";
import type { ChipKind, ChipPlan } from "./fairness.ts";
import { glyph, type GlyphName } from "./icons.ts";
import type { Messages } from "./messages.ts";
import { type Popover, popover } from "./popover.ts";
import { receiptFoot, shortRoundId } from "./round-id-view.ts";
import type { ViewOptions } from "./view-options.ts";

type ChipWords = {
  /** Q1's words: the accessible name's and the popover heading's. */
  readonly text: BarMessageKey;
  /** The short visible label, before the round has ended. */
  readonly label: BarMessageKey;
  readonly glyph: GlyphName;
  /** Whether the label stays beside the round id once the round has ended. */
  readonly keeps: boolean;
};

const CHIP: Readonly<Record<ChipKind, ChipWords>> = {
  how: {
    text: "chip.how",
    label: "receipt.fairness",
    glyph: "shield",
    keeps: false,
  },
  checking: {
    text: "chip.checking",
    label: "receipt.checking",
    glyph: "shield",
    keeps: false,
  },
  checked: {
    text: "chip.checked",
    label: "receipt.checked",
    glyph: "shield-ok",
    keeps: false,
  },
  dev: {
    text: "chip.dev",
    label: "chip.dev",
    glyph: "shield-ok",
    keeps: false,
  },
  "not-verified": {
    text: "chip.notVerified",
    label: "chip.notVerified",
    glyph: "warning",
    keeps: true,
  },
  recorded: {
    text: "chip.recorded",
    label: "chip.recorded",
    glyph: "shield",
    keeps: false,
  },
};

/** The chip's visible label: short words, and the round id once ended. */
export const receiptLabel = (m: Messages, plan: ChipPlan): string => {
  const words = CHIP[plan.kind];
  if (plan.endedRoundId === undefined) return m[words.label];
  const id = shortRoundId(plan.endedRoundId);
  return words.keeps ? `${m[words.label]} ${id}` : id;
};

/** The chip's accessible name: the full meaning (Q1's words). */
export const receiptName = (m: Messages, plan: ChipPlan): string => {
  const words = m[CHIP[plan.kind].text];
  return plan.endedRoundId === undefined
    ? `${words}: ${m["chip.openLabel"]}`
    : `${words}, ${m["receipt.round"]} ${plan.endedRoundId}: ${m["receipt.openEnded"]}`;
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
      : [receiptFoot(el, m, plan.endedRoundId, options, announce)];
  const title = (key: BarMessageKey): HTMLElement =>
    el("h2", { class: "se-popover__title" }, [m[key]]);
  const para = (key: BarMessageKey): HTMLElement => el("p", {}, [m[key]]);
  switch (plan.kind) {
    case "how": {
      return plan.game === "book"
        ? [
            title("pop.how"),
            para("pop.howBook"),
            para("pop.howBookVerify"),
            ...foot,
          ]
        : [
            title("pop.how"),
            para("pop.howConfig"),
            list(el, [...CONFIG_CHECKS.map(key => m[key]), m["pop.checkTip"]]),
            para("pop.howKey"),
            ...foot,
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
    class: "se-chip se-receipt",
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
      button.dataset["ended"] = String(plan.endedRoundId !== undefined);
      button.setAttribute("aria-label", receiptName(m, plan));
      button.replaceChildren(
        glyph(doc, chip.glyph),
        el("span", { class: "se-receipt__label" }, [receiptLabel(m, plan)]),
        glyph(doc, "chevron"),
      );
      pop.refresh();
    },
  });
};
