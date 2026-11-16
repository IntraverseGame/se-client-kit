// T-29, the bet stepper (W-31, RFC-005 section 2): the same options W-31
// offers, in ascending order, preset to `defaultBet`; minus disabled at the
// lowest option, plus and MAX stopping at the highest affordable one (Q8); an
// option above the balance on the rail but never chosen; the keys and the
// wheel; `aria-valuenow` as the option's index, never the amount (W-34);
// disabled while a start is in flight; the choice kept across reads of the
// same options. Amounts are the vectors' own `formatted`.

import { describe, expect, it } from "vitest";

import { betChoice } from "./bet-options.ts";
import { ascending } from "./bet-stepper.ts";
import { buttonNamed, mount, type Mounted } from "./fixtures/app.ts";
import { snapshotVector, withFields } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { ShownAmount, SnapshotInput } from "./round-input.ts";

const m = messagesFor("en").messages;
const IDLE = snapshotVector("coinflip-idle");

/** `IDLE` with its balance at `value` base units. */
const withBalance = (value: string): SnapshotInput =>
  withFields(IDLE, {
    bet: { ...IDLE.bet, balance: { ...IDLE.bet.balance, value } },
  });

type Stepper = Mounted & { readonly started: ShownAmount[] };

const stepper = (snapshot: SnapshotInput = IDLE): Stepper => {
  const ui = mount();
  const started: ShownAmount[] = [];
  ui.app.connect({
    readSnapshot: () => new Promise(() => {}),
    intents: { start: bet => started.push(bet) },
  });
  ui.app.accept({ kind: "snapshot", snapshot }, "poll");
  return { ...ui, started };
};

const field = (host: HTMLElement): HTMLElement => {
  const element = host.querySelector<HTMLElement>('[role="spinbutton"]');
  if (element === null) throw new Error("no stepper");
  return element;
};

const control = (host: HTMLElement, key: string): HTMLButtonElement => {
  const element = host.querySelector<HTMLButtonElement>(
    `[data-focus-key="${key}"]`,
  );
  if (element === null) throw new Error(`no ${key}`);
  return element;
};

const press = (host: HTMLElement, key: string): void => {
  field(host).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
};

/** The options in the order the stepper shows them. */
const ORDER = ascending(betChoice(IDLE.bet)).options.map(
  option => option.amount,
);

/** Orders `bigint`s ascending. */
const byValue = (a: bigint, b: bigint): number => (a < b ? -1 : Number(a > b));

/** The second option, ascending. */
const SECOND: ShownAmount = (() => {
  const amount = ORDER[1];
  if (amount === undefined) throw new Error("fewer than two options");
  return amount;
})();

const shown = (host: HTMLElement) => ({
  now: field(host).getAttribute("aria-valuenow"),
  text: field(host).getAttribute("aria-valuetext"),
});

describe("the bet stepper (T-29, W-31)", () => {
  it("steps through W-31's options in ascending order, never between two", () => {
    const ui = stepper();
    const values = ORDER.map(amount => BigInt(amount.value));
    expect(values).toEqual(values.toSorted(byValue));
    expect(ui.host.querySelectorAll(".se-rail__mark")).toHaveLength(
      ORDER.length,
    );
    const seen = [shown(ui.host).text];
    for (const _ of ORDER.slice(1)) {
      control(ui.host, "bet-plus").click();
      seen.push(shown(ui.host).text);
    }
    expect(seen).toEqual(ORDER.map(amount => amount.formatted));
  });

  it("gives the index as aria-valuenow and the formatted amount as aria-valuetext (W-34)", () => {
    const ui = stepper();
    control(ui.host, "bet-plus").click();
    expect(shown(ui.host)).toEqual({ now: "1", text: ORDER[1]?.formatted });
    expect(field(ui.host).getAttribute("aria-valuemin")).toBe("0");
    expect(field(ui.host).getAttribute("aria-label")).toBe(m["label.bet"]);
  });

  it("disables minus and MIN at the lowest option, plus and MAX at the highest", () => {
    const ui = stepper();
    expect(control(ui.host, "bet-minus").disabled).toBe(true);
    expect(control(ui.host, "bet.min").disabled).toBe(true);
    control(ui.host, "bet.max").click();
    expect(shown(ui.host).now).toBe(String(ORDER.length - 1));
    expect(control(ui.host, "bet-plus").disabled).toBe(true);
    expect(control(ui.host, "bet.max").disabled).toBe(true);
    control(ui.host, "bet.min").click();
    expect(shown(ui.host).now).toBe("0");
  });

  it("stops plus and MAX at the highest affordable option (Q8), showing the rest on the rail", () => {
    const ui = stepper(withBalance(SECOND.value));
    control(ui.host, "bet.max").click();
    expect(shown(ui.host).now).toBe("1");
    expect(control(ui.host, "bet-plus").disabled).toBe(true);
    expect(field(ui.host).getAttribute("aria-valuemax")).toBe("1");
    expect(ui.host.querySelectorAll(".se-rail__mark--off")).toHaveLength(
      ORDER.length - 2,
    );
  });

  it("steps with the arrow keys, Page Up and Page Down, Home, and End", () => {
    const ui = stepper();
    press(ui.host, "ArrowUp");
    expect(shown(ui.host).now).toBe("1");
    press(ui.host, "ArrowDown");
    expect(shown(ui.host).now).toBe("0");
    press(ui.host, "End");
    expect(shown(ui.host).now).toBe(String(ORDER.length - 1));
    press(ui.host, "Home");
    expect(shown(ui.host).now).toBe("0");
    press(ui.host, "PageUp");
    expect(shown(ui.host).now).toBe(String(Math.min(3, ORDER.length - 1)));
    press(ui.host, "PageDown");
    expect(shown(ui.host).now).toBe("0");
  });

  it("steps with the mouse wheel", () => {
    const ui = stepper();
    field(ui.host).dispatchEvent(
      new WheelEvent("wheel", { deltaY: -1, cancelable: true }),
    );
    expect(shown(ui.host).now).toBe("1");
    field(ui.host).dispatchEvent(
      new WheelEvent("wheel", { deltaY: 1, cancelable: true }),
    );
    expect(shown(ui.host).now).toBe("0");
  });

  it("starts with the chosen option's own Amount", () => {
    const ui = stepper();
    control(ui.host, "bet-plus").click();
    buttonNamed(ui.host, m["action.placeBet"])?.click();
    expect(ui.started).toEqual([ORDER[1]]);
  });

  it("keeps the choice across a read of the same options", () => {
    const ui = stepper();
    control(ui.host, "bet-plus").click();
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: withFields(IDLE, { version: IDLE.version + 1 }),
      },
      "poll",
    );
    expect(shown(ui.host).now).toBe("1");
  });

  it("is disabled while a start is in flight, and the start control busy", () => {
    const ui = stepper();
    ui.app.callInFlight(true);
    expect(field(ui.host).getAttribute("aria-disabled")).toBe("true");
    expect(control(ui.host, "bet-plus").disabled).toBe(true);
    press(ui.host, "ArrowUp");
    expect(shown(ui.host).now).toBe("0");
    const start = control(ui.host, "start");
    expect(start.getAttribute("aria-busy")).toBe("true");
    start.click();
    expect(ui.started).toEqual([]);
  });

  it("rolls the shown amount, never an amount between two options", () => {
    const ui = stepper();
    control(ui.host, "bet-plus").click();
    const rolled = ui.host.querySelector(".se-stepper__value span");
    expect(rolled?.className).toBe("se-roll-up");
    expect(rolled?.textContent).toBe(ORDER[1]?.formatted);
  });
});
