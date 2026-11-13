// Autoplay's run (RFC-005 section 6, W-61, T-31): book rounds only; each start
// copies its bet from the latest Snapshot; the next start only after the
// previous result and the interval; every stop rule; nothing sent once
// stopped. The ports are fakes: a manual timer, scripted starts, and the
// session's latest Snapshot set by the test.

import { describe, expect, it } from "vitest";

import type { AutoplayStop } from "./autoplay-types.ts";
import {
  BET,
  book,
  harness,
  playRound,
  read,
  REQUEST,
  stopped,
} from "./fixtures/autoplay.ts";
import { bookInput, bookSnapshot } from "./fixtures/book.ts";
import { OTHER_ROUND_ID, snapshot, validated } from "./fixtures/vectors.ts";
import type { SessionRead } from "./session-types.ts";

describe("autoplay's run (RFC-005, W-61)", () => {
  it("plays the count, each start after the result and the interval", async () => {
    const h = harness();
    expect(h.run.begin(REQUEST)).toEqual({ ok: true });
    expect(h.starts).toHaveLength(1);
    expect(h.run.state()).toEqual({ kind: "running", count: 3, left: 2 });
    await playRound(h, 2);
    expect(h.timers.map(timer => timer.ms)).toEqual([2500]);
    expect(h.starts).toHaveLength(1);
    h.fire();
    expect(h.starts).toHaveLength(2);
    await playRound(h, 4, "lost");
    h.fire();
    await playRound(h, 6);
    expect(h.starts).toHaveLength(3);
    expect(h.run.state()).toEqual({
      kind: "stopped",
      reason: "count",
      started: 3,
    });
    expect(h.timers).toEqual([]);
    expect(h.answers.map(answer => answer.kind)).toEqual([
      "snapshot",
      "snapshot",
      "snapshot",
    ]);
  });

  it("arms one timer, from the start's own round only, after its real result", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    // While the start is in flight, a read of the previous round's result
    // lands: it names no round of the run and arms nothing.
    h.run.see(
      read(
        validated({ ...bookInput("won"), roundId: OTHER_ROUND_ID, version: 2 }),
      ),
    );
    expect(h.timers).toEqual([]);
    await h.answer(read(book("starting", 3)));
    expect(h.timers).toEqual([]);
    h.see(book("won", 4));
    // The result read again arms no second timer.
    h.see(book("won", 5));
    expect(h.timers.map(timer => timer.ms)).toEqual([REQUEST.minIntervalMs]);
    expect(h.starts).toHaveLength(1);
    h.fire();
    expect(h.starts).toHaveLength(2);
    expect(h.timers).toEqual([]);
  });

  it("answers a start that failed with the generic error", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await h.failStart();
    expect(stopped(h)).toBe("error");
    expect(h.answers).toEqual([{ kind: "refused", reason: "use-case-failed" }]);
  });

  it("copies each start's bet from the latest Snapshot's own Amount", async () => {
    const h = harness();
    h.run.begin({ ...REQUEST, bet: { value: "100", unit: "EUR" } });
    expect(h.starts[0]).toEqual({ value: "100", unit: "EUR", decimals: 2 });
    await playRound(h, 2);
    h.fire();
    expect(h.starts[1]).toEqual(BET);
  });

  it("refuses to begin, sending nothing, unless it may", () => {
    const steps = harness(snapshot("idle"));
    expect(steps.run.begin(REQUEST)).toEqual({
      ok: false,
      refusal: "not-book",
    });
    const open = harness(bookSnapshot("starting"));
    expect(open.run.begin(REQUEST)).toEqual({ ok: false, refusal: "busy" });
    const h = harness();
    for (const bad of [0, -1, 1.5, 1001, Number.NaN]) {
      expect(h.run.begin({ ...REQUEST, count: bad }).ok).toBe(false);
    }
    expect(h.run.begin({ ...REQUEST, minIntervalMs: -1 }).ok).toBe(false);
    expect(h.run.begin({ ...REQUEST, bet: { ...BET, value: "200" } })).toEqual({
      ok: false,
      refusal: "bet-not-offered",
    });
    expect(h.run.begin({ ...REQUEST, bet: { ...BET, unit: "USD" } })).toEqual({
      ok: false,
      refusal: "bet-not-offered",
    });
    const poor = harness(
      book("idle", 1, bet => {
        (bet["balance"] as Record<string, unknown>)["value"] = "99";
      }),
    );
    expect(poor.run.begin(REQUEST)).toEqual({
      ok: false,
      refusal: "balance",
    });
    const closed = harness();
    closed.close();
    expect(closed.run.begin(REQUEST)).toEqual({
      ok: false,
      refusal: "closed",
    });
    expect([steps, open, h, poor, closed].flatMap(each => each.starts)).toEqual(
      [],
    );
    expect(h.run.begin(REQUEST).ok).toBe(true);
    expect(h.run.begin(REQUEST)).toEqual({ ok: false, refusal: "busy" });
  });

  it("stops before the next start when the balance is below the bet (bigint)", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await h.answer(read(book("starting", 2)));
    h.see(
      book("lost", 3, bet => {
        (bet["balance"] as Record<string, unknown>)["value"] = "99";
      }),
    );
    h.fire();
    expect(stopped(h)).toBe("balance");
    expect(h.starts).toHaveLength(1);
  });

  it("stops when the latest Snapshot no longer offers the bet", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await h.answer(read(book("starting", 2)));
    h.see(
      book("won", 3, bet => {
        (bet["minBet"] as Record<string, unknown>)["value"] = "500";
      }),
    );
    h.fire();
    expect(stopped(h)).toBe("bet-not-offered");
    expect(h.starts).toHaveLength(1);
  });

  it.each(["player", "hidden"] as const)(
    "stops on the %s stop; the round in flight finishes",
    async reason => {
      const h = harness();
      h.run.begin(REQUEST);
      h.run.stop(reason);
      expect(stopped(h)).toBe(reason);
      await playRound(h, 2);
      expect(h.answers).toHaveLength(1);
      expect(h.timers).toEqual([]);
      expect(h.starts).toHaveLength(1);
    },
  );

  it("stops while it waits out the interval", async () => {
    const waiting = harness();
    waiting.run.begin(REQUEST);
    await playRound(waiting, 2);
    waiting.run.stop("player");
    expect(waiting.timers).toEqual([]);
  });

  const answers: readonly (readonly [SessionRead, AutoplayStop])[] = [
    [{ kind: "network" }, "connection"],
    [{ kind: "rejected" }, "rejected"],
    [{ kind: "session-ended" }, "session-ended"],
    [{ kind: "session-changed" }, "session-changed"],
    [{ kind: "refused", reason: "lock-not-held" }, "lock-lost"],
    [{ kind: "refused", reason: "round-exists" }, "error"],
    [
      {
        kind: "problem",
        problem: {
          code: "ROUND_VOIDED",
          retryable: false,
        } as Extract<SessionRead, { kind: "problem" }>["problem"],
      },
      "error",
    ],
  ];

  it.each(answers)("stops on a start answered %o", async (answer, reason) => {
    const started = harness();
    started.run.begin(REQUEST);
    await started.answer(answer);
    expect(stopped(started)).toBe(reason);
  });

  it.each(answers)("stops on a later read of %o", async (answer, reason) => {
    const later = harness();
    later.run.begin(REQUEST);
    await later.answer(read(book("starting", 2)));
    later.run.see(answer);
    expect(stopped(later)).toBe(reason);
    expect(later.starts).toHaveLength(1);
  });

  it("stops on a changed round (W-52), on its result's own read", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await h.answer(read(book("starting", 2)));
    h.fail("changed");
    h.see(book("won", 3));
    expect(stopped(h)).toBe("changed-round");
    expect(h.timers).toEqual([]);
  });

  it("stops on a round that ends other than won or lost, and on a void", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await h.answer(read(book("starting", 2)));
    h.see(book("idle", 3));
    expect(stopped(h)).toBe("round-ended");
  });

  it("ignores another round's reads and a stop once stopped", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await h.answer(read(book("starting", 2)));
    h.run.see(
      read(validated({ ...bookInput("won"), roundId: OTHER_ROUND_ID })),
    );
    expect(h.run.state().kind).toBe("running");
    h.run.stop("player");
    h.run.stop("hidden");
    expect(stopped(h)).toBe("player");
  });

  it("stops when the session closed before the next start", async () => {
    const h = harness();
    h.run.begin(REQUEST);
    await playRound(h, 2);
    h.close();
    h.fire();
    expect(stopped(h)).toBe("session-ended");
    expect(h.starts).toHaveLength(1);
  });

  it("tells its listeners each change, and they can leave", () => {
    const h = harness();
    const states: string[] = [];
    const leave = h.run.onState(state => states.push(state.kind));
    h.run.begin(REQUEST);
    leave();
    h.run.stop("player");
    expect(states).toEqual(["running", "running"]);
  });
});
