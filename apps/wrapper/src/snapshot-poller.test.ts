// W-35 and W-43: polling while `starting` or `resolving`, with bounded backoff
// (500 ms rising to 2 s), the slow rate and the "taking longer" notice after a
// longer wait, the slow rate after a read with no response, and a stop at any
// other status or when stopped. The clock is the manual one; nothing waits.

import { describe, expect, it } from "vitest";

import { flush, stepTimers } from "./fixtures/flush.ts";
import { manualTimers } from "./fixtures/manual-timers.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import type { RoundStatus, SnapshotRead } from "./round-input.ts";
import {
  createSnapshotPoller,
  DEFAULT_POLL_CONFIG,
} from "./snapshot-poller.ts";

/** Lets the poller's awaited read settle. */
const settle = (): Promise<void> => flush();

type Harness = {
  readonly timers: ReturnType<typeof manualTimers>;
  readonly poller: ReturnType<typeof createSnapshotPoller>;
  /** The time of each read, relative to the start. */
  readonly reads: number[];
  readonly slow: number[];
  /** What the next reads answer (the last one repeats). */
  readonly answers: SnapshotRead[];
  readonly step: (ms: number) => Promise<void>;
};

const harness = (onRead?: (read: SnapshotRead) => void): Harness => {
  const timers = manualTimers();
  const reads: number[] = [];
  const slow: number[] = [];
  const answers: SnapshotRead[] = [{ kind: "rejected" }];
  const poller = createSnapshotPoller({
    read: () => {
      reads.push(timers.now());
      return Promise.resolve(
        answers.length > 1
          ? (answers.shift() ?? { kind: "rejected" })
          : (answers[0] ?? { kind: "rejected" }),
      );
    },
    timers,
    onRead: read => onRead?.(read),
    onSlow: () => {
      slow.push(timers.now());
    },
  });
  const step = (ms: number): Promise<void> => stepTimers(timers, ms);
  return { timers, poller, reads, slow, answers, step };
};

const statusOf = (
  read: SnapshotRead,
): { readonly status: RoundStatus } | undefined =>
  read.kind === "snapshot" ? { status: read.snapshot.status } : undefined;

/** The reads after the first notice. */
const after = (
  reads: readonly number[],
  notices: readonly number[],
): number[] =>
  reads.filter(time => time > (notices[0] ?? Number.POSITIVE_INFINITY));

const intervals = (times: readonly number[]): number[] =>
  times.slice(1).map((time, i) => time - (times[i] ?? 0));

describe("the Snapshot poller (W-35)", () => {
  it("has the spec's default rates", () => {
    expect(DEFAULT_POLL_CONFIG.initialDelayMs).toBe(500);
    expect(DEFAULT_POLL_CONFIG.slowDelayMs).toBe(2_000);
    expect(DEFAULT_POLL_CONFIG.checkLaterDelayMs).toBe(30_000);
  });

  it("backs off from 500 ms to 2 s while starting", async () => {
    const h = harness();
    h.poller.follow({ status: "starting" });
    await h.step(10_000);
    expect(h.reads[0]).toBe(500);
    expect(intervals(h.reads).slice(0, 5)).toEqual([
      1_000, 2_000, 2_000, 2_000, 2_000,
    ]);
  });

  it.each<RoundStatus>(["idle", "active", "won", "lost", "canceled"])(
    "does not poll in %s",
    async status => {
      const h = harness();
      h.poller.follow({ status });
      await h.step(10_000);
      expect(h.reads).toEqual([]);
      expect(h.poller.running()).toBe(false);
    },
  );

  it("stops when the status leaves the polled ones", async () => {
    const h = harness(read => {
      h.poller.follow(statusOf(read));
    });
    h.answers.splice(0, 1, {
      kind: "snapshot",
      snapshot: snapshotVector("coinflip-won"),
    });
    h.poller.follow({ status: "resolving" });
    await h.step(10_000);
    expect(h.reads).toEqual([500]);
    expect(h.poller.running()).toBe(false);
    expect(h.timers.pendingDelays()).toEqual([]);
  });

  it("restarts the backoff when the status changes", async () => {
    const h = harness();
    h.poller.follow({ status: "starting" });
    await h.step(4_000);
    h.poller.follow({ status: "resolving" });
    const before = h.reads.length;
    await h.step(600);
    expect(h.reads.length).toBe(before + 1);
  });

  it("shows the notice after a longer wait and keeps the slow rate", async () => {
    const h = harness();
    h.poller.follow({ status: "starting" });
    await h.step(30_000);
    expect(h.slow).toHaveLength(1);
    expect(h.slow[0]).toBeGreaterThanOrEqual(
      DEFAULT_POLL_CONFIG.slowNoticeAfterMs,
    );
    const late = after(h.reads, h.slow);
    expect(new Set(intervals(late))).toEqual(new Set([2_000]));
    expect(h.poller.running()).toBe(true);
  });

  it("reads at the slow rate after a read with no response (W-43)", async () => {
    const h = harness();
    h.answers.splice(0, 1, { kind: "network" });
    h.poller.follow({ status: "starting" });
    await h.step(5_000);
    expect(intervals(h.reads)).toEqual([2_000, 2_000]);
  });

  it("treats a read that throws as no response", async () => {
    const timers = manualTimers();
    const results: SnapshotRead[] = [];
    const poller = createSnapshotPoller({
      read: () => {
        throw new Error("port failed");
      },
      timers,
      onRead: read => results.push(read),
      onSlow: () => {},
    });
    poller.follow({ status: "starting" });
    timers.advance(500);
    await settle();
    expect(results).toEqual([{ kind: "network" }]);
  });

  it("reads at once on pollNow, and never two reads at a time", async () => {
    const timers = manualTimers();
    let release: ((read: SnapshotRead) => void) | undefined;
    let calls = 0;
    const poller = createSnapshotPoller({
      read: () => {
        calls += 1;
        return new Promise<SnapshotRead>(resolve => {
          release = resolve;
        });
      },
      timers,
      onRead: () => {},
      onSlow: () => {},
    });
    poller.follow({ status: "starting" });
    poller.pollNow();
    timers.advance(0);
    expect(calls).toBe(1);
    poller.pollNow();
    timers.advance(10_000);
    expect(calls).toBe(1);
    release?.({ kind: "network" });
    await settle();
    timers.advance(2_000);
    expect(calls).toBe(2);
  });

  it("drops the answer of a read in flight when stopped", async () => {
    const timers = manualTimers();
    let release: ((read: SnapshotRead) => void) | undefined;
    const results: SnapshotRead[] = [];
    const poller = createSnapshotPoller({
      read: () =>
        new Promise<SnapshotRead>(resolve => {
          release = resolve;
        }),
      timers,
      onRead: read => results.push(read),
      onSlow: () => {},
    });
    poller.follow({ status: "resolving" });
    timers.advance(500);
    poller.stop();
    release?.({ kind: "network" });
    await settle();
    expect(results).toEqual([]);
    expect(timers.pendingDelays()).toEqual([]);
  });
});

describe("the Snapshot poller with the shell's cancel (W-25, W-35)", () => {
  it("polls while the cancel is settling, even at active, with the backoff", async () => {
    const h = harness();
    h.poller.follow({ status: "active" }, "settling");
    await h.step(4_000);
    expect(h.reads.slice(0, 3)).toEqual([500, 1_500, 3_500]);
    expect(h.poller.running()).toBe(true);
  });

  it("does not poll an active round without a settling cancel", async () => {
    const h = harness();
    h.poller.follow({ status: "active" });
    h.poller.follow({ status: "active" }, "in-flight");
    await h.step(10_000);
    expect(h.reads).toEqual([]);
    expect(h.poller.running()).toBe(false);
  });

  it("in check-later reads once every 30 s, with no notice, also after no response", async () => {
    const h = harness();
    h.answers.splice(0, 1, { kind: "network" });
    h.poller.follow({ status: "resolving" }, "check-later");
    await h.step(95_000);
    expect(h.reads).toEqual([30_000, 60_000, 90_000]);
    expect(h.slow).toEqual([]);
  });

  it("goes from the fast poll to the background read when check-later follows", async () => {
    const h = harness();
    h.poller.follow({ status: "active" }, "settling");
    await h.step(2_000);
    expect(h.reads).toEqual([500, 1_500]);
    h.poller.follow({ status: "active" }, "check-later");
    await h.step(40_000);
    expect(h.reads).toEqual([500, 1_500, 32_000]);
  });

  it.each(["ended", "not-taken", "sent"] as const)(
    "stops once the cancel is %s, also at resolving",
    async cancel => {
      const h = harness();
      h.poller.follow({ status: "resolving" }, "settling");
      await h.step(1_000);
      h.poller.follow({ status: "resolving" }, cancel);
      const reads = h.reads.length;
      await h.step(10_000);
      expect(h.reads).toHaveLength(reads);
      expect(h.poller.running()).toBe(false);
    },
  );
});
