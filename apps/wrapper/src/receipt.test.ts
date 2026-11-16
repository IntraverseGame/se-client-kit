// T-30, the round receipt (W-59, W-39, W-40; decided by the human,
// 2026-11-13): one chip at the end of the status line whose visible label is
// short words, or the shortened round id once the round has ended ("Not
// verified" kept beside it), with a chevron; whose accessible name says it in
// full with Q1's words; and whose popover holds the round id, its copy
// control, and the verify link after an end only. The popover closes on
// Escape (the focus back on the chip), on a click outside it, when the page
// loses the focus (a click in the game's frame), and on a scroll.

import { describe, expect, it } from "vitest";

import { receiptLabel, receiptName } from "./fairness-view.ts";
import type { ChipPlan } from "./fairness.ts";
import { linkNamed, mount, openReceipt } from "./fixtures/app.ts";
import { HELD } from "./fixtures/screen.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

const ROUND_ID = String(snapshotVector("coinflip-won").roundId);
const SHORT = `…${ROUND_ID.slice(-8)}`;

/** A plan of `kind`, ended or not. */
const plan = (
  kind: ChipPlan["kind"],
  ended: boolean,
  game: ChipPlan["game"] = "config",
): ChipPlan => ({
  kind,
  game,
  ...(ended ? { endedRoundId: ROUND_ID } : {}),
});

/** The UI after one read of the vector `name`, with `HELD`'s checks. */
const after = (name: string) => {
  const ui = mount();
  ui.app.accept(
    { kind: "snapshot", snapshot: snapshotVector(name), check: HELD },
    "poll",
  );
  return ui;
};

const chipOf = (host: HTMLElement): HTMLButtonElement => {
  const chip = host.querySelector<HTMLButtonElement>(".se-receipt");
  if (chip === null) throw new Error("no receipt");
  return chip;
};

const panelOf = (host: HTMLElement): HTMLElement => {
  const panel = host.querySelector<HTMLElement>(".se-chip-anchor .se-popover");
  if (panel === null) throw new Error("no panel");
  return panel;
};

describe("the receipt's label (T-30)", () => {
  // The visible label leads the name (WCAG 2.5.3): only Fairness is not
  // already the start of Q1's words.
  const open = m["chip.openLabel"];
  it.each([
    [
      "how",
      m["receipt.fairness"],
      `${m["receipt.fairness"]}. ${m["chip.how"]}: ${open}`,
    ],
    ["checking", m["receipt.checking"], `${m["chip.checking"]}: ${open}`],
    ["checked", m["receipt.checked"], `${m["chip.checked"]}: ${open}`],
    ["dev", m["chip.dev"], `${m["chip.dev"]}: ${open}`],
    [
      "not-verified",
      m["chip.notVerified"],
      `${m["chip.notVerified"]}: ${open}`,
    ],
    ["recorded", m["chip.recorded"], `${m["chip.recorded"]}: ${open}`],
  ] as const)(
    "reads short words before a round ends, and Q1's in its name: %s",
    (kind, words, name) => {
      expect(receiptLabel(m, plan(kind, false))).toBe(words);
      expect(receiptName(m, plan(kind, false))).toBe(name);
    },
  );

  it.each(["how", "checked", "dev", "recorded"] as const)(
    "reads the shortened round id once the round has ended: %s",
    kind => {
      expect(receiptLabel(m, plan(kind, true))).toBe(SHORT);
      expect(receiptName(m, plan(kind, true)).startsWith(SHORT)).toBe(true);
      expect(receiptName(m, plan(kind, true))).toContain(ROUND_ID);
      expect(receiptName(m, plan(kind, true))).toContain(
        m["receipt.openEnded"],
      );
    },
  );

  it("keeps Not verified beside the shortened round id: a failure stays", () => {
    expect(receiptLabel(m, plan("not-verified", true))).toBe(
      `${m["chip.notVerified"]} ${SHORT}`,
    );
  });

  it("keeps a chevron in every state, and the label in the bar", () => {
    const ui = after("coinflip-won");
    expect(chipOf(ui.host).querySelector(".se-glyph--chevron")).not.toBeNull();
    expect(chipOf(ui.host).textContent).toBe(SHORT);
    const idle = after("coinflip-idle");
    expect(chipOf(idle.host).textContent).toBe(m["receipt.fairness"]);
    expect(
      chipOf(idle.host).querySelector(".se-glyph--chevron"),
    ).not.toBeNull();
  });

  it("ends the status line, after the status heading", () => {
    const ui = after("coinflip-won");
    const anchor = chipOf(ui.host).closest(".se-chip-anchor");
    expect(
      anchor?.previousElementSibling?.classList.contains("se-status"),
    ).toBe(true);
  });
});

describe("the receipt's popover (T-30)", () => {
  it("holds the round id, its copy control, and the verify link after an end only", () => {
    const live = after("coinflip-active");
    const panel = openReceipt(live.host);
    expect(panel?.querySelector(".se-receipt__id")).toBeNull();
    expect(linkNamed(live.host, m["action.verify"])).toBeUndefined();
    const ended = after("coinflip-won");
    openReceipt(ended.host);
    expect(
      panelOf(ended.host).querySelector(".se-receipt__id")?.textContent,
    ).toBe(ROUND_ID);
    const link = linkNamed(ended.host, m["action.verify"]);
    expect(link?.getAttribute("href")).toBe(
      `https://verify.example/rounds/${ROUND_ID}`,
    );
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(panelOf(ended.host).textContent).toContain(m["action.copyRoundId"]);
  });

  it("closes on Escape and gives the focus back to the chip; it traps none", () => {
    const ui = after("coinflip-won");
    const chip = chipOf(ui.host);
    chip.focus();
    chip.click();
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(chip);
    panelOf(ui.host).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(panelOf(ui.host).hidden).toBe(true);
    expect(document.activeElement).toBe(chip);
  });

  it("closes on a click outside it, and keeps open on a click inside it", () => {
    const ui = after("coinflip-won");
    const chip = chipOf(ui.host);
    chip.click();
    panelOf(ui.host).dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    ui.host
      .querySelector(".se-stage")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(panelOf(ui.host).hidden).toBe(true);
  });

  it("closes when the page loses the focus: a click in the game's frame", () => {
    const ui = after("coinflip-won");
    const chip = chipOf(ui.host);
    chip.click();
    globalThis.dispatchEvent(new FocusEvent("blur"));
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open on a scroll, which only moves it with its chip", () => {
    const ui = after("coinflip-won");
    const chip = chipOf(ui.host);
    chip.click();
    // Placing its verify link into view scrolls: the panel must stay.
    document.dispatchEvent(new Event("scroll"));
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(panelOf(ui.host).hidden).toBe(false);
  });
});
