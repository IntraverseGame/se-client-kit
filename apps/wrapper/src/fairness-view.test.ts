// T-30, the fairness chip's view (W-59, RFC-005 section 3): its popover, with
// checks 1 to 4 in full and what they do not cover; the round id and the
// verify link only once the round has ended (W-39); a player label for every
// machine code (W-48), never the code; no "Verified" anywhere; and the chip in
// the bar, beside W-26a's badge, with its popover opened and closed.

import { describe, expect, it } from "vitest";

import { elementBuilder } from "./dom.ts";
import { chipContent, failureText } from "./fairness-view.ts";
import { chipOf, type ChipPlan } from "./fairness.ts";
import { mount } from "./fixtures/app.ts";
import { LOCAL_ORIGIN, localDocument } from "./fixtures/environment.ts";
import { HELD } from "./fixtures/screen.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import {
  acceptRead,
  initialState,
  type WrapperState,
} from "./wrapper-state.ts";

const m = messagesFor("en").messages;

/** The state after one read of the vector `name`, with `HELD`. */
const heldAfter = (name: string): WrapperState => {
  const { blocking: _loading, ...open } = initialState;
  return acceptRead(open, {
    kind: "snapshot",
    snapshot: snapshotVector(name),
    check: HELD,
  });
};

/** The chip's and its popover's texts, in English. */
const CHIP_TEXTS: readonly string[] = Object.entries(m)
  .filter(([key]) => key.startsWith("chip.") || key.startsWith("pop."))
  .map(([, text]) => text);

describe("the chip's popover (T-30)", () => {
  const el = elementBuilder(globalThis.document);
  const context = {
    el,
    doc: globalThis.document,
    m,
    options: { intents: {}, verifyBaseUrl: "https://se.example/verify" },
    announce: () => {},
  };
  const textOf = (plan: ChipPlan): string =>
    el("div", {}, [...chipContent(context, plan)]).textContent ?? "";

  it("shows the round id and the verify link only once the round has ended (W-39)", () => {
    const live = heldAfter("coinflip-active");
    const ended = heldAfter("coinflip-won");
    const id = String(snapshotVector("coinflip-won").roundId);
    expect(textOf(chipOf(live) as ChipPlan)).not.toContain(id.slice(-8));
    expect(textOf(chipOf(ended) as ChipPlan)).toContain(id.slice(-8));
  });

  it("lists checks 1 to 4 in full and what they do not cover", () => {
    const text = textOf({ kind: "checked", game: "config" });
    for (const key of [
      "pop.checkRound",
      "pop.checkKey",
      "pop.checkBet",
      "pop.checkSecret",
      "pop.checkChain",
      "pop.checkTarget",
      "pop.checkSigner",
      "pop.checkReady",
      "pop.checkTip",
      "pop.notReady",
      "pop.notOnChain",
      "pop.notTerms",
      "pop.notExpiry",
      "pop.notOutcome",
    ] as const) {
      expect(text).toContain(m[key]);
    }
    expect(textOf({ kind: "dev", game: "config" })).toContain(
      m["pop.checkTipDev"],
    );
  });

  it("gives every machine code a player label (W-48), never the code itself", () => {
    const failures: readonly NonNullable<ChipPlan["failure"]>[] = [
      "missing",
      "pinned-mismatch",
      "cross-field",
      "recover-mismatch",
      "ready-mismatch",
      "reissued",
      "tip-check",
      "changed",
    ];
    const tips: readonly NonNullable<ChipPlan["tipFailure"]>[] = [
      "unknown-source",
      "too-few-answered",
      "chain-id-unavailable",
      "chain-id-mismatch",
      "lagging",
      "hash-unavailable",
      "hash-mismatch",
      "bind",
    ];
    for (const failure of failures) {
      const [label] = failureText(m, {
        kind: "not-verified",
        game: "config",
        failure,
      });
      expect(label).toBeTruthy();
      expect(label).not.toBe(failure);
      expect(label).not.toBe(m["fail.unknown"]);
    }
    for (const tipFailure of tips) {
      const labels = failureText(m, {
        kind: "not-verified",
        game: "config",
        failure: "tip-check",
        tipFailure,
      });
      expect(labels).toHaveLength(2);
      expect(labels[1]).toBeTruthy();
      expect(labels[1]).not.toBe(tipFailure);
    }
  });

  it("never says Verified or Provably fair", () => {
    expect(CHIP_TEXTS.length).toBeGreaterThan(0);
    expect(
      CHIP_TEXTS.filter(text => /\bVerified\b|Provably fair/u.test(text)),
    ).toEqual([]);
  });
});

describe("the chip in the bar (T-30)", () => {
  it("reads Checked before play in the bar, with a label naming its popover", () => {
    const ui = mount();
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: snapshotVector("coinflip-won"),
        check: HELD,
      },
      "poll",
    );
    const chip = ui.host.querySelector(".se-chip");
    expect(chip?.textContent).toBe(m["chip.checked"]);
    expect(chip?.getAttribute("aria-label")).toContain(m["chip.checked"]);
    expect(chip?.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows beside W-26a's badge, which stays: Checked (dev), never Checked before play", () => {
    const ui = mount(localDocument(), undefined, LOCAL_ORIGIN);
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
      "poll",
    );
    expect(ui.host.querySelector(".se-chip")?.textContent).toBe(m["chip.how"]);
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: snapshotVector("coinflip-won"),
        check: HELD,
      },
      "poll",
    );
    expect(ui.host.querySelector(".se-chip")?.textContent).toBe(m["chip.dev"]);
    expect(ui.host.querySelector(".se-notice--chain")?.textContent).toContain(
      m["notice.chainNotIndependent"],
    );
  });

  it("opens its popover on a click, and Escape closes it and returns the focus", () => {
    const ui = mount();
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: snapshotVector("coinflip-won"),
        check: HELD,
      },
      "poll",
    );
    const chip = ui.host.querySelector<HTMLButtonElement>(".se-chip");
    chip?.focus();
    chip?.click();
    expect(chip?.getAttribute("aria-expanded")).toBe("true");
    const panel = ui.host.querySelector<HTMLElement>(
      ".se-chip-anchor .se-popover",
    );
    expect(panel?.hidden).toBe(false);
    panel?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(panel?.hidden).toBe(true);
    expect(document.activeElement).toBe(chip);
  });
});
