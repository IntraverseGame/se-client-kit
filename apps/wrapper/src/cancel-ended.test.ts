// The shell's required cancel in the Wrapper once it settled (W-25, W-33,
// W-35): a neutral "round ended" with the round id, the verify link, and the
// next bet (W-31) once it is `ended`, then exactly one read for the current
// balance (a failed one keeps the round's balance, with no error state); no
// poll once it is `ended`, `not-taken`, or `sent`; and whether the round is
// over with the cancel. The session is a scripted stand-in
// (fixtures/fake-session.ts); the clock is the manual one.

import type { SessionRead, ValidSnapshot } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { STATUS_HEADING_ID } from "./dom.ts";
import {
  alertText,
  allText,
  buttonNamed,
  linkNamed,
  statusHeading,
} from "./fixtures/app.ts";
import {
  active,
  failedWith,
  onCancel,
  readsOver,
  roundRead,
} from "./fixtures/cancel.ts";
import { snapshotRead, validSnapshot } from "./fixtures/fake-session.ts";
import { ACTIVE, activeId, gameShown, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";
import { roundEnded } from "./round-input.ts";

const m = messagesFor("en").messages;

describe("ended (W-25, W-33)", () => {
  it("shows a neutral round ended with the round id, the verify link, and the next bet", async () => {
    const ui = await onCancel("ended");
    expect(statusHeading(ui.host)).toBe(m["status.ended"]);
    expect(alertText(ui.host)).toBe("");
    expect(allText(ui.host)).toContain(activeId);
    expect(linkNamed(ui.host, m["action.verify"])).toBeDefined();
    expect(buttonNamed(ui.host, m["action.start"])).toBeDefined();
    expect(
      ui.host.querySelectorAll('.se-status input[type="radio"]').length,
    ).toBeGreaterThan(0);
    for (const claim of [
      m["status.won"],
      m["status.lost"],
      m["detail.canceled"],
      m["status.active"],
    ]) {
      expect(allText(ui.host)).not.toContain(claim);
    }
    expect(buttonNamed(ui.host, m["action.cashOut"])).toBeUndefined();
    expect(gameShown(ui)).toBe(false);
  });

  it("moves focus to round ended when the player's check again ended it", async () => {
    const ui = await onCancel("check-later");
    ui.fake.setRound(failedWith("ended"));
    buttonNamed(ui.host, m["action.checkAgain"])?.click();
    await ui.settle();
    expect(statusHeading(ui.host)).toBe(m["status.ended"]);
    const focused = globalThis.document.activeElement;
    expect(focused?.id).toBe(STATUS_HEADING_ID);
    expect(focused?.textContent).toContain(m["status.ended"]);
  });

  it("ends from settling on the same Snapshot, and stops polling", async () => {
    const ui = await onCancel("settling", roundRead({ status: "resolving" }));
    ui.fake.setRound(failedWith("ended"));
    await ui.step(1_000);
    expect(statusHeading(ui.host)).toBe(m["status.ended"]);
    expect(await readsOver(ui, 10_000)).toBe(0);
  });

  it("reads once after ended and shows that read's balance, with the next bet", async () => {
    const idle = validSnapshot("coinflip-idle");
    const current = "42.00 TEST";
    expect(active.bet.balance.formatted).not.toBe(current);
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE), {
        kind: "snapshot",
        snapshot: {
          ...idle,
          version: active.version + 5,
          bet: {
            ...idle.bet,
            balance: { ...idle.bet.balance, formatted: current },
          },
        } as ValidSnapshot,
      });
      fake.setRound(failedWith("ended"));
    });
    // The read that showed the cancel ended, then one more.
    expect(ui.fake.served()).toBe(2);
    expect(statusHeading(ui.host)).toBe(m["status.ended"]);
    expect(allText(ui.host)).toContain(current);
    expect(allText(ui.host)).not.toContain(active.bet.balance.formatted);
    expect(allText(ui.host)).toContain(activeId);
    expect(await readsOver(ui, 60_000)).toBe(0);
    // Still "round ended", with the bet selector of that read's `bet`.
    expect(statusHeading(ui.host)).toBe(m["status.ended"]);
    expect(buttonNamed(ui.host, m["action.start"])).toBeDefined();
  });

  it.each<[string, SessionRead]>([
    ["no response", { kind: "network" }],
    [
      "a typed error",
      {
        kind: "problem",
        problem: { code: "UNAVAILABLE", retryable: true },
      } as SessionRead,
    ],
    ["a rejected answer", { kind: "rejected" }],
  ])(
    "keeps the round's balance, with no error state, when the read after ended gets %s",
    async (_what, failed) => {
      const ui = await wired(fake => {
        fake.reads.push(snapshotRead(ACTIVE), failed);
        fake.setRound(failedWith("ended"));
      });
      expect(ui.fake.served()).toBe(2);
      expect(statusHeading(ui.host)).toBe(m["status.ended"]);
      expect(alertText(ui.host)).toBe("");
      expect(allText(ui.host)).toContain(active.bet.balance.formatted);
      expect(await readsOver(ui, 60_000)).toBe(0);
    },
  );

  it.each(["none", "not-taken", "sent"] as const)(
    "reads nothing more for a round whose cancel is %s",
    async cancel => {
      const ui = await onCancel(cancel);
      expect(ui.fake.served()).toBe(1);
    },
  );

  it("shows the session's end when it answers the read after ended", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE), { kind: "session-ended" });
      fake.setRound(failedWith("ended"));
    });
    expect(ui.fake.served()).toBe(2);
    expect(allText(ui.host)).toContain(m["state.sessionEnded"]);
  });

  it("lets the player start the next round from round ended", async () => {
    const ui = await onCancel("ended");
    const starting = {
      ...validSnapshot("coinflip-starting"),
      version: active.version + 5,
      roundId: "01927c5e-8b3a-7f21-9c4d-000000000004",
    } as ValidSnapshot;
    ui.fake.answerStart({ kind: "snapshot", snapshot: starting });
    buttonNamed(ui.host, m["action.start"])?.click();
    await ui.settle();
    expect(ui.fake.starts).toHaveLength(1);
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
    expect(allText(ui.host)).not.toContain(activeId);
  });
});

describe("not-taken and sent stop the poll (W-35)", () => {
  it.each(["not-taken", "sent"] as const)(
    "%s does not poll, also at resolving",
    async cancel => {
      const ui = await onCancel(cancel, roundRead({ status: "resolving" }));
      expect(await readsOver(ui, 10_000)).toBe(0);
    },
  );

  it("not-taken shows the failed verification", async () => {
    const ui = await onCancel("not-taken");
    expect(alertText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(statusHeading(ui.host)).toBe("");
  });
});

describe("whether the round is over, with the cancel (W-25)", () => {
  it.each(["in-flight", "settling", "check-later"] as const)(
    "a result is not over while the cancel is %s",
    cancel => {
      expect(roundEnded({ status: "canceled" }, cancel)).toBe(false);
      expect(roundEnded({ status: "won" }, cancel)).toBe(false);
    },
  );

  it("ended is over at any status, and otherwise the status decides", () => {
    expect(roundEnded({ status: "resolving" }, "ended")).toBe(true);
    expect(roundEnded({ status: "active" }, "ended")).toBe(true);
    expect(roundEnded({ status: "canceled" }, "sent")).toBe(true);
    expect(roundEnded({ status: "active" }, "not-taken")).toBe(false);
    expect(roundEnded({ status: "lost" })).toBe(true);
  });
});
