// The game's page in jsdom, mounted with a fake parent: what each status and
// each reject shows, when the calls can be used, where focus goes, and the
// theme and layout it takes from the Snapshot. The accessibility rules are in
// accessibility.test.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  alertText,
  callButton,
  callsShown,
  detail,
  heading,
  headingFocusCount,
  mount,
  setDocumentFocus,
} from "./fixtures/page.ts";
import {
  rejectMessage,
  SNAPSHOTS,
  snapshotMessage,
  withFields,
} from "./fixtures/snapshots.ts";
import { HEADING_ID } from "./render.ts";

beforeEach(() => {
  delete document.documentElement.dataset["theme"];
  delete document.documentElement.dataset["device"];
});

describe("rendering per status", () => {
  it.each<[keyof typeof SNAPSHOTS, string, string]>([
    [
      "idle",
      "Ready to flip",
      "Place a bet in the Wrapper to start a round. A win pays ×1.94.",
    ],
    [
      "starting",
      "Starting the round",
      "The Wrapper is opening the round. Your call comes next.",
    ],
    ["active", "Call it: heads or tails", "A win pays ×1.94."],
    [
      "resolving",
      "Flipping the coin",
      "The result is on its way. You called tails.",
    ],
    [
      "won",
      "You won",
      "The coin landed tails. You called tails. The win pays ×1.94.",
    ],
    ["lost", "You lost", "The coin landed tails. You called heads."],
    [
      "canceled",
      "Round canceled",
      "The round was canceled. The coin landed tails.",
    ],
    [
      "canceledExpired",
      "Round canceled",
      "The round expired before it finished. The coin landed heads.",
    ],
  ])("shows %s", (name, title, text) => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS[name]));
    expect(heading(host)).toBe(title);
    expect(detail(host)).toBe(text);
    expect(host.querySelector("main")?.dataset["status"]).toBe(
      SNAPSHOTS[name].status,
    );
    expect(callsShown(host)).toBe(name === "active");
  });

  it("shows the waiting state before the first Snapshot", () => {
    const { host } = mount();
    expect(heading(host)).toBe("Waiting for the round");
    expect(callsShown(host)).toBe(false);
  });

  it("shows that it runs only inside the Wrapper when it is not framed", () => {
    const { host } = mount(false);
    expect(heading(host)).toBe("Coin Flip runs inside the SuperEngine Wrapper");
    expect(callsShown(host)).toBe(false);
  });

  it("shows that a round is not Coin Flip", () => {
    const { parent, host } = mount();
    const dice = withFields(SNAPSHOTS.active, {
      config: {
        kind: "steps",
        steps: [{ index: 0, optionCount: 6, multiplier: 5.8 }],
      },
    });
    parent.send(snapshotMessage(dice));
    expect(heading(host)).toBe("Not a Coin Flip round");
    expect(callsShown(host)).toBe(false);
  });

  it("renders a Snapshot's text as text, never as markup", () => {
    const { parent, host } = mount();
    const markup = withFields(SNAPSHOTS.won, {
      roundId: "<img src=x onerror=alert(1)>",
    });
    parent.send(snapshotMessage(markup));
    expect(host.querySelector("img")).toBeNull();
  });
});

describe("the calls", () => {
  it("asks for the side the player clicks, and holds both calls until it is answered", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    callButton(host, "Tails").click();
    expect(parent.posted.at(-1)?.message).toMatchObject({
      type: "action",
      args: { step: 0, option: 1 },
    });
    expect(heading(host)).toBe("Calling tails");
    expect(callButton(host, "Tails").getAttribute("aria-pressed")).toBe("true");
    for (const label of ["Heads", "Tails"]) {
      expect(callButton(host, label).getAttribute("aria-disabled")).toBe(
        "true",
      );
    }
    callButton(host, "Heads").click();
    expect(parent.posted).toHaveLength(2);
  });

  it.each<[Parameters<typeof rejectMessage>[1], string]>([
    ["not_legal", "That call is not allowed now. Try again."],
    ["not_active", "The round is not taking a call right now."],
    [
      "busy",
      "Your last call is still on its way. Wait a moment, then try again.",
    ],
    ["invalid", "The game sent a call the Wrapper could not read."],
  ])(
    "shows reject: %s in the alert and lets the player call again",
    (reason, text) => {
      const { parent, host } = mount();
      parent.send(snapshotMessage(SNAPSHOTS.active));
      const heads = callButton(host, "Heads");
      heads.focus();
      heads.click();
      parent.send(rejectMessage("pick-1", reason));
      expect(alertText(host)).toBe(text);
      expect(heading(host)).toBe("Call it: heads or tails");
      expect(heads.getAttribute("aria-disabled")).toBe("false");
      expect(document.activeElement).toBe(heads);
    },
  );

  it("moves focus to the heading when the next Snapshot answers the pick", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    const tails = callButton(host, "Tails");
    tails.focus();
    tails.click();
    parent.send(snapshotMessage(SNAPSHOTS.resolving));
    expect(document.activeElement?.id).toBe(HEADING_ID);
  });

  it.each(["resolving", "canceled", "canceledExpired", "idle"] as const)(
    "moves focus to the heading when the calls hide under a focused call (%s, no pick)",
    name => {
      const { parent, host } = mount();
      parent.send(snapshotMessage(SNAPSHOTS.active));
      callButton(host, "Heads").focus();
      parent.send(snapshotMessage({ ...SNAPSHOTS[name], version: 9 }));
      expect(callsShown(host)).toBe(false);
      expect(document.activeElement?.id).toBe(HEADING_ID);
    },
  );

  it("leaves focus alone when the calls stay or nothing in them was focused", () => {
    const { parent, host } = mount();
    const outside = document.createElement("button");
    document.body.append(outside);
    parent.send(snapshotMessage(SNAPSHOTS.active));
    const heads = callButton(host, "Heads");
    heads.focus();
    parent.send(snapshotMessage({ ...SNAPSHOTS.active, version: 4 }));
    expect(document.activeElement).toBe(heads);
    outside.focus();
    parent.send(snapshotMessage({ ...SNAPSHOTS.canceled, version: 9 }));
    expect(document.activeElement).toBe(outside);
  });

  it("never moves focus on a Snapshot the player did not cause", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS.idle));
    parent.send(snapshotMessage(SNAPSHOTS.won));
    expect(document.activeElement?.id).not.toBe(HEADING_ID);
    expect(callsShown(host)).toBe(false);
  });
});

describe("focus yields to the Wrapper (W-46)", () => {
  const restores: (() => void)[] = [];
  afterEach(() => {
    for (const restore of restores.splice(0)) restore();
  });

  // [document focused, heading focus events, heading focused at the end]
  const CASES = [
    [true, 1, true],
    [false, 0, false],
  ] as const;

  it.each(CASES)(
    "the player's pick answered by a Snapshot that hides the calls (document focused: %s)",
    (focused, focusEvents, headingFocused) => {
      const { parent, host } = mount();
      parent.send(snapshotMessage(SNAPSHOTS.active));
      const tails = callButton(host, "Tails");
      tails.focus();
      tails.click();
      restores.push(setDocumentFocus(focused));
      const focusCount = headingFocusCount(host);
      parent.send(snapshotMessage(SNAPSHOTS.won));
      expect(callsShown(host)).toBe(false);
      expect(focusCount()).toBe(focusEvents);
      expect(document.activeElement?.id === HEADING_ID).toBe(headingFocused);
    },
  );

  it.each(CASES)(
    "the calls hiding while one holds focus (document focused: %s)",
    (focused, focusEvents, headingFocused) => {
      const { parent, host } = mount();
      parent.send(snapshotMessage(SNAPSHOTS.active));
      callButton(host, "Heads").focus();
      restores.push(setDocumentFocus(focused));
      const focusCount = headingFocusCount(host);
      parent.send(snapshotMessage({ ...SNAPSHOTS.canceled, version: 9 }));
      expect(callsShown(host)).toBe(false);
      expect(focusCount()).toBe(focusEvents);
      expect(document.activeElement?.id === HEADING_ID).toBe(headingFocused);
    },
  );

  it.each(CASES)(
    "the player's pick answered with focus off the calls (document focused: %s)",
    (focused, focusEvents, headingFocused) => {
      const { parent, host } = mount();
      parent.send(snapshotMessage(SNAPSHOTS.active));
      const tails = callButton(host, "Tails");
      tails.focus();
      tails.click();
      tails.blur();
      restores.push(setDocumentFocus(focused));
      const focusCount = headingFocusCount(host);
      parent.send(snapshotMessage(SNAPSHOTS.won));
      expect(callsShown(host)).toBe(false);
      expect(focusCount()).toBe(focusEvents);
      expect(document.activeElement?.id === HEADING_ID).toBe(headingFocused);
    },
  );
});

describe("theme and layout", () => {
  it("takes the Snapshot's appearance and device, and drops them when absent", () => {
    const { parent } = mount();
    const root = document.documentElement;
    parent.send(
      snapshotMessage(
        withFields(SNAPSHOTS.active, {
          context: {
            language: "en",
            device: "mobile",
            theme: { appearance: "dark" },
          },
        }),
      ),
    );
    expect(root.dataset["theme"]).toBe("dark");
    expect(root.dataset["device"]).toBe("mobile");
    parent.send(snapshotMessage(withFields(SNAPSHOTS.resolving, {})));
    expect(root.dataset["theme"]).toBeUndefined();
    expect(root.dataset["device"]).toBe("desktop");
  });
});
