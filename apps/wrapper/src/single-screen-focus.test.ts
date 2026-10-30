// T-28's Wrapper half (W-16, W-57) and T-14a's single-screen focus rules at the
// component level (W-46, W-58). The status line reads "Waiting for your move
// to be confirmed." only while the shell's `RoundState.pending` is set and a
// connection problem, a typed error, or the generic error shows, never in
// normal play, and the unconfirmed state replaces it. Focus: an error that
// answers a pick in a playable frame keeps the focus in the frame; a bar
// control that goes away hands the focus to the status heading; the frame
// takes the focus once when the round the player started becomes ready.

import { describe, expect, it } from "vitest";

import { HELD, readOf, screenAfter, shownOf } from "./fixtures/screen.ts";
import {
  problemVector,
  snapshotVector,
  withFields,
} from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck, SnapshotRead } from "./round-input.ts";

const m = messagesFor("en").messages;
const PENDING: RoundCheck = { ...HELD, pending: "move" };

/** The text of the status line's detail, if any. */
const detailOf = (host: HTMLElement): string =>
  host.querySelector(".se-status .se-detail")?.textContent ?? "";

const ERRORS: readonly (readonly [string, SnapshotRead])[] = [
  ["a connection problem", { kind: "network" }],
  [
    "a typed error",
    {
      kind: "problem",
      problem: problemVector("problem-default-code-unavailable"),
    },
  ],
  ["the generic error", { kind: "refused" }],
];

describe("the waiting detail (T-28, the Wrapper's half)", () => {
  it.each(ERRORS)(
    "shows while a move is pending and %s shows, under the status in play",
    (_, error) => {
      const screen = screenAfter(readOf("coinflip-active", PENDING));
      screen.app.accept(error, "poll");
      expect(detailOf(screen.host)).toBe(m["detail.waitingMove"]);
      expect(shownOf(screen).status).toBe(m["status.active"]);
    },
  );

  it("names the cash-out when the cash-out is pending", () => {
    const screen = screenAfter(
      readOf("coinflip-active", { ...HELD, pending: "cash-out" }),
    );
    screen.app.accept({ kind: "network" }, "poll");
    expect(detailOf(screen.host)).toBe(m["detail.waitingCashOut"]);
  });

  it("never shows in normal play: a pending move with no error", () => {
    const screen = screenAfter(readOf("coinflip-active", PENDING));
    expect(detailOf(screen.host)).toBe("");
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });

  it("never shows for an error with nothing pending", () => {
    const screen = screenAfter(readOf("coinflip-active", HELD));
    screen.app.accept({ kind: "network" }, "poll");
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });

  it("goes once a newer Snapshot shows the move applied and clears the error", () => {
    const screen = screenAfter(readOf("coinflip-active", PENDING));
    screen.app.accept({ kind: "network" }, "poll");
    screen.app.accept(readOf("coinflip-won", HELD), "poll");
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });

  it("the unconfirmed state replaces it", () => {
    const screen = screenAfter(
      readOf("coinflip-active", { ...PENDING, unconfirmed: "move" }),
    );
    screen.app.accept({ kind: "network" }, "poll");
    expect(shownOf(screen).status).toBe(m["state.moveUnconfirmed"]);
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });
});

describe("the single screen's focus rules (W-46)", () => {
  it("an error that answers a pick keeps the focus in a frame that stays playable", () => {
    const screen = screenAfter(readOf("coinflip-active", HELD));
    screen.frame.focus();
    screen.app.accept({ kind: "network" }, "pick");
    expect(document.activeElement).toBe(screen.frame);
    // The same error after the player's action in the bar takes the focus.
    screen.app.accept(readOf("coinflip-active", HELD), "poll");
    const later = screenAfter(readOf("coinflip-active", HELD));
    later.app.accept({ kind: "network" }, "player");
    expect(document.activeElement?.id).toBe("se-alert-heading");
  });

  it("a bar control that goes away hands the focus to the status heading", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    const start = [...screen.host.querySelectorAll("button")].find(
      button => button.textContent === m["action.placeBet"],
    );
    start?.focus();
    expect(document.activeElement).toBe(start);
    // A poll shows the round starting: the start control is gone.
    screen.app.accept(
      readOf("coinflip-starting-bound", { ...HELD, verdict: "checking" }),
      "poll",
    );
    expect(document.activeElement?.id).toBe("se-status-heading");
  });

  it("the frame takes the focus once when the round the player started becomes ready", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    const start = [...screen.host.querySelectorAll("button")].find(
      button => button.textContent === m["action.placeBet"],
    );
    start?.focus();
    start?.click();
    const checking: RoundCheck = { ...HELD, verdict: "checking" };
    // The start's answer: its control goes, the status heading takes the focus.
    screen.app.accept(readOf("coinflip-starting-bound", checking), "player");
    expect(document.activeElement?.id).toBe("se-status-heading");
    screen.app.accept(readOf("coinflip-active", checking), "poll");
    expect(document.activeElement).not.toBe(screen.frame);
    // The poll that brings the verdict `ready`.
    screen.app.accept(readOf("coinflip-active", HELD), "poll");
    expect(document.activeElement).toBe(screen.frame);
    // Once: a later poll of the round leaves a focus moved elsewhere alone.
    screen.host.querySelector<HTMLElement>("#se-status-heading")?.focus();
    const later = snapshotVector("coinflip-active");
    screen.app.accept(
      {
        kind: "snapshot",
        snapshot: withFields(later, { version: later.version + 1 }),
        check: HELD,
      },
      "poll",
    );
    expect(document.activeElement).not.toBe(screen.frame);
  });

  it("a round the player did not start does not take the focus into the frame", () => {
    const screen = screenAfter(readOf("coinflip-active", HELD));
    expect(document.activeElement).not.toBe(screen.frame);
  });
});
