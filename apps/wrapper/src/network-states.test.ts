// T-15 at the component level (W-35, W-43): a request with no response shows
// the connection-problem state without losing the round, the offline notice
// when the browser reports it, polling at the slow rate, a Snapshot read
// first when the connection returns, the "taking longer" notice, and the stop
// at a terminal status. The browser run with a cut network is in the e2e
// suite.

import { describe, expect, it } from "vitest";

import {
  alertText,
  allText,
  coverHeading,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

describe("network failure (W-43, T-15)", () => {
  it("shows the connection problem without losing the round", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-resolving") },
      "poll",
    );
    ui.app.accept({ kind: "network" }, "poll");
    expect(alertText(ui.host)).toContain(m["state.connection"]);
    expect(statusHeading(ui.host)).toBe(m["status.resolving"]);
  });

  it("says so when the browser reports being offline", () => {
    const ui = mount();
    ui.app.accept({ kind: "network" }, "poll");
    ui.setOnline(false);
    expect(alertText(ui.host)).toContain(m["state.offline"]);
  });

  it("keeps polling at the slow rate, then reads first when back online", async () => {
    const ui = mount();
    ui.answers.push(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-starting") },
      { kind: "network" },
    );
    ui.connect();
    await ui.settle();
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
    ui.setOnline(false);
    await ui.step(500);
    expect(alertText(ui.host)).toContain(m["state.connection"]);
    const offlineReads = ui.reads();
    await ui.step(4_000);
    expect(ui.reads() - offlineReads).toBe(2);
    ui.answers.splice(0, ui.answers.length, {
      kind: "snapshot",
      snapshot: snapshotVector("coinflip-active"),
    });
    ui.setOnline(true);
    await ui.step(100);
    // The read is shown: an `active` round no shell holds here (W-57).
    expect(coverHeading(ui.host)).toBe(m["state.notHeld"]);
    expect(alertText(ui.host)).toBe("");
  });

  it("shows the taking-longer notice after a long wait (W-35)", async () => {
    const ui = mount();
    ui.answers.push({
      kind: "snapshot",
      snapshot: snapshotVector("coinflip-starting"),
    });
    ui.connect();
    await ui.step(20_000);
    expect(allText(ui.host)).toContain(m["notice.slow"]);
  });

  it("stops polling at a terminal status", async () => {
    const ui = mount();
    ui.answers.push(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-resolving") },
      { kind: "snapshot", snapshot: snapshotVector("coinflip-won") },
    );
    ui.connect();
    await ui.step(10_000);
    expect(ui.reads()).toBe(2);
    expect(ui.timers.pendingDelays()).toEqual([]);
  });
});
