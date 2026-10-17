// T-4b (W-16, W-25): while the cancel is in flight, no Snapshot of the round
// from elsewhere reaches it; after any failed cancel call (refused or unknown)
// the read that follows decides as a settling read does, and one counted read
// runs at a time.

import { describe, expect, it } from "vitest";

import { SETTLING_READS } from "./cancel-state.ts";
import {
  cancelRound,
  notOver,
  readUntil,
  resolving,
  until,
} from "./fixtures/cancel-settle.ts";
import { deferred, lost, ok, problem } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { type FlowSetup, setUpFlow } from "./fixtures/round-flow.ts";
import { ROUND_ID, snapshot } from "./fixtures/vectors.ts";
import { createRoundFlow } from "./round-flow.ts";

const LOST = ["a lost response", lost] as const;
const BAD = ["a 400", problem(400, "INVALID_ARGUMENT")] as const;
const REPEAT = ["a 422", problem(422, "FAILED_PRECONDITION")] as const;
const BUSY = ["a 503", problem(503, "UNAVAILABLE", true)] as const;

describe("while the cancel is in flight (W-25)", () => {
  it("holds back every Snapshot of the round from elsewhere", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const answer = deferred();
    setup.play.answer("cancelRound", answer.responder);
    setup.play.answer(
      "getSnapshot",
      ok(resolving(setup)),
      ok(resolving(setup)),
    );
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
    expect(flow.cancel()).toBe("in-flight");
    await flow.refresh();
    await flow.observe(setup.closed("won", 1));
    expect(flow.latest().status).toBe("active");
    expect(flow.phase()).not.toBe("closed");
    answer.release(ok(resolving(setup)));
    await first;
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
  });
});

describe("while the resend is in flight (W-16, W-25)", () => {
  it("holds back every Snapshot of the round from elsewhere", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const resend = deferred();
    setup.play.answer("cancelRound", lost, resend.responder);
    setup.play.answer(
      "getSnapshot",
      ok(setup.at(0)),
      ok(resolving(setup)),
      ok(resolving(setup)),
    );
    const flow = createRoundFlow(
      setup.options,
      {
        roundId: ROUND_ID,
        request: { actionKey: setup.actionKey, bet: setup.options.bet },
      },
      setup.issued.snapshot,
    );
    const first = flow.observe(setup.at(0));
    await until(() => setup.play.sent("cancelRound").length === 2);
    expect(flow.cancel()).toBe("in-flight");
    await flow.refresh();
    expect(flow.latest().status).toBe("active");
    expect(flow.phase()).not.toBe("closed");
    resend.release(ok(resolving(setup)));
    await first;
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
  });
});

describe("after any failed cancel call (W-16, W-25)", () => {
  it.each([LOST, BUSY, BAD, REPEAT])(
    "after %s, a resolving read is settling, with no resend",
    async (_, failure) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", failure);
        s.play.answer("getSnapshot", ok(resolving(s)));
      });
      expect(flow.cancel()).toBe("settling");
      notOver(flow);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
    },
  );

  it("after a 422, a resolving read is settling and read into the round", async () => {
    const { flow } = await cancelRound(s => {
      s.play.answer("cancelRound", REPEAT[1]);
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    expect(flow.cancel()).toBe("settling");
    expect(flow.latest().status).toBe("resolving");
  });

  it("after a lost cancel, an active read, and a 422 to the resend (the round resolving), a resolving read is settling, with no third send", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost, REPEAT[1]);
      s.play.answer("getSnapshot", ok(s.at(0)), ok(resolving(s)));
    });
    expect(setup.play.sent("cancelRound")).toHaveLength(2);
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it.each([LOST, BAD, REPEAT])(
    "after %s, an idle read ends it",
    async (_, failure) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", failure);
        s.play.answer("getSnapshot", ok(snapshot("idle")));
      });
      expect(flow.cancel()).toBe("ended");
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
    },
  );

  it("after a lost cancel, an active read with a move is not-taken", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost);
      s.play.answer("getSnapshot", ok(s.at(1)));
    });
    expect(flow.cancel()).toBe("not-taken");
    expect(flow.latest().step).toBe(1);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });

  it("after a lost cancel, a result read is the round's result", async () => {
    const { flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost);
      s.play.answer("getSnapshot", ok(s.closed("lost", 1)));
    });
    expect(flow.cancel()).toBe("sent");
    expect(flow.phase()).toBe("closed");
  });

  it(`counts the read after the failure toward the ${SETTLING_READS}`, async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost);
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    await readUntil(setup, flow, SETTLING_READS - 1);
    expect(flow.cancel()).toBe("settling");
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("check-later");
  });
});

describe("a failed read after the failed call (W-16, W-25)", () => {
  const FOLLOW_UPS = [
    ["active", (st: FlowSetup) => st.at(0), "not-taken"],
    ["canceled", (st: FlowSetup) => st.closed("canceled", 0), "sent"],
    ["idle", () => snapshot("idle"), "ended"],
  ] as const;

  describe.each([LOST, BUSY, REPEAT])("after %s", (_, failure) => {
    it.each(FOLLOW_UPS)(
      "is settling with no resend, and a counted %s read decides it",
      async (__, read, decided) => {
        const { setup, flow } = await cancelRound(s => {
          s.play.answer("cancelRound", failure);
          s.play.answer("getSnapshot", lost);
        });
        expect(flow.cancel()).toBe("settling");
        notOver(flow);
        setup.play.answer("getSnapshot", ok(read(setup)));
        await flow.refresh();
        expect(flow.cancel()).toBe(decided);
        // An `active` read with no move does not earn the resend here.
        expect(setup.play.sent("cancelRound")).toHaveLength(1);
      },
    );
  });

  it(`counts the failed read toward the ${SETTLING_READS}`, async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost);
      s.play.answer("getSnapshot", lost);
    });
    await readUntil(setup, flow, SETTLING_READS - 1);
    expect(flow.cancel()).toBe("settling");
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("check-later");
  });

  it("after a 400, leaves the cancel refused", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", BAD[1]);
      s.play.answer("getSnapshot", lost);
    });
    expect(flow.cancel()).toBe("refused");
    setup.play.answer("getSnapshot", ok(setup.at(0)));
    await flow.refresh();
    expect(flow.cancel()).toBe("refused");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });
});

describe("two unknown outcomes and an active read with no move (W-16, W-25)", () => {
  const FOLLOW_UPS = [
    ["active", (st: FlowSetup) => st.at(0), "not-taken"],
    ["canceled", (st: FlowSetup) => st.closed("canceled", 0), "sent"],
    ["idle", () => snapshot("idle"), "ended"],
    ["resolving", (st: FlowSetup) => resolving(st), "settling"],
  ] as const;

  it.each(FOLLOW_UPS)(
    "is settling with no third send, and a counted %s read decides it",
    async (_, read, decided) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", lost, BUSY[1]);
        s.play.answer("getSnapshot", ok(s.at(0)), ok(s.at(0)));
      });
      expect(setup.play.sent("cancelRound")).toHaveLength(2);
      expect(flow.cancel()).toBe("settling");
      setup.play.answer("getSnapshot", ok(read(setup)));
      await flow.refresh();
      expect(flow.cancel()).toBe(decided);
      expect(setup.play.sent("cancelRound")).toHaveLength(2);
    },
  );

  it(`counts that read toward the ${SETTLING_READS}`, async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost, lost);
      s.play.answer("getSnapshot", ok(s.at(0)), ok(s.at(0)));
    });
    // The first read (before the resend) is not a counted one.
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("settling");
    await readUntil(setup, flow, SETTLING_READS + 1);
    expect(flow.cancel()).toBe("check-later");
  });
});

describe("one counted read at a time (W-35)", () => {
  it("a second read while one is in flight joins it: one read is sent", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    const held = deferred();
    setup.play.answer("getSnapshot", held.responder, ok(snapshot("idle")));
    const one = flow.refresh();
    const two = flow.checkAgain();
    held.release(ok(setup.at(0)));
    await Promise.all([one, two]);
    expect(setup.play.sent("getSnapshot")).toHaveLength(2);
    expect(flow.cancel()).toBe("not-taken");
  });
});
