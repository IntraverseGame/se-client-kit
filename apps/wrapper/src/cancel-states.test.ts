// The shell's required cancel in the Wrapper while it settles (W-25, W-26,
// W-33, W-35): the poll while the cancel is `settling`, also at `active` and
// through the round's failed state or a typed error; in `check-later` no fast
// poll, one background read every 30 s, and the player's "check again"; and the
// views: failed verification while it settles, "still resolving — contact
// support" with the round id, the verify link, and "check again" in
// `check-later`, and "this round failed verification and was canceled" for a
// final `canceled`. The session is a scripted stand-in
// (fixtures/fake-session.ts); the clock is the manual one.

import type { SessionRead } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { STATUS_HEADING_ID } from "./dom.ts";
import {
  alertText,
  allText,
  buttonNamed,
  linkNamed,
  liveText,
  statusHeading,
} from "./fixtures/app.ts";
import {
  canceledRead,
  failedWith,
  onCancel,
  readsOver,
  roundRead,
} from "./fixtures/cancel.ts";
import { snapshotRead } from "./fixtures/fake-session.ts";
import { ACTIVE, activeId, gameShown, round, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

describe("while the cancel settles (W-25, W-35)", () => {
  it("polls while settling, even at active, and shows the failed verification", async () => {
    const ui = await onCancel("settling");
    expect(await readsOver(ui, 4_000)).toBeGreaterThanOrEqual(3);
    expect(alertText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(allText(ui.host)).not.toContain(m["detail.canceled"]);
    expect(buttonNamed(ui.host, m["action.newRound"])).toBeUndefined();
    expect(gameShown(ui)).toBe(false);
  });

  it("does not poll an active round with no cancel, or one in flight", async () => {
    for (const cancel of ["none", "in-flight"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one UI at a time
      const ui = await onCancel(cancel);
      // oxlint-disable-next-line no-await-in-loop -- one UI at a time
      expect(await readsOver(ui, 10_000)).toBe(0);
    }
  });

  it("keeps polling through a resolving read, a typed error, and a read with no response", async () => {
    const ui = await onCancel("settling");
    ui.fake.reads.length = 0;
    ui.fake.reads.push(
      roundRead({ status: "resolving" }),
      {
        kind: "problem",
        problem: { code: "UNAVAILABLE", retryable: true },
      } as SessionRead,
      { kind: "network" },
      roundRead({ status: "resolving" }, 2),
    );
    // The four reads above run within 10 s; the poll goes on after them.
    expect(await readsOver(ui, 10_000)).toBeGreaterThanOrEqual(4);
    expect(await readsOver(ui, 6_000)).toBeGreaterThanOrEqual(2);
    expect(alertText(ui.host)).toContain(m["state.verificationFailed"]);
  });

  it("stops polling once the session ended", async () => {
    const ui = await onCancel("settling");
    ui.fake.endNow();
    expect(await readsOver(ui, 10_000)).toBe(0);
    expect(allText(ui.host)).toContain(m["state.sessionEnded"]);
  });

  it("shows a final canceled as failed verification and canceled (W-26)", async () => {
    const ui = await onCancel("settling");
    ui.fake.setRound(failedWith("sent"));
    ui.fake.reads.length = 0;
    ui.fake.reads.push(canceledRead());
    await ui.step(1_000);
    expect(statusHeading(ui.host)).toBe(m["status.canceled"]);
    expect(allText(ui.host)).toContain(m["detail.canceledUnverified"]);
    expect(allText(ui.host)).not.toContain(m["detail.canceled"]);
    expect(alertText(ui.host)).toBe("");
    expect(buttonNamed(ui.host, m["action.newRound"])).toBeDefined();
    expect(await readsOver(ui, 10_000)).toBe(0);
  });

  it("keeps a canceled round the shell did not cancel as returned", async () => {
    const ui = await wired(fake => {
      fake.reads.push(canceledRead());
      fake.setRound(round());
    });
    expect(allText(ui.host)).toContain(m["detail.canceled"]);
    expect(allText(ui.host)).not.toContain(m["detail.canceledUnverified"]);
  });
});

describe("check-later (W-33, W-35)", () => {
  it("shows still resolving with the round id, the verify link, and check again, and no result", async () => {
    const ui = await onCancel("check-later");
    expect(statusHeading(ui.host)).toBe(m["state.checkLater"]);
    expect(liveText(ui.host)).toBe(m["state.checkLater"]);
    expect(alertText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(allText(ui.host)).toContain(activeId);
    expect(linkNamed(ui.host, m["action.verify"])).toBeDefined();
    expect(buttonNamed(ui.host, m["action.checkAgain"])).toBeDefined();
    expect(buttonNamed(ui.host, m["action.newRound"])).toBeUndefined();
    expect(allText(ui.host)).not.toContain(m["detail.canceled"]);
    expect(gameShown(ui)).toBe(false);
  });

  it("stops the fast poll and reads once every 30 s in the background", async () => {
    const ui = await onCancel("check-later");
    expect(await readsOver(ui, 29_900)).toBe(0);
    expect(await readsOver(ui, 200)).toBe(1);
    ui.fake.reads.length = 0;
    ui.fake.reads.push({ kind: "network" });
    expect(await readsOver(ui, 60_000)).toBe(2);
    expect(allText(ui.host)).not.toContain(m["notice.slow"]);
  });

  it("goes from the fast poll to the background read when the cancel is checked later", async () => {
    const ui = await onCancel("settling");
    await ui.step(3_000);
    ui.fake.setRound(failedWith("check-later"));
    ui.fake.reads.length = 0;
    ui.fake.reads.push(snapshotRead(ACTIVE));
    // The fast read at 3.5 s reads `check-later`: the next is 30 s later.
    await ui.step(2_000);
    expect(statusHeading(ui.host)).toBe(m["state.checkLater"]);
    expect(await readsOver(ui, 28_000)).toBe(0);
    expect(await readsOver(ui, 1_000)).toBe(1);
  });

  it("reads once when the player checks again, and shows what settled it", async () => {
    const ui = await onCancel("check-later");
    ui.fake.setRound(failedWith("sent"));
    ui.fake.reads.length = 0;
    ui.fake.reads.push(canceledRead());
    buttonNamed(ui.host, m["action.checkAgain"])?.click();
    await ui.settle();
    expect(ui.fake.checks()).toBe(1);
    expect(allText(ui.host)).toContain(m["detail.canceledUnverified"]);
    // The player's own action moved focus to the result (W-46).
    const focused = globalThis.document.activeElement;
    expect(focused?.id).toBe(STATUS_HEADING_ID);
    expect(focused?.textContent).toContain(m["status.canceled"]);
  });
});
