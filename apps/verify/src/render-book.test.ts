// @vitest-environment jsdom
// VT-4 for a book round (V-8's book reason, V-13, V-20): the heading and text
// of V-8's book reason with no control, the result and the payout labelled as
// the verify API's and never as established, the kind of round named without
// a game, the checks that do not apply labelled so, check 8's two rows
// labelled as the API's, and the book's values shown as not checked, a field
// the body does not carry as "not reported", the multiplier as a decimal.

import { describe, expect, it } from "vitest";

import type { CheckResult } from "./check-result.ts";
import { bookEvidence, checks, HASH, report } from "./fixtures/page.ts";
import { mount } from "./fixtures/render.ts";
import { MESSAGES as M } from "./messages.ts";
import { formatMultiplierMilli } from "./not-checked-view.ts";

const AS = `(${M["round.asReported"]})`;

const bookReport = (
  overrides: Parameters<typeof bookEvidence>[0] = {},
  replace: readonly CheckResult[] = [],
) =>
  report(
    { kind: "not-recomputable", reason: "book-draw" },
    { evidence: bookEvidence(overrides), checks: checks(...replace) },
  );

describe("V-8's book reason (V-20)", () => {
  it("says the draw was not recomputed, and offers no retry", () => {
    const ui = mount();
    ui.show({ kind: "report", report: bookReport() });
    expect(ui.heading()).toContain(M["bookDraw.heading"]);
    expect(ui.text()).toContain(M["bookDraw.text"]);
    expect(ui.controls()).toEqual([]);
    expect(ui.alert()).toBe("");
  });

  it("names the kind of round and its mode, not a game", () => {
    const ui = mount();
    ui.show({ kind: "report", report: bookReport() });
    expect(ui.text()).toContain(
      `${M["round.shape"]}${M["round.shapeBook"]} base`,
    );
    expect(ui.text()).not.toContain(M["round.shapeOneStep"]);
  });

  it.each(["won", "lost"] as const)(
    "shows a %s result and the payout as the verify API reports them",
    status => {
      const ui = mount();
      ui.show({ kind: "report", report: bookReport({ status }) });
      expect(ui.text()).toContain(
        `${M["round.result"]} ${AS}${M[`result.${status}`]}`,
      );
      expect(ui.text()).toContain(`${M["round.payout"]} ${AS}2 EUR`);
      // Never as an established result.
      expect(ui.text()).not.toContain(`${M["round.result"]}${M["result.won"]}`);
      expect(ui.text()).not.toContain(`${M["check.notChecked"]})`);
    },
  );

  it("shows no result for a book round's mismatch (V-7)", () => {
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "mismatch", failed: [8] },
        { evidence: bookEvidence() },
      ),
    });
    expect(ui.text()).not.toContain(M["round.result"]);
    expect(ui.text()).not.toContain("2 EUR");
  });

  it("shows a canceled book round at V-6 with its result", () => {
    const ui = mount();
    const { payout: _none, ...evidence } = bookEvidence({
      status: "canceled",
    });
    ui.show({
      kind: "report",
      report: report({ kind: "matches" }, { evidence }),
    });
    expect(ui.heading()).toContain(M["matches.heading"]);
    expect(ui.text()).toContain(`${M["round.result"]}${M["result.canceled"]}`);
  });
});

describe("a book round's checks (V-19)", () => {
  it("labels a check that does not apply so, with its reason, never as matching", () => {
    const skipped: CheckResult = {
      id: 3,
      title: "The backend's signature",
      status: "not-applicable",
      comparisons: [],
      note: "A book round has no signed creation authorization.",
    };
    const ui = mount();
    ui.show({ kind: "report", report: bookReport({}, [skipped]) });
    const item = ui.host.querySelector(".vp-check--not-applicable");
    expect(item?.textContent).toContain(
      `3. The backend's signature: ${M["check.notApplicable"]}`,
    );
    expect(item?.textContent).toContain("no signed creation authorization");
    expect(item?.textContent).not.toContain(M["check.matches"]);
  });

  it("labels check 8's two rows as the verify API's, not as recomputed", () => {
    const draw: CheckResult = {
      id: 8,
      title: "The draw",
      status: "mismatch",
      comparisons: [
        {
          name: "drawn row index",
          recomputed: "1",
          evidence: "2",
          matches: false,
          labels: {
            recomputed: "recomputed.draw (the verify API's redraw)",
            evidence: "book.drawn (the verify API's record)",
          },
        },
      ],
    };
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "mismatch", failed: [8] },
        { evidence: bookEvidence(), checks: [...checks(), draw] },
      ),
    });
    const item = ui.host.querySelector(".vp-check--mismatch");
    expect(item?.textContent).toContain(
      "drawn row index, recomputed.draw (the verify API's redraw)1",
    );
    expect(item?.textContent).toContain(
      "drawn row index, book.drawn (the verify API's record)2",
    );
    expect(item?.textContent).not.toContain(`, ${M["checks.recomputed"]}1`);
    expect(ui.alert()).toContain("8. The draw");
  });
});

describe("a book round's values, shown and not checked (V-13, V-20)", () => {
  it("shows the mode, both rows, the table, the cost, and the package hash", () => {
    const ui = mount();
    ui.show({ kind: "report", report: bookReport() });
    const text = ui.text();
    for (const shown of [
      `${M["notChecked.mode"]}base`,
      `${M["notChecked.drawnIndex"]}2`,
      `${M["notChecked.drawnMultiplier"]}1.940×`,
      `${M["notChecked.apiDrawIndex"]}2`,
      `${M["notChecked.apiDrawMultiplier"]}1.940×`,
      `${M["notChecked.cost"]}1/5`,
      `${M["notChecked.entryCount"]}3`,
      `${M["notChecked.totalWeight"]}1000000`,
      `${M["notChecked.packageHash"]}${HASH}`,
      `${M["notChecked.binding"]}${M["check.notChecked"]}`,
    ]) {
      expect(text).toContain(shown);
    }
  });

  it("shows a field the body does not carry as not reported, never an error", () => {
    const ui = mount();
    const base = bookEvidence();
    ui.show({
      kind: "report",
      report: report(
        { kind: "not-recomputable", reason: "not-ended" },
        {
          evidence: {
            ...base,
            status: "starting",
            book: { mode: "base", packageHash: HASH },
          },
        },
      ),
    });
    const reported = M["notChecked.notReported"];
    for (const label of [
      "drawnIndex",
      "drawnMultiplier",
      "apiDrawIndex",
      "cost",
      "merkleRoot",
      "entryCount",
      "totalWeight",
    ] as const) {
      expect(ui.text()).toContain(`${M[`notChecked.${label}`]}${reported}`);
    }
    expect(ui.alert()).toBe("");
  });

  it.each([
    ["0", "0.000×"],
    ["5", "0.005×"],
    ["1940", "1.940×"],
    ["2000", "2.000×"],
    ["123456789012345678901234567890", "123456789012345678901234567.890×"],
  ])("writes a multiplier of %s thousandths as %s", (milli, shown) => {
    expect(formatMultiplierMilli(milli)).toBe(shown);
  });
});
