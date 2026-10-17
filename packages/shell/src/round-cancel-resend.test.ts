// T-4 (W-16, W-25): after a lost response or a 503 to the required cancel, the
// shell reads the Snapshot and sends the same signed cancel again, once, only
// when the round is still `active` with no move. It never signs a second
// cancel and never sends a third time.

import { describe, expect, it } from "vitest";

import { lost, ok, problem, type Responder } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import {
  bodyOf,
  type FlowSetup,
  setUpFlow,
  startFlow,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";
import type { RoundFlow } from "./round-flow.ts";

const UNKNOWN: readonly (readonly [string, Responder])[] = [
  ["a lost response", lost],
  ["a 503", problem(503, "UNAVAILABLE", true)],
];

/** Starts a round whose tip check failed, so its cancel is required. */
const cancelRound = async (
  script: (setup: FlowSetup) => void,
): Promise<{ readonly setup: FlowSetup; readonly flow: RoundFlow }> => {
  const setup = await setUpFlow({ tip: TIP_FAILED, steps: THREE_STEPS });
  script(setup);
  return { setup, flow: await startFlow(setup) };
};

describe.each(UNKNOWN)("after %s to the cancel (W-25)", (_, unknown) => {
  it("reads the Snapshot and sends the same signed bytes again, once, when the round is still active with no move", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", unknown, ok(s.closed("canceled", 0)));
      s.play.answer("getSnapshot", ok(s.at(0)));
    });
    const [first, again] = setup.play.sent("cancelRound");
    expect(bodyOf(again)).toEqual(bodyOf(first));
    expect(setup.play.sent("getSnapshot")).toHaveLength(1);
    expect(flow.evidence().signed).toHaveLength(1);
    expect(flow.cancel()).toBe("sent");
    expect(flow.phase()).toBe("closed");
  });

  it.each(UNKNOWN)(
    "and %s to the resend, reads the Snapshot again and never sends a third time",
    async (__, second) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", unknown, second);
        s.play.answer("getSnapshot", ok(s.at(0)), ok(s.at(0)), ok(s.at(0)));
      });
      expect(setup.play.sent("cancelRound")).toHaveLength(2);
      expect(setup.play.sent("getSnapshot")).toHaveLength(2);
      expect(flow.cancel()).toBe("unconfirmed");
      await flow.observe(setup.at(0));
      await flow.refresh();
      expect(setup.play.sent("cancelRound")).toHaveLength(2);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );

  it.each<[string, (setup: FlowSetup) => Responder]>([
    ["a move played", s => ok(s.at(1))],
    ["the round canceled", s => ok(s.closed("canceled", 0))],
    ["the round lost", s => ok(s.closed("lost", 1))],
    ["a re-issue", s => ok(s.read(p => (p.auth["expiry"] = "1800000601")))],
    ["no Snapshot (the read lost)", () => lost],
  ])("does not resend when the read shows %s", async (__, read) => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", unknown);
      s.play.answer("getSnapshot", read(s));
    });
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    expect(flow.evidence().signed).toHaveLength(1);
  });
});
