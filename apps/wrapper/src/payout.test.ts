// The payout of a finished round (W-31, W-34): a `won` round shows the
// Snapshot's `payout.formatted`, labelled "Payout", and a `lost` round shows it
// only when `payout.value` is above 0, compared as a `bigint`. An absent
// `payout` shows nothing, and no error; no amount is ever computed from
// `currentMultiplier` or anything else. Over the `valid/` vectors that carry a
// payout, and one with none.

import { describe, expect, it } from "vitest";

import { allText, alertText, mount } from "./fixtures/app.ts";
import { snapshotVector, withFields } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { ShownAmount, SnapshotInput } from "./round-input.ts";
import { shownPayout } from "./round-view.ts";

const m = messagesFor("en").messages;

const rendered = (snapshot: SnapshotInput) => {
  const ui = mount();
  ui.app.accept({ kind: "snapshot", snapshot }, "poll");
  return ui;
};

/** Every number written in `text` (digits, with any separators). */
const numbersOf = (text: string): string[] => text.match(/\d[\d.,]*/gu) ?? [];

/** Every number shown in `element`, the control bar, but the round id's. */
const numbersIn = (element: Element | null): string[] => {
  const copy = element?.cloneNode(true) as HTMLElement | undefined;
  for (const id of copy?.querySelectorAll(".se-round-id") ?? []) id.remove();
  return numbersOf(copy?.textContent ?? "");
};

/** The `formatted` of every amount the Snapshot itself carries. */
const ownFormatted = (snapshot: SnapshotInput): string[] => [
  snapshot.bet.balance.formatted,
  snapshot.bet.minBet.formatted,
  snapshot.bet.maxBet.formatted,
  snapshot.bet.defaultBet.formatted,
  ...snapshot.bet.suggestedBets.map(amount => amount.formatted),
  ...(snapshot.payout === undefined ? [] : [snapshot.payout.formatted]),
];

/** The text of the field labelled "Payout", or `undefined`. */
const payoutField = (host: HTMLElement): string | undefined =>
  [...host.querySelectorAll(".se-field")]
    .find(
      field =>
        field.querySelector(".se-field__label")?.textContent ===
        m["label.payout"],
    )
    ?.querySelector(".se-field__value")?.textContent ?? undefined;

describe("the payout of a finished round (W-31)", () => {
  it.each([
    "coinflip-won-payout",
    "cashorcrash-won-cashout-payout",
    "cashorcrash-won-expired-payout",
    "book-playback-won-payout",
  ])("%s shows its payout as formatted", name => {
    const snapshot = snapshotVector(name);
    const ui = rendered(snapshot);
    expect(payoutField(ui.host)).toBe(snapshot.payout?.formatted);
    expect(alertText(ui.host)).toBe("");
  });

  it("shows a lost round's payout when it credits something", () => {
    const snapshot = snapshotVector("steps-lost-expired-payout");
    const ui = rendered(snapshot);
    expect(payoutField(ui.host)).toBe(snapshot.payout?.formatted);
    // With its time limit's line, as any expired round.
    expect(allText(ui.host)).toContain(m["detail.expired"]);
  });

  it("shows no payout on a lost round that credits 0", () => {
    const ui = rendered(snapshotVector("coinflip-lost-payout-zero"));
    expect(payoutField(ui.host)).toBeUndefined();
    expect(allText(ui.host)).not.toContain(m["label.payout"]);
  });

  it.each(["coinflip-won", "coinflip-lost", "cashorcrash-won-cashout"])(
    "%s carries no payout: none shows, and no error",
    name => {
      const ui = rendered(snapshotVector(name));
      expect(payoutField(ui.host)).toBeUndefined();
      expect(alertText(ui.host)).toBe("");
    },
  );

  it.each([
    "coinflip-won",
    "coinflip-won-payout",
    "cashorcrash-won-cashout",
    "cashorcrash-lost-row2",
    "steps-lost-expired-payout",
  ])(
    "%s shows no amount but the Snapshot's own formatted ones (W-34)",
    name => {
      const snapshot = snapshotVector(name);
      const ui = rendered(snapshot);
      const shown = numbersIn(ui.host.querySelector(".se-bar"));
      expect(shown.length).toBeGreaterThan(0);
      const own = new Set(
        ownFormatted(snapshot).flatMap(text => numbersOf(text)),
      );
      expect(shown.filter(number => !own.has(number))).toEqual([]);
    },
  );
});

/** The vector `name`'s own payout. */
const payoutOf = (name: string): ShownAmount => {
  const { payout } = snapshotVector(name);
  if (payout === undefined) throw new TypeError(`${name} carries no payout`);
  return payout;
};

describe("shownPayout", () => {
  const payout = payoutOf("coinflip-won-payout");

  it("compares the value as a bigint, beyond a JS number's range", () => {
    const lost = withFields(snapshotVector("coinflip-lost"), {
      payout: { ...payout, value: "9007199254740993" },
    });
    expect(shownPayout(lost)?.value).toBe("9007199254740993");
    const zero = withFields(snapshotVector("coinflip-lost"), {
      payout: { ...payout, value: "0" },
    });
    expect(shownPayout(zero)).toBeUndefined();
  });

  it.each([
    ["won", "coinflip-won-payout", "1.5"],
    ["won", "coinflip-won-payout", "-1"],
    ["lost", "coinflip-lost", "1.5"],
    ["lost", "coinflip-lost", "-1"],
  ])(
    "shows none on %s, with no throw, for a value that is not base units (%s, %s)",
    (_, name, value) => {
      const snapshot = withFields(snapshotVector(name), {
        payout: { ...payout, value },
      });
      expect(shownPayout(snapshot)).toBeUndefined();
      const ui = rendered(snapshot);
      expect(payoutField(ui.host)).toBeUndefined();
      expect(alertText(ui.host)).toBe("");
    },
  );

  it("shows none on any other status", () => {
    for (const name of [
      "coinflip-active",
      "coinflip-resolving",
      "coinflip-canceled",
    ]) {
      expect(
        shownPayout(withFields(snapshotVector(name), { payout })),
      ).toBeUndefined();
    }
  });
});
