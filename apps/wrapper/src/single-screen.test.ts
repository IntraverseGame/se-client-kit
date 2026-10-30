// T-25 (W-57, W-58), the round's rows: for each row of W-57's table, whether
// the game frame shows and takes input, the overlay's form and heading, the
// bar's slots, and the controls a player can use. The frame takes input only
// at `active`, in a round the shell holds, with the verdict `ready`; it is
// inert at `idle`, while preparing and checking, while resolving, on every
// result, and in a round the shell does not hold. No row shows a usable start
// or cash-out, or a playable frame, for the round in progress while its
// verdict is not `ready`. The states that stop the round, and the frame rule
// as a pure function, are single-screen-covers.test.ts's.

import { describe, expect, it } from "vitest";

import { HELD, readOf, screenAfter, shownOf } from "./fixtures/screen.ts";
import { problemVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck } from "./round-input.ts";

const m = messagesFor("en").messages;
const CHECKING: RoundCheck = { ...HELD, verdict: "checking" };

/** The round's own controls: the start, "Play again", and the cash-out. */
const ROUND_CONTROLS = [
  m["action.placeBet"],
  m["action.playAgain"],
  m["action.cashOut"],
];

describe("the single screen, a round's rows (T-25)", () => {
  it("loading: no session yet, the cover, nothing usable", () => {
    const shown = shownOf(screenAfter());
    expect(shown).toMatchObject({
      overlay: "cover",
      overlayText: m["status.loading"],
      playable: false,
      status: "",
      controls: [],
    });
  });

  it("idle: the frame shown and inert, the bet and Place bet, the lobby and the deposit", () => {
    const shown = shownOf(screenAfter(readOf("coinflip-idle")));
    expect(shown).toMatchObject({
      frameShown: true,
      playable: false,
      overlay: "none",
      status: m["status.idle"],
      alertIn: "bar",
      alertLine: "",
    });
    expect(shown.controls).toContain(m["action.placeBet"]);
    expect(shown.controls).not.toContain(m["action.playAgain"]);
    expect(shown.controls).toContain(m["action.lobby"]);
    expect(shown.roundLine).toContain(m["label.balance"]);
  });

  it("idle with a typed error: the alert line owns the alert, the start stays", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    screen.app.accept(
      { kind: "problem", problem: problemVector("problem-insufficient-funds") },
      "poll",
    );
    const shown = shownOf(screen);
    expect(shown.alertIn).toBe("bar");
    expect(shown.alertLine).toContain(m["error.INSUFFICIENT_FUNDS"]);
    expect(shown.controls).toContain(m["action.placeBet"]);
    expect(shown.playable).toBe(false);
  });

  it("starting: the frame shown and inert, no overlay, preparing the round", () => {
    const shown = shownOf(
      screenAfter(readOf("coinflip-starting-bound", CHECKING)),
    );
    expect(shown).toMatchObject({
      frameShown: true,
      playable: false,
      overlay: "none",
      status: m["status.starting"],
    });
    for (const control of ROUND_CONTROLS) {
      expect(shown.controls).not.toContain(control);
    }
  });

  it("active, still checked: the scrim over an inert frame, and no round control", () => {
    const shown = shownOf(screenAfter(readOf("coinflip-active", CHECKING)));
    expect(shown).toMatchObject({
      playable: false,
      overlay: "scrim",
      overlayText: m["detail.verifying"],
      status: m["status.starting"],
      controls: [],
    });
  });

  it("active, ready: the only playable row, with no overlay", () => {
    const shown = shownOf(screenAfter(readOf("coinflip-active", HELD)));
    expect(shown).toMatchObject({
      frameShown: true,
      playable: true,
      overlay: "none",
      status: m["status.active"],
      controls: [],
    });
  });

  it("active, ready, cash-out offered: Cash out with the multiplier beside it, never an amount", () => {
    const screen = screenAfter(
      readOf("cashorcrash-active-row2", { ...HELD, cashOutOffered: true }),
    );
    const shown = shownOf(screen);
    expect(shown.controls).toEqual([m["action.cashOut"]]);
    const control = screen.host.querySelector(".se-controls button");
    expect(control?.textContent).toMatch(/^Cash out ×[\d.]+$/u);
    expect(control?.textContent).not.toContain("€");
  });

  it("a cash-out call in flight makes the frame inert", () => {
    const screen = screenAfter(
      readOf("cashorcrash-active-row2", { ...HELD, cashOutOffered: true }),
    );
    screen.app.callInFlight(true);
    expect(shownOf(screen).playable).toBe(false);
    screen.app.callInFlight(false);
    expect(shownOf(screen).playable).toBe(true);
  });

  it("active, a round the shell does not hold: the cover, an inert frame, an empty bar", () => {
    const shown = shownOf(screenAfter(readOf("coinflip-active")));
    expect(shown).toMatchObject({
      frameShown: true,
      playable: false,
      overlay: "cover",
      overlayText: m["state.notHeld"],
      status: "",
      controls: [],
    });
  });

  it("active, a move not confirmed: inert, its state in the status line, Check again", () => {
    const shown = shownOf(
      screenAfter(readOf("coinflip-active", { ...HELD, unconfirmed: "move" })),
    );
    expect(shown).toMatchObject({
      playable: false,
      overlay: "none",
      status: m["state.moveUnconfirmed"],
      controls: [m["action.checkAgain"]],
    });
  });

  it("resolving: the frame shown and inert, no overlay", () => {
    const shown = shownOf(screenAfter(readOf("coinflip-resolving", HELD)));
    expect(shown).toMatchObject({
      playable: false,
      overlay: "none",
      status: m["status.resolving"],
      controls: [],
    });
  });

  it.each([
    ["coinflip-won", "status.won"],
    ["coinflip-lost", "status.lost"],
    ["coinflip-canceled", "status.canceled"],
  ] as const)(
    "%s: the frame inert (view only), the result, the round id, and Play again",
    (name, heading) => {
      const shown = shownOf(screenAfter(readOf(name, HELD)));
      expect(shown).toMatchObject({
        frameShown: true,
        playable: false,
        overlay: "none",
        status: m[heading],
      });
      expect(shown.controls).toContain(m["action.playAgain"]);
      expect(shown.controls).toContain(m["action.copyRoundId"]);
      expect(shown.controls).not.toContain(m["action.placeBet"]);
      expect(shown.roundLine).toContain(m["label.roundId"]);
    },
  );

  it.each([
    ["a connection problem", { kind: "network" } as const],
    [
      "a typed error",
      {
        kind: "problem",
        problem: problemVector("problem-default-code-unavailable"),
      } as const,
    ],
    ["the generic error", { kind: "refused" } as const],
  ])(
    "active, ready, with %s: the frame stays playable and the alert line owns the alert",
    (_, read) => {
      const screen = screenAfter(readOf("coinflip-active", HELD));
      screen.app.accept(read, "poll");
      const shown = shownOf(screen);
      expect(shown.playable).toBe(true);
      expect(shown.overlay).toBe("none");
      expect(shown.alertIn).toBe("bar");
      expect(shown.alertLine).not.toBe("");
    },
  );
});
