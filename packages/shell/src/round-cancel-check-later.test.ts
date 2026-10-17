// T-4b (W-25, W-35): after `SETTLING_READS` reads that do not settle the
// cancel it is `check-later`; "check again" reads once under the same rules.

import { describe, expect, it } from "vitest";

import { SETTLING_READS } from "./cancel-state.ts";
import {
  cancelRound,
  notOver,
  otherRound,
  readUntil,
  resolving,
  RESULTS,
} from "./fixtures/cancel-settle.ts";
import { lost, ok } from "./fixtures/fake-play.ts";
import { snapshot } from "./fixtures/vectors.ts";

describe("check-later (W-25, W-35)", () => {
  it(`goes to check-later after ${SETTLING_READS} reads, failed ones included`, async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", lost);
    });
    await readUntil(setup, flow, SETTLING_READS - 1);
    expect(flow.cancel()).toBe("settling");
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("check-later");
    notOver(flow);
    // "Check again" follows the same rules: another canceled settles nothing.
    setup.play.answer("getSnapshot", ok(resolving(setup)));
    await flow.checkAgain();
    expect(flow.cancel()).toBe("check-later");
    notOver(flow);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });

  it("ends from check-later when check again shows idle", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("check-later");
    setup.play.answer("getSnapshot", ok(snapshot("idle")));
    await flow.checkAgain();
    expect(flow.cancel()).toBe("ended");
  });

  it("does not settle from check-later on another round's Snapshot", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    await readUntil(setup, flow, SETTLING_READS);
    setup.play.answer("getSnapshot", ok(otherRound(setup)));
    await flow.checkAgain();
    expect(flow.cancel()).toBe("check-later");
    notOver(flow);
  });

  it.each(RESULTS)(
    "settles from check-later when check again shows %s",
    async (_, result, status) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", ok(resolving(s)));
        s.play.answer("getSnapshot", ok(resolving(s)));
      });
      await readUntil(setup, flow, SETTLING_READS);
      expect(flow.cancel()).toBe("check-later");
      setup.play.answer("getSnapshot", ok(result(setup)));
      await flow.checkAgain();
      expect(flow.cancel()).toBe("sent");
      expect(flow.latest().status).toBe(status);
      expect(flow.phase()).toBe("closed");
      expect(flow.lastError()).toBeUndefined();
    },
  );
});
