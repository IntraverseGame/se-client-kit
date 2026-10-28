// T-23 (component, #146): the book round view (W-54 to W-56) and the changed
// session (W-53). Each status a book round shows (`idle`, `starting`, `won`
// with its payout as `formatted`, `lost`), the RTP line from `rtp.decimal` by
// string operations, polling only while `starting`, the game frame at `won`
// and `lost` until the next start and hidden otherwise, the notice in its
// place when the `playback` copy failed closed, and the final changed-session
// state with its lobby row (W-49f). The Snapshots are the vendored
// `book-playback-won-rtp` vector and the same round's earlier statuses built
// from it (the vendored set has no book `idle` or `starting` yet).

import { describe, expect, it } from "vitest";

import {
  allText,
  buttonNamed,
  linkNamed,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck, SnapshotInput } from "./round-input.ts";

const m = messagesFor("en").messages;

const WON = snapshotVector("book-playback-won-rtp");
const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

/** The book round at `status`, with the fields that status carries. */
const book = (
  status: "idle" | "starting" | "won" | "lost",
  version: number,
  roundId = WON.roundId,
): SnapshotInput => {
  const { roundId: _id, payout: _payout, ...rest } = WON;
  if (status === "idle") return { ...rest, status, version };
  if (status === "starting") {
    return {
      ...rest,
      status,
      version,
      ...(roundId === undefined ? {} : { roundId }),
    };
  }
  if (status === "lost") {
    return {
      ...WON,
      status,
      version,
      payout: { value: "0", decimals: 2, unit: "EUR", formatted: "€0.00" },
    };
  }
  return { ...WON, version };
};

const READY: RoundCheck = {
  verdict: "ready",
  outOfSync: false,
  cashOutOffered: false,
  cancel: "none",
};

/** The UI showing `snapshot` with the shell's `check` of its round. */
const shown = (snapshot: SnapshotInput, check: RoundCheck = READY) => {
  const ui = mount();
  ui.app.accept({ kind: "snapshot", snapshot, check }, "poll");
  return ui;
};

/** The UI showing `snapshot` of a round the shell does not hold (no check). */
const shownUnheld = (snapshot: SnapshotInput) => {
  const ui = mount();
  ui.app.accept({ kind: "snapshot", snapshot }, "poll");
  return ui;
};

const frameShown = (ui: ReturnType<typeof mount>): boolean =>
  !ui.app.gameHost().hidden;

const noticeShown = (ui: ReturnType<typeof mount>): boolean => {
  const notice = ui.host.querySelector<HTMLElement>(".se-notice--game");
  return notice !== null && !notice.hidden && notice.textContent !== "";
};

describe("the RTP (W-56)", () => {
  it("is shown beside the bet selector at idle, as the label catalog gives it", () => {
    const ui = shownUnheld(book("idle", 1));
    expect(statusHeading(ui.host)).toBe(m["status.idle"]);
    expect(allText(ui.host)).toContain("Return to player: 96.00%");
    expect(ui.host.querySelector(".se-bet legend")?.textContent).toBe(
      m["label.bet"],
    );
  });

  it("is shown beside the next bet after the result", () => {
    const ui = shown(book("won", 3));
    expect(allText(ui.host)).toContain("Return to player: 96.00%");
  });

  it("shows nothing, and no error, when the Snapshot carries no rtp", () => {
    const { rtp: _rtp, ...config } = WON.config;
    const ui = shownUnheld({ ...book("idle", 1), config });
    expect(allText(ui.host)).not.toContain("Return to player");
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toBe("");
  });

  it("is never shown for a steps round", () => {
    const steps = snapshotVector("coinflip-idle");
    const ui = shownUnheld({
      ...steps,
      config: { kind: "steps", rtp: { decimal: "0.9600" } },
    });
    expect(allText(ui.host)).not.toContain("Return to player");
  });
});

describe("what a book round shows (W-54)", () => {
  it("starting: preparing the round, and no game", () => {
    const ui = shown(book("starting", 2));
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
    expect(frameShown(ui)).toBe(false);
  });

  it("won: the result and the payout as formatted, never computed from the multiplier", () => {
    const ui = shown(book("won", 3));
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(allText(ui.host)).toContain(`${m["label.payout"]} €1.94`);
    // ×1.94 of the €1.00 bet would also read €1.94: the multiplier is the
    // game's display, so the Wrapper never shows it.
    expect(allText(ui.host)).not.toContain("1.94×");
    expect(allText(ui.host)).not.toContain("×1.94");
    expect(allText(ui.host)).toContain(ROUND_ID);
    expect(linkNamed(ui.host, m["action.verify"])).toBeDefined();
  });

  it("won: the payout is the Snapshot's, whatever the multiplier says", () => {
    const payout = {
      value: "777",
      decimals: 2,
      unit: "EUR",
      formatted: "€7.77",
    };
    const ui = shown({ ...book("won", 3), payout });
    expect(allText(ui.host)).toContain(`${m["label.payout"]} €7.77`);
    expect(allText(ui.host)).not.toContain("€1.94");
  });

  it("lost: the result, and no payout of 0", () => {
    const ui = shown(book("lost", 3));
    expect(statusHeading(ui.host)).toBe(m["status.lost"]);
    expect(allText(ui.host)).not.toContain(m["label.payout"]);
  });

  it("polls only while starting (W-35)", async () => {
    const ui = mount();
    ui.answers.push({
      kind: "snapshot",
      snapshot: book("starting", 2),
      check: READY,
    });
    ui.connect();
    await ui.settle();
    expect(ui.reads()).toBe(1);
    ui.answers.length = 0;
    ui.answers.push({
      kind: "snapshot",
      snapshot: book("won", 3),
      check: READY,
    });
    await ui.step(500);
    expect(ui.reads()).toBe(2);
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    await ui.step(10_000);
    expect(ui.reads()).toBe(2);
  });

  it("does not poll at idle", async () => {
    const ui = mount();
    ui.answers.push({ kind: "snapshot", snapshot: book("idle", 1) });
    ui.connect();
    await ui.settle();
    await ui.step(10_000);
    expect(ui.reads()).toBe(1);
  });
});

describe("the game frame on a book round (W-55)", () => {
  it.each(["idle", "starting"] as const)("is hidden at %s", status => {
    expect(frameShown(shown(book(status, 2)))).toBe(false);
  });

  it.each(["won", "lost"] as const)(
    "is shown at %s beside the result",
    status => {
      const ui = shown(book(status, 3));
      expect(frameShown(ui)).toBe(true);
      expect(noticeShown(ui)).toBe(false);
    },
  );

  it("is shown at a result the shell does not hold (a read after a reload)", () => {
    expect(frameShown(shownUnheld(book("won", 3)))).toBe(true);
  });

  it("stays with the result until the player starts the next round", () => {
    const ui = shown(book("won", 3));
    // A start that is refused keeps the result, and the game with it (W-40).
    ui.app.accept({ kind: "refused" }, "player");
    expect(frameShown(ui)).toBe(true);
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: book("starting", 4, "01927c5e-8b3a-7f21-9c4d-000000000002"),
        check: READY,
      },
      "player",
    );
    expect(frameShown(ui)).toBe(false);
  });

  it("is hidden on a changed round (W-52), which shows failed verification while it is not over", () => {
    const failed: RoundCheck = { ...READY, verdict: "verification-failed" };
    const won = shown(book("won", 3), failed);
    expect(frameShown(won)).toBe(false);
    const starting = shown(book("starting", 2), failed);
    expect(frameShown(starting)).toBe(false);
    expect(allText(starting.host)).toContain(m["state.verificationFailed"]);
  });

  it("is hidden in a blocking state", () => {
    const ui = shown(book("won", 3));
    ui.app.block("other-tab");
    expect(frameShown(ui)).toBe(false);
  });

  it("a playback copy that failed closed hides the frame and shows the notice until one succeeds", () => {
    const ui = shown(book("won", 3));
    ui.app.gameCopied(false);
    expect(frameShown(ui)).toBe(false);
    expect(noticeShown(ui)).toBe(true);
    expect(allText(ui.host)).toContain(m["notice.gameCantShow"]);
    // The Wrapper's own view stays: the result, the payout, the round id.
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(allText(ui.host)).toContain("€1.94");
    expect(allText(ui.host)).toContain(ROUND_ID);
    ui.app.gameCopied(true);
    expect(noticeShown(ui)).toBe(false);
    expect(frameShown(ui)).toBe(true);
  });

  it("the notice shows only beside a book round's result", () => {
    const ui = shown(book("starting", 2));
    ui.app.gameCopied(false);
    expect(noticeShown(ui)).toBe(false);
  });

  it("the notice follows the language rule (W-48): the fallback catalog for an unknown language", () => {
    const won = book("won", 3);
    const ui = shown({ ...won, context: { ...won.context, language: "xx" } });
    ui.app.gameCopied(false);
    expect(allText(ui.host)).toContain("The game can't show this round.");
  });
});

describe("a changed session (W-53)", () => {
  it("shows this round failed verification in place of the bet selector, final until a reload", async () => {
    const ui = mount();
    ui.answers.push({ kind: "snapshot", snapshot: book("idle", 1) });
    ui.connect();
    await ui.settle();
    ui.app.accept({ kind: "session-changed" }, "poll");
    expect(allText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(buttonNamed(ui.host, m["action.start"])).toBeUndefined();
    expect(frameShown(ui)).toBe(false);
    // Final: a later Snapshot does not replace it, and nothing is polled.
    ui.app.accept(
      { kind: "snapshot", snapshot: book("won", 3), check: READY },
      "poll",
    );
    expect(allText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(frameShown(ui)).toBe(false);
    const reads = ui.reads();
    await ui.step(60_000);
    expect(ui.reads()).toBe(reads);
  });

  it("offers the lobby from the latest validated Snapshot, and no deposit (W-49f)", () => {
    const ui = shown(book("won", 3));
    ui.app.accept({ kind: "session-changed" }, "poll");
    expect(linkNamed(ui.host, m["action.lobby"])).toBeDefined();
    expect(linkNamed(ui.host, m["action.deposit"])).toBeUndefined();
    // The round's panel goes with the round (a final state).
    expect(linkNamed(ui.host, m["action.verify"])).toBeUndefined();
  });
});
