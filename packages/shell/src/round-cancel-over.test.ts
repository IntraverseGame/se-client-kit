// T-4b (W-25, W-35, W-39): whether the round is over follows the required
// cancel: never while it is `in-flight`, `settling`, or `check-later`; always
// once it is `ended`, though the latest Snapshot is the round's from before;
// and otherwise the latest Snapshot (`not-taken`: `active`, open; `sent`: the
// result).

import { describe, expect, it } from "vitest";

import { SETTLING_READS } from "./cancel-state.ts";
import {
  cancelRound,
  canceled,
  readUntil,
  resolving,
  until,
} from "./fixtures/cancel-settle.ts";
import { deferred, ok } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { setUpFlow } from "./fixtures/round-flow.ts";
import { ROUND_ID, snapshot } from "./fixtures/vectors.ts";
import { createRoundFlow } from "./round-flow.ts";

describe("whether the round is over, with its cancel (W-25)", () => {
  it("is false while the cancel is in flight", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const answer = deferred();
    setup.play.answer("cancelRound", answer.responder);
    setup.play.answer("getSnapshot", ok(resolving(setup)));
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
    expect(flow.over()).toBe(false);
    answer.release(ok(resolving(setup)));
    await first;
  });

  it("is false while settling and in check-later, and true once ended", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    expect(flow.cancel()).toBe("settling");
    expect(flow.over()).toBe(false);
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("check-later");
    expect(flow.over()).toBe(false);
    setup.play.answer("getSnapshot", ok(snapshot("idle")));
    await flow.checkAgain();
    expect(flow.cancel()).toBe("ended");
    // The latest Snapshot is still the round's from before: not over by itself.
    expect(flow.latest().status).toBe("resolving");
    expect(flow.over()).toBe(true);
  });

  it("is true once the cancel's read shows the round canceled", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    setup.play.answer("getSnapshot", ok(canceled(setup)));
    await flow.refresh();
    expect(flow.cancel()).toBe("sent");
    expect(flow.over()).toBe(true);
  });

  it("follows the latest Snapshot once the cancel did not take", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s)));
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    setup.play.answer("getSnapshot", ok(setup.at(0)));
    await flow.refresh();
    expect(flow.cancel()).toBe("not-taken");
    expect(flow.over()).toBe(false);
  });
});
