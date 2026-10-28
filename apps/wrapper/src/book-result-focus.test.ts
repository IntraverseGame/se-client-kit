// T-23 (component, #146): what a book round's result adds to the Wrapper's
// rules. Focus (W-46, W-55; decided by the human, 2026-10-28): the result
// heading takes focus when a poll brings the result of the book round the
// player just started, and no other poll moves focus. A changed round (W-52)
// that is over shows its result with "This round failed verification." beside
// it, and a changed session (W-53) its detail line.

import { describe, expect, it } from "vitest";

import { allText, buttonNamed, mount } from "./fixtures/app.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type {
  RoundCheck,
  ShownAmount,
  SnapshotInput,
  SnapshotRead,
} from "./round-input.ts";

const m = messagesFor("en").messages;

const WON = snapshotVector("book-playback-won-rtp");
const { roundId: _id, payout: _payout, ...BEFORE } = WON;
const IDLE: SnapshotInput = { ...BEFORE, status: "idle", version: 1 };
const STARTING: SnapshotInput = {
  ...BEFORE,
  status: "starting",
  version: 2,
  roundId: "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d",
};

const READY: RoundCheck = {
  verdict: "ready",
  outOfSync: false,
  cashOutOffered: false,
  cancel: "none",
};

const read = (snapshot: SnapshotInput, check = READY): SnapshotRead => ({
  kind: "snapshot",
  snapshot,
  check,
});

/**
 * The UI at a book round's `idle`, connected with a start intent that answers
 * `answer` as the session would (the player's own action).
 */
const atIdle = async (answer: SnapshotRead) => {
  const ui = mount();
  const reads: SnapshotRead[] = [{ kind: "snapshot", snapshot: IDLE }];
  ui.app.connect({
    readSnapshot: () =>
      Promise.resolve(
        (reads.length > 1 ? reads.shift() : reads[0]) ?? { kind: "network" },
      ),
    intents: {
      start: (_bet: ShownAmount): void => {
        ui.app.accept(answer, "player");
      },
    },
  });
  await ui.settle();
  return { ui, reads };
};

const focusedHeading = (): string | undefined =>
  document.activeElement?.tagName === "H1"
    ? (document.activeElement.textContent ?? undefined)
    : undefined;

describe("focus on a book round's result (W-46, W-55)", () => {
  it("the poll that brings the result of the round the player started takes focus", async () => {
    const { ui, reads } = await atIdle(read(STARTING));
    buttonNamed(ui.host, m["action.start"])?.click();
    expect(focusedHeading()).toBeUndefined();
    reads.length = 0;
    reads.push(read(WON));
    await ui.step(500);
    expect(focusedHeading()).toBe(m["status.won"]);
  });

  it("a poll that shows a result the player did not start moves no focus", () => {
    const ui = mount();
    ui.app.accept(read(STARTING), "poll");
    ui.app.accept(read(WON), "poll");
    expect(focusedHeading()).toBeUndefined();
  });

  it("takes focus once: a later poll of the same result moves none", async () => {
    const { ui, reads } = await atIdle(read(STARTING));
    buttonNamed(ui.host, m["action.start"])?.click();
    reads.length = 0;
    reads.push(read(WON));
    await ui.step(500);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    ui.app.accept(read({ ...WON, version: 4 }), "poll");
    expect(document.activeElement).toBe(outside);
  });

  it("a start that is refused leaves the next poll's result without focus", async () => {
    const { ui } = await atIdle({ kind: "refused" });
    buttonNamed(ui.host, m["action.start"])?.click();
    ui.app.accept(read(STARTING), "poll");
    ui.app.accept(read(WON), "poll");
    expect(focusedHeading()).toBeUndefined();
  });
});

describe("a changed round that is over (W-52, W-54)", () => {
  it("shows the result with the failure beside it", () => {
    const ui = mount();
    ui.app.accept(
      read(WON, { ...READY, verdict: "verification-failed" }),
      "poll",
    );
    expect(allText(ui.host)).toContain(m["status.won"]);
    expect(allText(ui.host)).toContain("This round failed verification.");
    expect(allText(ui.host)).toContain("€1.94");
    expect(ui.app.gameHost().hidden).toBe(true);
  });

  it("a round that did not change shows no such line", () => {
    const ui = mount();
    ui.app.accept(read(WON), "poll");
    expect(allText(ui.host)).not.toContain(m["detail.unverified"]);
  });
});

describe("a changed session (W-53)", () => {
  it("says the game changed and to reload, under the failure heading", () => {
    const ui = mount();
    ui.app.accept({ kind: "snapshot", snapshot: IDLE }, "poll");
    ui.app.accept({ kind: "session-changed" }, "poll");
    expect(allText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(allText(ui.host)).toContain(
      "The game changed during this session. Reload to continue.",
    );
  });
});
