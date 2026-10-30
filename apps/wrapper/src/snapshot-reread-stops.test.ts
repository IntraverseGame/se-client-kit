// W-35's stop rules for the re-read after a drop (W-29): a blocking state, the
// session's end, or a poll starting cancels the re-reads at once, with no
// timer left; `dispose` cancels one pending or in flight; the one read after
// the shell's cancel `ended` stays the only read even when it is dropped; and
// a drop that comes from a poll, or from a read the Wrapper made, is handled
// like an action's answer: a poll keeps reading on its own schedule, and a
// read the Wrapper made with no poll running is read again.

import type { SessionRead, ValidSnapshot } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import {
  buttonNamed,
  coverHeading,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import { active, failedWith, readsOver } from "./fixtures/cancel.ts";
import { snapshotRead, validSnapshot } from "./fixtures/fake-session.ts";
import { at, lowerLoss, onActive } from "./fixtures/reread.ts";
import { ACTIVE, round, type Wired, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

/** The UI on the `active` round, a move's answer dropped: one re-read waits. */
const dropped = async (): Promise<Wired> => {
  const ui = await onActive();
  ui.fake.reads.length = 0;
  ui.fake.reads.push(lowerLoss);
  ui.fake.change(lowerLoss);
  await ui.settle();
  expect(ui.timers.pendingDelays()).toEqual([500]);
  return ui;
};

const ignore = (): void => {};

/** A read port that answers `first`, then holds every later read. */
const heldPort = (first: SessionRead) => {
  let reads = 0;
  let release: (read: SessionRead) => void = ignore;
  return {
    read: (): Promise<SessionRead> => {
      reads += 1;
      if (reads === 1) return Promise.resolve(first);
      return new Promise(resolve => {
        release = resolve;
      });
    },
    reads: (): number => reads,
    release: (read: SessionRead): void => {
      release(read);
    },
  };
};

describe("the re-reads stop at once (W-35)", () => {
  it("on a blocking state, with no timer left", async () => {
    const ui = await dropped();
    ui.app.block("out-of-sync");
    expect(ui.timers.pendingDelays()).toEqual([]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("on the session's end, with no timer left", async () => {
    const ui = await dropped();
    ui.fake.endNow();
    ui.app.block("session-ended");
    expect(ui.timers.pendingDelays()).toEqual([]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("when a poll starts, which reads on its own schedule", async () => {
    const ui = await dropped();
    ui.fake.reads.length = 0;
    ui.fake.reads.push(at("coinflip-resolving", active.version + 1));
    ui.fake.change(at("coinflip-resolving", active.version + 1));
    await ui.settle();
    expect(statusHeading(ui.host)).toBe(m["status.resolving"]);
    // Only the poll's own timer is left (W-35: 500 ms first).
    expect(ui.timers.pendingDelays()).toEqual([500]);
    expect(await readsOver(ui, 500)).toBe(1);
  });

  it("on dispose with a re-read pending", async () => {
    const ui = await dropped();
    ui.app.dispose();
    expect(ui.timers.pendingDelays()).toEqual([]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("on dispose with a re-read in flight, whose answer is not applied", async () => {
    const ui = mount();
    const port = heldPort({ kind: "snapshot", snapshot: active });
    ui.app.connect({ readSnapshot: port.read });
    await ui.settle();
    ui.app.accept(lowerLoss, "player");
    await ui.step(500);
    expect(port.reads()).toBe(2);
    ui.app.dispose();
    port.release(at("coinflip-lost", active.version + 2));
    await ui.settle();
    // Still the `active` round (no shell holds it here, W-57), not the loss.
    expect(coverHeading(ui.host)).toBe(m["state.notHeld"]);
    expect(ui.timers.pendingDelays()).toEqual([]);
  });
});

describe("where a dropped read comes from", () => {
  it("leaves the one read after ended the only one, even dropped", async () => {
    const lowerIdle = {
      kind: "snapshot",
      snapshot: {
        ...validSnapshot("coinflip-idle"),
        version: active.version - 1,
      } as ValidSnapshot,
    } as const;
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE), lowerIdle);
      fake.setRound(failedWith("ended"));
    });
    expect(ui.fake.served()).toBe(2);
    expect(statusHeading(ui.host)).toBe(m["status.ended"]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("leaves a poll's dropped read to the poll: no read on top of it", async () => {
    const ui = await wired(fake => {
      fake.reads.push(
        at("coinflip-resolving", active.version + 1),
        at("coinflip-resolving", active.version - 1),
        at("coinflip-lost", active.version + 2),
      );
      fake.setRound(round());
    });
    expect(statusHeading(ui.host)).toBe(m["status.resolving"]);
    // The poll's 500 ms read is dropped; its next, 1 s later, is taken.
    expect(await readsOver(ui, 500)).toBe(1);
    expect(ui.timers.pendingDelays()).toEqual([1_000]);
    expect(await readsOver(ui, 1_000)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.lost"]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("reads again after a read the Wrapper made (try again) is dropped", async () => {
    const ui = await onActive();
    ui.fake.change({
      kind: "problem",
      problem: { code: "UNAVAILABLE", retryable: true },
    } as SessionRead);
    await ui.settle();
    ui.fake.reads.length = 0;
    ui.fake.reads.push(lowerLoss, at("coinflip-lost", active.version + 2));
    buttonNamed(ui.host, m["action.retry"])?.click();
    await ui.settle();
    expect(ui.timers.pendingDelays()).toEqual([500]);
    expect(await readsOver(ui, 500)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.lost"]);
  });
});
