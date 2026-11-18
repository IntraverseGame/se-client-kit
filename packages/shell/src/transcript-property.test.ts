// T-4 (W-15 to W-17) and T-17's unit-level half (W-14): under seeded random
// sequences of failures, lost responses, retries, `STALE_ACTION`, cancels
// against moves, and a second tab of the same session, no sequence ever has
// two signatures and the chain never breaks.

import { describe, expect, it } from "vitest";

import { createFakeLockManager } from "./fixtures/fake-locks.ts";
import { recordingRandom } from "./fixtures/seeded.ts";
import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import {
  brokenLinks,
  forkedSequences,
  simulate,
  type SimulationLog,
} from "./fixtures/simulation.ts";
import { workedInitial } from "./fixtures/vectors.ts";

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);
const STEPS = 60;

describe("one tab", () => {
  // A seed's run is deterministic, so it is made once and shared: the
  // refusals test reads the logs the per-seed tests made instead of running
  // the 150 sessions again (alone 0.46 s, it timed out at 5 s in a busy CI job;
  // #192). Run on its own, it makes every log itself.
  const logs = new Map<number, Promise<SimulationLog>>();
  const oneTab = (seed: number): Promise<SimulationLog> => {
    const log =
      logs.get(seed) ??
      openTestSession().then(session =>
        simulate(seed, STEPS, [{ session, round: openWorkedRound(session) }]),
      );
    logs.set(seed, log);
    return log;
  };

  it.each(SEEDS)(
    "seed %i: never two signatures at one sequence",
    async seed => {
      const log = await oneTab(seed);
      expect(forkedSequences(log.signed)).toEqual([]);
      expect(brokenLinks(log.signed, workedInitial)).toEqual([]);
    },
  );

  it("exercises the refusals it means to", async () => {
    const codes = new Set<string>();
    for (const seed of SEEDS) {
      // oxlint-disable-next-line no-await-in-loop -- one session per seed, in order
      const log = await oneTab(seed);
      for (const code of log.refusals.keys()) codes.add(code);
    }
    expect([...codes].toSorted()).toEqual(["equivocation", "round-stopped"]);
  });
});

describe("two tabs of one session (W-14)", () => {
  it("of two tabs opened at once, exactly one may sign", async () => {
    const locks = createFakeLockManager();
    const tabs = await Promise.all([
      openTestSession({ locks }),
      openTestSession({ locks }),
    ]);
    expect(tabs.map(tab => tab.state()).toSorted()).toEqual([
      "held-elsewhere",
      "signing",
    ]);
  });

  it.each(SEEDS)(
    "seed %i: the tab without the lock never signs",
    async seed => {
      const locks = createFakeLockManager();
      // A cloned tab: the same key bytes in both, the worst case.
      const first = await openTestSession({
        locks,
        random: recordingRandom(seed),
      });
      const second = await openTestSession({
        locks,
        random: recordingRandom(seed),
      });
      const log = simulate(seed, STEPS, [
        { session: first, round: openWorkedRound(first) },
        { session: second, round: undefined },
      ]);
      expect(second.state()).toBe("held-elsewhere");
      expect(log.keyUsesWithoutLock).toBe(0);
      expect(forkedSequences(log.signed)).toEqual([]);
      expect(brokenLinks(log.signed, workedInitial)).toEqual([]);
    },
  );
});
