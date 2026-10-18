// T-4b (W-25, W-35), per the Snapshot contract `se.snapshot/1` as vendored
// from the backend's b27afc5: a `resolving` answer to the shell's own cancel is
// not final; it is not read into the round, and only the cancel's own reads,
// sent after the answer, may settle it. `canceled` (with or without a
// `closeReason`), `won`, and `lost` are the round's result; `active` means the
// cancel did not take (`not-taken`); `idle` means it took and the round ended
// (`ended`). Another `resolving` read, another round, and a failed read settle
// nothing; after `SETTLING_READS` reads the cancel is `check-later`.

import { describe, expect, it } from "vitest";

import {
  cancelRound,
  notOver,
  otherRound,
  RESULTS,
  resolving,
  until,
} from "./fixtures/cancel-settle.ts";
import { deferred, lost, ok, type Responder } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { type FlowSetup, setUpFlow } from "./fixtures/round-flow.ts";
import { ROUND_ID, snapshot } from "./fixtures/vectors.ts";
import { createRoundFlow } from "./round-flow.ts";

describe("a resolving answer (W-25)", () => {
  it("is not final, and a repeated resolving read keeps it settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)), ok(resolving(s)));
    });
    expect(setup.play.sent("getSnapshot")).toHaveLength(1);
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    await flow.refresh();
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    expect(flow.lastError()).toBeUndefined();
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it.each(RESULTS)(
    "takes a read that shows the round %s as its result, with no error",
    async (_, result, status) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", ok(resolving(s)));
        s.play.answer("getSnapshot", ok(result(s)));
      });
      expect(flow.cancel()).toBe("sent");
      expect(flow.latest().status).toBe(status);
      expect(flow.phase()).toBe("closed");
      expect(flow.lastError()).toBeUndefined();
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
    },
  );

  it.each<[string, number]>([
    ["the cancel refused (active, no move)", 0],
    ["a move applied first (active, one move)", 1],
  ])("ends the cancel path on a read that shows %s", async (_, step) => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(s.at(step)));
    });
    expect(flow.cancel()).toBe("not-taken");
    expect(flow.latest().status).toBe("active");
    expect(flow.latest().step).toBe(step);
    expect(flow.phase()).not.toBe("closed");
    expect(flow.verdict()).toMatchObject({ state: "failed" });
    await flow.observe(setup.at(0));
    expect(flow.evidence().signed).toHaveLength(1);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });

  it.each<[string, (s: FlowSetup) => Responder]>([
    ["a failed read", () => lost],
    ["another round's Snapshot", s => ok(otherRound(s))],
  ])("settles nothing on %s", async (_, read) => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", read(s));
    });
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    setup.play.answer("getSnapshot", ok(setup.closed("lost", 1)));
    await flow.refresh();
    expect(flow.cancel()).toBe("sent");
    expect(flow.latest().status).toBe("lost");
  });

  it("ends on an idle read: the cancel took and the round ended, with no result claim", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(snapshot("idle")));
    });
    expect(flow.cancel()).toBe("ended");
    // No result is read in: the round's last Snapshot stays the active one.
    expect(flow.latest().status).toBe("active");
    expect(flow.lastError()).toBeUndefined();
    // A later read is an ordinary one: the cancel stays ended.
    setup.play.answer("getSnapshot", ok(snapshot("idle")));
    await flow.refresh();
    expect(flow.cancel()).toBe("ended");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("reads a resolving read into the round, and keeps settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    expect(flow.cancel()).toBe("settling");
    expect(flow.latest().status).toBe("resolving");
    setup.play.answer("getSnapshot", ok(setup.closed("won", 1)));
    await flow.refresh();
    expect(flow.cancel()).toBe("sent");
    expect(flow.latest().status).toBe("won");
  });

  it("holds back, before the tracking, every Snapshot of the round that is not one of its own reads", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    await flow.observe(resolving(setup));
    notOver(flow);
    await flow.observe(setup.closed("won", 1));
    notOver(flow);
    await flow.observe(setup.at(1));
    expect(flow.latest().step).toBe(0);
    expect(flow.cancel()).toBe("settling");
  });

  it("is not settled by a read sent before the answer arrived", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const answer = deferred();
    const stale = deferred();
    setup.play.answer("cancelRound", answer.responder);
    setup.play.answer("getSnapshot", stale.responder, ok(resolving(setup)));
    const flow = createRoundFlow(
      setup.options,
      {
        roundId: ROUND_ID,
        request: { actionKey: setup.actionKey, bet: setup.options.bet },
      },
      setup.issued.snapshot,
    );
    const first = flow.observe(setup.at(0));
    await until(() => setup.play.sent("cancelRound").length === 1);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    // A read sent while the cancel is on its way.
    const early = flow.refresh();
    answer.release(ok(resolving(setup)));
    await first;
    expect(flow.cancel()).toBe("settling");
    // Even a result, if it was read before the answer, settles nothing and
    // does not reach the round.
    stale.release(ok(setup.closed("won", 1)));
    await early;
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    expect(setup.play.sent("getSnapshot")).toHaveLength(2);
  });
});
