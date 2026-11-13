// T-32, the bar's controls (RFC-005 sections 4, 5, 7, 8): the Space shortcut
// only while the focus is on the bar itself (Q5), never on one of its
// controls, never a cash-out; the start control's tooltip and
// `aria-keyshortcuts`; the pick prompt, which is not a control and is hidden
// from assistive technology, with the same words in the status line; the
// state edge (W-60); the menu's session summary, in memory only and with no
// amount (Q4); the lobby kept visible in the bar when the session ended
// (W-49f); and under autoplay each round's id replacing the last one's (W-40).

import { describe, expect, it } from "vitest";

import { mount, type Mounted, VECTOR_OPERATOR } from "./fixtures/app.ts";
import { environmentDocument } from "./fixtures/environment.ts";
import { HELD, readOf } from "./fixtures/screen.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck, ShownAmount } from "./round-input.ts";

const m = messagesFor("en").messages;

type Bar = Mounted & {
  readonly started: ShownAmount[];
  readonly cashOuts: () => number;
  readonly bar: HTMLElement;
};

const barAfter = (name: string, check?: RoundCheck): Bar => {
  const ui = mount(
    environmentDocument({ autoplay: { counts: [10], minIntervalMs: 0 } }),
  );
  const started: ShownAmount[] = [];
  let cashOuts = 0;
  ui.app.connect({
    readSnapshot: () => new Promise(() => {}),
    intents: {
      start: bet => started.push(bet),
      cashOut: () => {
        cashOuts += 1;
      },
    },
  });
  ui.app.accept(readOf(name, check), "poll");
  const bar = ui.host.querySelector<HTMLElement>(".se-bar");
  if (bar === null) throw new Error("no bar");
  return { ...ui, started, cashOuts: () => cashOuts, bar };
};

/** `value`, which the test needs present. */
const must = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error("missing");
  return value;
};

const space = (target: HTMLElement): void => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
  );
};

describe("the Space shortcut (Q5)", () => {
  it("starts a round while the focus is on the bar itself", () => {
    const ui = barAfter("coinflip-idle");
    ui.bar.focus();
    expect(document.activeElement).toBe(ui.bar);
    space(ui.bar);
    expect(ui.started).toHaveLength(1);
  });

  it("does nothing on one of the bar's controls", () => {
    const ui = barAfter("coinflip-idle");
    const field = must(
      ui.host.querySelector<HTMLElement>('[role="spinbutton"]'),
    );
    field.focus();
    space(field);
    expect(ui.started).toEqual([]);
  });

  it("never cashes out", () => {
    const ui = barAfter("cashorcrash-active-cash-out-value", {
      ...HELD,
      cashOutOffered: true,
    });
    ui.bar.focus();
    space(ui.bar);
    expect(ui.cashOuts()).toBe(0);
    expect(ui.started).toEqual([]);
  });

  it("is named in the start control's tooltip and aria-keyshortcuts", () => {
    const start = barAfter("coinflip-idle").host.querySelector(
      '[data-focus-key="start"]',
    );
    expect(start?.getAttribute("aria-keyshortcuts")).toBe("Space");
    expect(start?.getAttribute("title")).toBe(m["start.shortcut"]);
  });
});

describe("the start control's place (RFC-005 section 5)", () => {
  it("holds the pick prompt while the first pick is owed: not a control, hidden from assistive technology", () => {
    const ui = barAfter("cashorcrash-cash-out-active-step0", HELD);
    const prompt = ui.host.querySelector(".se-pick-prompt");
    expect(prompt?.getAttribute("aria-hidden")).toBe("true");
    expect(prompt?.textContent).toBe(m["start.pickPrompt"]);
    expect(prompt?.querySelector("button, a, [tabindex]")).toBeNull();
    expect(ui.host.querySelector(".se-status")?.textContent).toContain(
      m["start.pickDetail"],
    );
  });

  it("holds no prompt while a move is pending, nor once the cash-out is offered", () => {
    expect(
      barAfter("cashorcrash-cash-out-active-step0", {
        ...HELD,
        pending: "move",
      }).host.querySelector(".se-pick-prompt"),
    ).toBeNull();
    const offered = barAfter("cashorcrash-cash-out-active-step1", {
      ...HELD,
      cashOutOffered: true,
    });
    expect(offered.host.querySelector(".se-pick-prompt")).toBeNull();
    expect(
      offered.host.querySelector('.se-start[data-focus-key="cash-out"]'),
    ).not.toBeNull();
  });
});

describe("the state edge (W-60)", () => {
  it("sweeps while the round is prepared, checked, or resolved; flashes on a win; is the problem colour on an error", () => {
    expect(barAfter("coinflip-idle").bar.dataset["edge"]).toBe("none");
    expect(barAfter("coinflip-starting").bar.dataset["edge"]).toBe("sweep");
    expect(
      barAfter("coinflip-active", { ...HELD, verdict: "checking" }).bar.dataset[
        "edge"
      ],
    ).toBe("sweep");
    expect(barAfter("coinflip-resolving").bar.dataset["edge"]).toBe("sweep");
    expect(barAfter("coinflip-won", HELD).bar.dataset["edge"]).toBe("won");
    const offline = barAfter("coinflip-idle");
    offline.app.accept({ kind: "network" }, "poll");
    expect(offline.bar.dataset["edge"]).toBe("problem");
    expect(
      offline.bar.querySelector(".se-edge")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

describe("the menu (RFC-005 section 8)", () => {
  it("holds this session's time and rounds, and no amount (Q4)", async () => {
    const ui = barAfter("coinflip-idle");
    ui.app.accept(readOf("coinflip-won", HELD), "poll");
    await ui.step(14 * 60_000);
    const button = ui.host.querySelector<HTMLButtonElement>(".se-menu-button");
    expect(button?.getAttribute("aria-label")).toBe(m["menu.open"]);
    button?.click();
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    const summary = must(ui.host.querySelector(".se-session")).textContent;
    expect(summary).toContain("14 min");
    expect(summary).toContain(`${m["menu.rounds"]}: 1`);
    expect(summary).not.toMatch(/[€$]/u);
  });

  it("keeps the lobby a visible control in the bar when the session ended (W-49f)", () => {
    const ui = barAfter("coinflip-idle");
    ui.app.block("session-ended");
    const relaunch = ui.host.querySelector(".se-relaunch a");
    expect(relaunch?.textContent).toBe(m["action.relaunch"]);
    expect(relaunch?.getAttribute("href")).toContain(VECTOR_OPERATOR);
    expect(ui.host.querySelector(".se-menu .se-links a")).toBeNull();
  });
});

describe("the round line under autoplay (W-40, W-61)", () => {
  it("replaces each round's id with the next one's, with no new act", () => {
    const ui = barAfter("book-lifecycle-won", HELD);
    const first = must(snapshotVector("book-lifecycle-won").roundId);
    expect(ui.host.querySelector(".se-round")?.textContent).toContain(
      first.slice(-8),
    );
    ui.app.autoplayRun({ left: 3 });
    const next = {
      ...snapshotVector("coinflip-starting"),
      presentation: "playback" as const,
      config: { kind: "book" as const },
      roundId: "01927c5e-8b3a-7f21-9c4d-00000000aaaa",
      version: 99,
    };
    ui.app.accept({ kind: "snapshot", snapshot: next, check: HELD }, "poll");
    expect(ui.app.state().endedRound).toBeUndefined();
  });
});
