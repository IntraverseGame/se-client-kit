// The bet stepper (W-31, RFC-005 section 2): a minus control, the bet field, a
// plus control, and MIN and MAX beside it, over the same options W-31 offers
// (bet-options.ts: the Snapshot's `suggestedBets` within `minBet` and
// `maxBet`, the `defaultBet` preset), in ascending order. It never invents a
// value between two options; every comparison is a `bigint` comparison of
// `Amount.value` (W-34). An option above the balance shows on the rail but
// cannot be chosen: plus and MAX stop at the highest affordable option (Q8).
// The field is a `spinbutton` whose `aria-valuenow` is the option's index in
// the list, never the amount as a number (W-34), and whose `aria-valuetext`
// is its `formatted`. A change rolls the shown `formatted` (no interpolated
// amount, W-34, W-48; still under reduced motion). While a start is in flight
// or a run of autoplay goes, the stepper is disabled.

import { type BetChoice, betChoice, compareAmounts } from "./bet-options.ts";
import type { Builder } from "./dom.ts";
import { glyph } from "./icons.ts";
import type { Messages } from "./messages.ts";
import type { ShownAmount, SnapshotInput } from "./round-input.ts";

/** The options in ascending order, and the index the player chose. */
export type BetModel = {
  /** Takes a Snapshot's options; the choice is kept while they are the same. */
  readonly sync: (bet: SnapshotInput["bet"]) => BetChoice;
  readonly choice: () => BetChoice;
  /** Moves the choice to `index`, within the affordable options. */
  readonly choose: (index: number) => void;
  readonly selected: () => ShownAmount | undefined;
  /** The one stepper shown follows the choice (a later one replaces it). */
  readonly onChange: (listener: () => void) => void;
};

/** `choice` with its options in ascending order, its preset moved with them. */
export const ascending = (choice: BetChoice): BetChoice => {
  const order = choice.options
    .map((option, index) => ({ option, index }))
    .toSorted((a, b) => compareAmounts(a.option.amount, b.option.amount) ?? 0);
  const selected = order.findIndex(entry => entry.index === choice.selected);
  return {
    options: order.map(entry => entry.option),
    selected: selected === -1 ? undefined : selected,
  };
};

/** The highest option the player may choose, if any. */
export const highestAffordable = (choice: BetChoice): number | undefined => {
  const last = choice.options.findLastIndex(option => option.affordable);
  return last === -1 ? undefined : last;
};

export const createBetModel = (): BetModel => {
  let choice: BetChoice = { options: [], selected: undefined };
  let key = "";
  let listener: (() => void) | undefined;
  const choose = (index: number): void => {
    const high = highestAffordable(choice);
    if (high === undefined || choice.selected === undefined) return;
    const next = Math.min(Math.max(index, 0), high);
    if (next === choice.selected || choice.options[next]?.affordable !== true) {
      return;
    }
    choice = { ...choice, selected: next };
    listener?.();
  };
  return Object.freeze({
    sync: (bet: SnapshotInput["bet"]): BetChoice => {
      const fresh = ascending(betChoice(bet));
      // Keyed on the fields the UI reads only (never `normalized`, W-34).
      const next = JSON.stringify(
        fresh.options.map(({ amount, affordable }) => [
          amount.value,
          amount.unit,
          amount.decimals,
          amount.formatted,
          affordable,
        ]),
      );
      if (next === key) {
        // The same options: the choice stays, unless it is no longer affordable.
        const kept = choice.selected;
        choice = {
          options: fresh.options,
          selected:
            kept !== undefined && fresh.options[kept]?.affordable === true
              ? kept
              : fresh.selected,
        };
      } else {
        key = next;
        choice = fresh;
      }
      return choice;
    },
    choice: (): BetChoice => choice,
    choose,
    selected: (): ShownAmount | undefined =>
      choice.selected === undefined
        ? undefined
        : choice.options[choice.selected]?.amount,
    onChange: (next: () => void): void => {
      listener = next;
    },
  });
};

/** How far Page Up and Page Down move. */
const PAGE = 3;

/** The step a key asks for, from `at` in a list ending at `high`. */
const keyTarget = (
  key: string,
  at: number,
  high: number,
): number | undefined => {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight": {
      return at + 1;
    }
    case "ArrowDown":
    case "ArrowLeft": {
      return at - 1;
    }
    case "PageUp": {
      return at + PAGE;
    }
    case "PageDown": {
      return at - PAGE;
    }
    case "Home": {
      return 0;
    }
    case "End": {
      return high;
    }
    default: {
      return undefined;
    }
  }
};

const stepButton = (
  el: Builder,
  doc: Document,
  label: string,
  name: "minus" | "plus",
  onClick: () => void,
): HTMLButtonElement => {
  const control = el("button", {
    type: "button",
    class: "se-stepper__step",
    "aria-label": label,
    "data-focus-key": `bet-${name}`,
  });
  control.append(glyph(doc, name));
  control.addEventListener("click", onClick);
  return control;
};

/**
 * The stepper over `model`'s choice, disabled while `busy`. It updates itself
 * in place when the choice moves, so the focus stays on the control used.
 */
export const betStepper = (
  el: Builder,
  doc: Document,
  m: Messages,
  model: BetModel,
  busy: boolean,
): HTMLElement => {
  const value = el("span", { class: "se-stepper__value" });
  const rail = el("span", { class: "se-rail", "aria-hidden": "true" });
  const field = el(
    "div",
    {
      class: "se-stepper__field",
      role: "spinbutton",
      tabindex: "0",
      "aria-label": m["label.bet"],
      "data-focus-key": "bet-field",
    },
    [
      el("span", { class: "se-label", "aria-hidden": "true" }, [
        m["label.bet"],
      ]),
      value,
      rail,
    ],
  );
  const by = (delta: number) => (): void => {
    const at = model.choice().selected;
    if (!busy && at !== undefined) model.choose(at + delta);
  };
  const minus = stepButton(el, doc, m["bet.lower"], "minus", by(-1));
  const plus = stepButton(el, doc, m["bet.raise"], "plus", by(1));
  const quick = (
    text: "bet.min" | "bet.max",
    label: "bet.minLabel" | "bet.maxLabel",
    to: () => number,
  ): HTMLButtonElement => {
    const control = el(
      "button",
      {
        type: "button",
        class: "se-quick",
        "aria-label": m[label],
        "data-focus-key": text,
      },
      [m[text]],
    );
    control.addEventListener("click", () => {
      if (!busy) model.choose(to());
    });
    return control;
  };
  const min = quick("bet.min", "bet.minLabel", () => 0);
  const max = quick(
    "bet.max",
    "bet.maxLabel",
    () => highestAffordable(model.choice()) ?? 0,
  );
  let shownIndex: number | undefined;

  const render = (): void => {
    const choice = model.choice();
    const at = choice.selected;
    const high = highestAffordable(choice);
    const disabled = busy || at === undefined || high === undefined;
    // With no option the balance covers, the lowest shows, disabled.
    const index = at ?? 0;
    const amount = choice.options[index]?.amount;
    if (amount !== undefined && index !== shownIndex) {
      const roll =
        shownIndex === undefined
          ? undefined
          : index > shownIndex
            ? "se-roll-up"
            : "se-roll-down";
      value.replaceChildren(
        el("span", roll === undefined ? {} : { class: roll }, [
          amount.formatted,
        ]),
      );
      shownIndex = index;
    }
    field.setAttribute("aria-valuemin", "0");
    field.setAttribute("aria-valuemax", String(high ?? 0));
    field.setAttribute("aria-valuenow", String(index));
    if (amount === undefined) {
      field.removeAttribute("aria-valuetext");
    } else {
      field.setAttribute("aria-valuetext", amount.formatted);
    }
    field.setAttribute("aria-disabled", String(disabled));
    minus.disabled = disabled || at === 0;
    plus.disabled = disabled || at === high;
    min.disabled = disabled || at === 0;
    max.disabled = disabled || at === high;
    rail.replaceChildren(
      ...choice.options.map((option, mark) =>
        el("i", {
          class: [
            "se-rail__mark",
            mark === at ? "se-rail__mark--on" : "",
            at !== undefined && mark < at ? "se-rail__mark--past" : "",
            option.affordable ? "" : "se-rail__mark--off",
          ]
            .filter(name => name !== "")
            .join(" "),
        }),
      ),
    );
  };

  field.addEventListener("keydown", event => {
    const at = model.choice().selected;
    const high = highestAffordable(model.choice());
    if (busy || at === undefined || high === undefined) return;
    const target = keyTarget(event.key, at, high);
    if (target === undefined) return;
    event.preventDefault();
    model.choose(target);
  });
  field.addEventListener(
    "wheel",
    event => {
      const at = model.choice().selected;
      if (busy || at === undefined || event.deltaY === 0) return;
      event.preventDefault();
      model.choose(at + (event.deltaY < 0 ? 1 : -1));
    },
    { passive: false },
  );
  model.onChange(render);
  render();
  return el("div", { class: "se-bet" }, [
    el("div", { class: "se-stepper" }, [minus, field, plus]),
    el("div", { class: "se-quick-group" }, [min, max]),
  ]);
};
