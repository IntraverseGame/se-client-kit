// The cash-out value of an `active` round on the bar's cash-out control (W-31,
// W-34, W-57): when the Snapshot carries `cashOutValue`, the control reads
// "Cash out" with its `formatted` beside the label, in place of the multiplier;
// without it the control reads "Cash out" with the multiplier as a display
// value, as before. The round line's multiplier is the same either way, the
// frame stays playable, and no amount is ever computed from `currentMultiplier`
// or anything else; a value that is not base units shows nothing, with no
// error. Over the vendored Cash or Crash round played to a cash-out: its
// `active` Snapshot after the first pick, given the amount its cash-out then
// credited (the `payout` of the same round's `won` Snapshot, which is what the
// backend's `cashOutValue` vectors carry for that step), and every `active`
// vector as it is.

import { describe, expect, it } from "vitest";

import { alertText, mount } from "./fixtures/app.ts";
import { HELD, type Screen, shownOf } from "./fixtures/screen.ts";
import {
  SNAPSHOT_VECTORS,
  snapshotVector,
  withFields,
} from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import { formatMultiplier, shownCashOutValue } from "./round-amounts.ts";
import type { RoundCheck, ShownAmount, SnapshotInput } from "./round-input.ts";

const m = messagesFor("en").messages;

/** The shell holds the round, verified, and offers the cash-out (W-24). */
const OFFERED: RoundCheck = { ...HELD, cashOutOffered: true };

/**
 * The screen showing `snapshot` with the cash-out offered, its intent wired and
 * counted, and a game frame in place, as the session mounts it.
 */
const rendered = (
  snapshot: SnapshotInput,
): Screen & { readonly cashOuts: () => number } => {
  const ui = mount();
  let cashOuts = 0;
  ui.app.connect({
    readSnapshot: () =>
      Promise.resolve({ kind: "snapshot", snapshot, check: OFFERED }),
    intents: {
      cashOut: () => {
        cashOuts += 1;
      },
    },
  });
  const frame = globalThis.document.createElement("iframe");
  frame.toggleAttribute("inert", true);
  ui.app.gameHost().append(frame);
  ui.app.accept({ kind: "snapshot", snapshot, check: OFFERED }, "poll");
  return { ...ui, frame, cashOuts: () => cashOuts };
};

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/** The bar's cash-out control, by its focus key. */
const cashOutControl = (host: HTMLElement): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(
    '.se-controls button[data-focus-key="cash-out"]',
  );

/** The display value beside the control's label, or `undefined`. */
const valueShown = (host: HTMLElement): string | undefined => {
  const value = cashOutControl(host)?.querySelector(".se-button__value");
  return value === null || value === undefined ? undefined : text(value);
};

/** Every number written in `text` (digits, with any separators). */
const numbersOf = (value: string): string[] => value.match(/\d[\d.,]*/gu) ?? [];

/**
 * The `formatted` of every amount the Snapshot itself carries, and its
 * multiplier as the bar formats it.
 */
const ownNumbers = (snapshot: SnapshotInput): Set<string> =>
  new Set(
    [
      snapshot.bet.balance.formatted,
      snapshot.bet.minBet.formatted,
      snapshot.bet.maxBet.formatted,
      snapshot.bet.defaultBet.formatted,
      ...snapshot.bet.suggestedBets.map(amount => amount.formatted),
      ...(snapshot.cashOutValue === undefined
        ? []
        : [snapshot.cashOutValue.formatted]),
      ...(snapshot.currentMultiplier === undefined
        ? []
        : [formatMultiplier("en", snapshot.currentMultiplier)]),
    ].flatMap(value => numbersOf(value)),
  );

/**
 * The vendored Cash or Crash round played to a cash-out, `active` after its
 * first pick.
 */
const ACTIVE_STEP_1 = "cashorcrash-cash-out-active-step1";

/**
 * The same round `won` by the cash-out: its `payout` is what that cash-out
 * credited.
 */
const WON = "cashorcrash-cash-out-won";

/**
 * The backend's vector of the same round's step 1 with `cashOutValue`: absent
 * until the contracts sync lands, then its value equals `payoutOf(WON)`
 * ("agrees with the close").
 */
const VENDORED_QUOTE = "cashorcrash-active-cash-out-value";

/** The vector `name`'s own payout. */
const payoutOf = (name: string): ShownAmount => {
  const { payout } = snapshotVector(name);
  if (payout === undefined) throw new TypeError(`${name} carries no payout`);
  return payout;
};

const cashOutValue = payoutOf(WON);

/** An amount of 0, as a vector formats it (`coinflip-lost-payout-zero`). */
const zero = payoutOf("coinflip-lost-payout-zero");

/** The `active` Snapshot with the value its cash-out then credited. */
const quoted = (): SnapshotInput =>
  withFields(snapshotVector(ACTIVE_STEP_1), { cashOutValue });

/** The multiplier the control shows when the Snapshot carries no value. */
const multiplierOf = (snapshot: SnapshotInput): string | undefined =>
  snapshot.currentMultiplier === undefined
    ? undefined
    : formatMultiplier("en", snapshot.currentMultiplier);

/**
 * Every `active` vector: the synced `cashorcrash-active-cash-out-value*` carry
 * a value, the others none.
 */
const ACTIVE_VECTORS = SNAPSHOT_VECTORS.filter(
  name => snapshotVector(name).status === "active",
);

/**
 * The vendored quote vector, once synced: an empty list before the contracts
 * sync, so the test over it is vacuous until then; once
 * `valid/cashorcrash-active-cash-out-value` is vendored, the list is that
 * vector and the test holds it to the close's payout.
 */
const VENDORED_QUOTES = SNAPSHOT_VECTORS.filter(
  name => name === VENDORED_QUOTE,
);

/**
 * The W-34 cases: the quoted step-1 Snapshot and every `active` vector as it
 * is.
 */
const OWN_NUMBER_CASES: readonly (readonly [string, SnapshotInput])[] = [
  [`${ACTIVE_STEP_1} with the quote`, quoted()],
  ...ACTIVE_VECTORS.map(name => [name, snapshotVector(name)] as const),
];

/** What the control shows beside its label for `snapshot` (W-31, W-57). */
const expectedValue = (snapshot: SnapshotInput): string | undefined =>
  snapshot.cashOutValue?.formatted ?? multiplierOf(snapshot);

/** The control's whole text for `snapshot`: its label and the value beside it. */
const controlText = (snapshot: SnapshotInput): string =>
  [m["action.cashOut"], expectedValue(snapshot)]
    .filter(part => part !== undefined)
    .join(" ");

describe("the cash-out value on the control (W-31, W-57)", () => {
  it("takes the value from the same round's close", () => {
    expect(snapshotVector(ACTIVE_STEP_1).roundId).toBe(
      snapshotVector(WON).roundId,
    );
    expect(snapshotVector(ACTIVE_STEP_1).cashOutValue).toBeUndefined();
  });

  it("the vendored quote vector, once synced, carries the close's payout", () => {
    // Vacuous before the contracts sync (`VENDORED_QUOTES` is empty then).
    for (const name of VENDORED_QUOTES) {
      const vendored = snapshotVector(name);
      expect(vendored.roundId).toBe(snapshotVector(WON).roundId);
      expect(vendored.cashOutValue).toEqual(cashOutValue);
    }
  });

  it("shows the value's formatted beside Cash out, and sends the cash-out on request", () => {
    const screen = rendered(quoted());
    const control = cashOutControl(screen.host);
    expect(text(control)).toBe(
      `${m["action.cashOut"]} ${cashOutValue.formatted}`,
    );
    expect(valueShown(screen.host)).toBe(cashOutValue.formatted);
    expect(control?.disabled).toBe(false);
    expect(alertText(screen.host)).toBe("");
    control?.click();
    expect(screen.cashOuts()).toBe(1);
  });

  it("shows a value of 0 as served, not the multiplier", () => {
    const snapshot = withFields(snapshotVector(ACTIVE_STEP_1), {
      cashOutValue: zero,
    });
    const screen = rendered(snapshot);
    expect(zero.value).toBe("0");
    expect(valueShown(screen.host)).toBe(zero.formatted);
    expect(valueShown(screen.host)).not.toBe(multiplierOf(snapshot));
    expect(alertText(screen.host)).toBe("");
  });

  it("keeps the round line's multiplier and the playable frame beside it", () => {
    const screen = rendered(quoted());
    const shown = shownOf(screen);
    expect(shown).toMatchObject({
      playable: true,
      overlay: "none",
      status: m["status.active"],
      controls: [m["action.cashOut"]],
    });
    expect(shown.roundLine).toContain(m["label.multiplier"]);
    expect(shown.roundLine).toContain(multiplierOf(quoted()));
  });

  it("reads Cash out with the multiplier when the Snapshot carries no value", () => {
    const snapshot = snapshotVector(ACTIVE_STEP_1);
    const screen = rendered(snapshot);
    expect(multiplierOf(snapshot)).toBeDefined();
    expect(text(cashOutControl(screen.host))).toBe(controlText(snapshot));
    expect(valueShown(screen.host)).toBe(multiplierOf(snapshot));
    expect(text(cashOutControl(screen.host))).not.toContain(
      cashOutValue.formatted,
    );
    expect(alertText(screen.host)).toBe("");
  });

  it("finds the vendored active vectors", () => {
    expect(ACTIVE_VECTORS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(ACTIVE_VECTORS)("%s shows exactly the value it carries", name => {
    const snapshot = snapshotVector(name);
    const screen = rendered(snapshot);
    expect(shownOf(screen).controls).toEqual([m["action.cashOut"]]);
    expect(valueShown(screen.host)).toBe(expectedValue(snapshot));
  });

  it.each(OWN_NUMBER_CASES)(
    "%s shows no number but the Snapshot's own ones (W-34)",
    (_, snapshot) => {
      const screen = rendered(snapshot);
      const shown = numbersOf(text(screen.host.querySelector(".se-bar")));
      expect(shown.length).toBeGreaterThan(0);
      const own = ownNumbers(snapshot);
      expect(shown.filter(number => !own.has(number))).toEqual([]);
    },
  );
});

describe("shownCashOutValue", () => {
  it("compares nothing, and keeps a value beyond a JS number's range", () => {
    const snapshot = withFields(snapshotVector(ACTIVE_STEP_1), {
      cashOutValue: { ...cashOutValue, value: "9007199254740993" },
    });
    expect(shownCashOutValue(snapshot)?.value).toBe("9007199254740993");
    expect(shownCashOutValue(quoted())).toBe(cashOutValue);
  });

  it.each(["1.5", "-1", ""])(
    "shows the multiplier, with no throw, for a value that is not base units (%s)",
    value => {
      const snapshot = withFields(snapshotVector(ACTIVE_STEP_1), {
        cashOutValue: { ...cashOutValue, value },
      });
      expect(shownCashOutValue(snapshot)).toBeUndefined();
      const screen = rendered(snapshot);
      expect(valueShown(screen.host)).toBe(multiplierOf(snapshot));
      expect(alertText(screen.host)).toBe("");
    },
  );

  it.each([
    "coinflip-idle",
    "coinflip-starting",
    "coinflip-resolving",
    "coinflip-canceled",
    WON,
    "cashorcrash-lost-row2",
  ])("shows none on %s, whatever the Snapshot carries", name => {
    expect(
      shownCashOutValue(withFields(snapshotVector(name), { cashOutValue })),
    ).toBeUndefined();
  });
});
