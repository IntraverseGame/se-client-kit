// T-25 (W-57, W-58), the rows of the states that stop the round or end the
// session, on the stage's cover over an inert frame (hidden in the final
// states), with the bar W-57's table gives each; one `role="alert"` region at
// a time: when a cover state shown as the alert and a bar error show together,
// the cover carries the role and the bar's error is plain text; and W-58's
// rule as a pure function of the UI's state. The round's rows are
// single-screen.test.ts's.

import { describe, expect, it } from "vitest";

import { HELD, readOf, screenAfter, shownOf } from "./fixtures/screen.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck } from "./round-input.ts";
import { playable, stagePlan } from "./stage-plan.ts";
import { initialState, type WrapperState } from "./wrapper-state.ts";

const m = messagesFor("en").messages;
const FAILED: RoundCheck = { ...HELD, verdict: "verification-failed" };

describe("the single screen, the covers (T-25)", () => {
  it.each([
    ["verification failed", FAILED, "state.verificationFailed"],
    [
      "chain not verified",
      { ...HELD, verdict: "chain-unverified" },
      "state.chainUnverified",
    ],
    ["out of sync", { ...HELD, outOfSync: true }, "state.outOfSync"],
  ] as const)(
    "%s: the cover as the alert over an inert frame, no round control",
    (_, check, heading) => {
      const shown = shownOf(screenAfter(readOf("coinflip-active", check)));
      expect(shown).toMatchObject({
        frameShown: true,
        playable: false,
        overlay: "cover",
        overlayText: m[heading],
        alertIn: "cover",
      });
      expect(shown.controls).not.toContain(m["action.cashOut"]);
      expect(shown.controls).not.toContain(m["action.placeBet"]);
    },
  );

  it("verification failed: the bar empty but the lobby", () => {
    const shown = shownOf(screenAfter(readOf("coinflip-active", FAILED)));
    expect(shown.status).toBe("");
    expect(shown.controls).toEqual([m["action.lobby"]]);
  });

  it("out of sync: the round id and the verify link, and the lobby", () => {
    const shown = shownOf(
      screenAfter(readOf("coinflip-active", { ...HELD, outOfSync: true })),
    );
    expect(shown.roundLine).toContain(m["label.roundId"]);
    expect(shown.controls).toContain(m["action.copyRoundId"]);
    expect(shown.controls).toContain(m["action.lobby"]);
  });

  it("the Snapshot rejected: the cover as the alert, the lobby", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    screen.app.accept({ kind: "rejected" }, "poll");
    const shown = shownOf(screen);
    expect(shown).toMatchObject({
      overlay: "cover",
      overlayText: m["state.rejected"],
      alertIn: "cover",
      playable: false,
      controls: [m["action.lobby"]],
    });
  });

  it("game not compatible: the cover, no start control and no link", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    screen.app.gameIncompatible();
    const shown = shownOf(screen);
    expect(shown.overlay).toBe("cover");
    expect(shown.alertIn).toBe("cover");
    expect(screen.host.querySelector(".se-overlay")?.textContent).toContain(
      m["error.gameIncompatible"],
    );
    expect(shown.controls).toEqual([]);
  });

  it("the shell's cancel settling on a resolving read: the cover, the status Resolving", () => {
    const screen = screenAfter(
      readOf("coinflip-resolving-cancel", { ...FAILED, cancel: "settling" }),
    );
    const shown = shownOf(screen);
    expect(shown.overlay).toBe("cover");
    expect(shown.overlayText).toBe(m["state.verificationFailed"]);
    expect(shown.status).toBe(m["status.resolving"]);
    expect(shown.playable).toBe(false);
  });

  it("the shell's cancel to check later: the cover, still resolving, Check again, the round id", () => {
    const shown = shownOf(
      screenAfter(
        readOf("coinflip-resolving-cancel", {
          ...FAILED,
          cancel: "check-later",
        }),
      ),
    );
    expect(shown.overlay).toBe("cover");
    expect(shown.status).toBe(m["state.checkLater"]);
    expect(shown.controls).toContain(m["action.checkAgain"]);
    expect(shown.roundLine).toContain(m["label.roundId"]);
  });

  it("the shell's cancel ended: no overlay, Round ended, and Play again", () => {
    const shown = shownOf(
      screenAfter(readOf("coinflip-active", { ...FAILED, cancel: "ended" })),
    );
    expect(shown).toMatchObject({
      overlay: "none",
      playable: false,
      status: m["status.ended"],
    });
    expect(shown.controls).toContain(m["action.playAgain"]);
  });

  it.each([
    ["session-ended", "state.sessionEnded"],
    ["other-tab", "state.otherTab"],
    ["session-changed", "state.verificationFailed"],
  ] as const)(
    "%s: final, the frame hidden and the cover as the alert",
    (blocking, heading) => {
      const screen = screenAfter(readOf("coinflip-active", HELD));
      screen.app.block(blocking);
      const shown = shownOf(screen);
      expect(shown).toMatchObject({
        frameShown: false,
        playable: false,
        overlay: "cover",
        overlayText: m[heading],
        alertIn: "cover",
        status: "",
      });
    },
  );

  it("one alert region at a time: beside a cover shown as the alert, the bar's error is plain text, until the cover's state ends", () => {
    const screen = screenAfter(readOf("coinflip-active", FAILED));
    screen.app.accept({ kind: "network" }, "poll");
    expect(screen.host.querySelectorAll('[role="alert"]')).toHaveLength(1);
    let shown = shownOf(screen);
    expect(shown.alertIn).toBe("cover");
    expect(shown.alertLine).toContain(m["state.connection"]);
    // The bar's error keeps its icon, but not the alert's heading.
    const line = screen.host.querySelector(".se-alert");
    expect(line?.hasAttribute("role")).toBe(false);
    expect(line?.querySelector(".se-icon")).not.toBeNull();
    expect(line?.querySelector("#se-alert-heading")).toBeNull();
    // The round ends while the connection problem shows: the line takes it.
    screen.app.accept(
      {
        kind: "snapshot",
        snapshot: snapshotVector("coinflip-lost"),
        check: FAILED,
      },
      "poll",
    );
    screen.app.accept({ kind: "network" }, "poll");
    shown = shownOf(screen);
    expect(shown.alertIn).toBe("bar");
    expect(shown.alertLine).toContain(m["state.connection"]);
  });
});

/** An `active` round the shell holds and found ready, with `changes`. */
const activeReady = (changes: Partial<WrapperState> = {}): WrapperState => {
  const { blocking: _loading, ...base } = initialState;
  return {
    ...base,
    snapshot: snapshotVector("coinflip-active"),
    check: HELD,
    ...changes,
  };
};

describe("W-58's rule, as a pure function of the state (T-25)", () => {
  it.each([
    ["a connection problem", { connectionProblem: true, offline: true }],
    ["a typed error", { problem: { code: "UNAVAILABLE", retryable: true } }],
    ["the generic error", { refused: true as const }],
    ["the slow notice", { slow: true }],
    ["the development indicator", { chainNotIndependent: true }],
    ["a pending move", { check: { ...HELD, pending: "move" as const } }],
  ])("active and ready with %s: playable", (_, changes) => {
    expect(playable(activeReady(changes), false)).toBe(true);
  });

  it.each([
    ["a blocking state", { blocking: "out-of-sync" as const }],
    ["the verdict failed", { check: FAILED }],
    ["still checked", { check: { ...HELD, verdict: "checking" as const } }],
    ["out of sync", { check: { ...HELD, outOfSync: true } }],
    ["not confirmed", { check: { ...HELD, unconfirmed: "move" as const } }],
    ["a cancel", { check: { ...HELD, cancel: "in-flight" as const } }],
    ["not compatible", { gameIncompatible: true as const }],
    ["idle", { snapshot: snapshotVector("coinflip-idle") }],
    ["a result", { snapshot: snapshotVector("coinflip-won") }],
  ])("%s: inert", (_, changes) => {
    expect(playable(activeReady(changes), false)).toBe(false);
  });

  it("a round the shell does not hold: inert", () => {
    const { check: _held, ...notHeld } = activeReady();
    expect(playable(notHeld, false)).toBe(false);
  });

  it("a cash-out call in flight: inert", () => {
    expect(playable(activeReady(), true)).toBe(false);
    expect(stagePlan(m, activeReady(), true).inert).toBe(true);
  });
});
