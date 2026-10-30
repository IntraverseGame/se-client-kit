// W-29, W-35: a Snapshot dropped for a lower `version` where no poll runs is
// read again: a move's result to an `active` round, and the start's `starting`
// from an ended round. The re-reads come at W-35's backoff (500 ms, 1 s, 2 s,
// 2 s), then one every 30 s, until a read is taken; an equal `version` starts
// none; a typed error stops them; the shell's cancel reads (`check-later`)
// are left alone; they move no focus and show no notice. The session is a
// scripted stand-in (fixtures/fake-session.ts); the clock is the manual one.

import type { SessionRead, ValidSnapshot } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { STATUS_HEADING_ID } from "./dom.ts";
import {
  alertText,
  allText,
  buttonNamed,
  statusHeading,
} from "./fixtures/app.ts";
import { active, onCancel, readsOver } from "./fixtures/cancel.ts";
import { validSnapshot } from "./fixtures/fake-session.ts";
import { at, lowerLoss, onActive } from "./fixtures/reread.ts";
import { round, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

describe("re-reading a Snapshot dropped for a lower version (W-29, W-35)", () => {
  it("reads a move's dropped result again, and shows the read it takes", async () => {
    const ui = await onActive();
    ui.fake.reads.length = 0;
    ui.fake.reads.push(at("coinflip-lost", active.version + 2));
    ui.fake.change(lowerLoss);
    await ui.settle();
    // W-29: the lower one is never shown.
    expect(statusHeading(ui.host)).toBe(m["status.active"]);
    // The manual clock moves in 100 ms steps.
    expect(await readsOver(ui, 400)).toBe(0);
    expect(await readsOver(ui, 100)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.lost"]);
    // Cause `"poll"`: the focus does not move (W-46), and no notice shows.
    expect(globalThis.document.activeElement?.id).not.toBe(STATUS_HEADING_ID);
    expect(allText(ui.host)).not.toContain(m["notice.slow"]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("reads four times at the backoff, then once every 30 s, with no notice", async () => {
    const ui = await onActive();
    ui.fake.reads.length = 0;
    ui.fake.reads.push(lowerLoss);
    ui.fake.change(lowerLoss);
    await ui.settle();
    expect(await readsOver(ui, 500)).toBe(1);
    expect(await readsOver(ui, 1_000)).toBe(1);
    expect(await readsOver(ui, 2_000)).toBe(1);
    expect(await readsOver(ui, 2_000)).toBe(1);
    expect(await readsOver(ui, 29_900)).toBe(0);
    expect(await readsOver(ui, 100)).toBe(1);
    expect(await readsOver(ui, 30_000)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.active"]);
    expect(allText(ui.host)).not.toContain(m["notice.slow"]);
    // A read taken at last ends them.
    ui.fake.reads.length = 0;
    ui.fake.reads.push(at("coinflip-lost", active.version + 2));
    expect(await readsOver(ui, 30_000)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.lost"]);
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("waits the slow rate after a read with no response, and goes on", async () => {
    const ui = await onActive();
    ui.fake.reads.length = 0;
    ui.fake.reads.push(
      { kind: "network" },
      at("coinflip-lost", active.version + 2),
    );
    ui.fake.change(lowerLoss);
    await ui.settle();
    expect(await readsOver(ui, 500)).toBe(1);
    expect(await readsOver(ui, 1_900)).toBe(0);
    expect(await readsOver(ui, 100)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.lost"]);
  });

  it("starts no re-read for an equal version", async () => {
    const ui = await onActive();
    ui.fake.change(at("coinflip-lost", active.version));
    await ui.settle();
    expect(await readsOver(ui, 60_000)).toBe(0);
    expect(statusHeading(ui.host)).toBe(m["status.active"]);
  });

  it("stops on a typed error, which shows", async () => {
    const ui = await onActive();
    ui.fake.reads.length = 0;
    ui.fake.reads.push({
      kind: "problem",
      problem: { code: "UNAVAILABLE", retryable: true },
    } as SessionRead);
    ui.fake.change(lowerLoss);
    await ui.settle();
    expect(await readsOver(ui, 500)).toBe(1);
    expect(alertText(ui.host)).not.toBe("");
    expect(await readsOver(ui, 60_000)).toBe(0);
  });

  it("reads the start's dropped starting again from an ended round", async () => {
    const won = at("coinflip-won", active.version + 2);
    const next = "01927c5e-8b3a-7f21-9c4d-000000000007";
    const starting = (version: number): SessionRead => ({
      kind: "snapshot",
      snapshot: {
        ...validSnapshot("coinflip-starting"),
        roundId: next,
        version,
      } as ValidSnapshot,
    });
    const ui = await wired(fake => {
      fake.reads.push(won);
      fake.setRound(round());
    });
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    ui.fake.answerStart(starting(active.version));
    ui.fake.reads.length = 0;
    ui.fake.reads.push(starting(active.version + 3));
    buttonNamed(ui.host, m["action.playAgain"])?.click();
    await ui.settle();
    expect(ui.fake.starts).toHaveLength(1);
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(await readsOver(ui, 500)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
  });

  it("leaves the cancel's own reads alone in check-later", async () => {
    const ui = await onCancel("check-later");
    ui.fake.change(at("coinflip-resolving", active.version - 1));
    await ui.settle();
    expect(await readsOver(ui, 29_900)).toBe(0);
  });
});
