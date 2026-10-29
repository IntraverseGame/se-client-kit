// T-4b (W-25, W-33): the answers to the shell's own cancel: `resolving`, and a
// `resolving` read after an unknown outcome, enter `settling`; `canceled` (with
// or without a `closeReason`), `won`, and `lost` are the round's result; an
// `active` answer is `not-taken`; another round's answer tells nothing (the
// read decides, with no resend).

import { describe, expect, it } from "vitest";

import {
  cancelRound,
  notOver,
  otherRound,
  RESULTS,
  resolving,
} from "./fixtures/cancel-settle.ts";
import { lost, ok } from "./fixtures/fake-play.ts";

describe("a resolving answer (W-25)", () => {
  it("enters settling and is not read into the round", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", lost);
    });
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    setup.play.answer(
      "getSnapshot",
      ok(setup.closed("canceled", 0, "expired")),
    );
    await flow.refresh();
    expect(flow.cancel()).toBe("sent");
    expect(flow.latest().closeReason).toBe("expired");
  });
});

describe("an unknown outcome followed by an unsettled read (W-16, W-25)", () => {
  it("settles like an answer: a resolving read is settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost);
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });
});

describe("a cancel answered with the round's result (W-25, W-33)", () => {
  it.each<[string, number]>([
    ["no move", 0],
    ["a move played", 1],
  ])(
    "takes an active answer (%s) as not-taken, with no read",
    async (_, step) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", ok(s.at(step)));
      });
      expect(flow.cancel()).toBe("not-taken");
      expect(flow.latest().step).toBe(step);
      expect(setup.play.sent("getSnapshot")).toEqual([]);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
    },
  );

  it.each(RESULTS)(
    "takes %s as the round's result, with no error and no read",
    async (_, result, status) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", ok(result(s)));
      });
      expect(flow.cancel()).toBe("sent");
      expect(flow.latest().status).toBe(status);
      expect(flow.phase()).toBe("closed");
      expect(flow.lastError()).toBeUndefined();
      expect(setup.play.sent("getSnapshot")).toEqual([]);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );

  it("takes a canceled answer of another round as telling nothing (the read decides, with no resend), not as settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(otherRound(s, "canceled")));
      s.play.answer("getSnapshot", ok(s.at(0)));
    });
    // The read that follows shows `active`: the cancel did not take.
    expect(flow.cancel()).toBe("not-taken");
    expect(flow.lastError()).toMatchObject({ code: "snapshot-rejected" });
    expect(setup.play.sent("getSnapshot")).toHaveLength(1);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    notOver(flow);
  });
});
