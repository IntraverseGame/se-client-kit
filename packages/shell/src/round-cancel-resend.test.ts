// T-4 (W-16, W-25): after a lost send of the required cancel (no answer, or a
// 503 not marked `retryable: false`, the one definition for every action), the
// shell reads the Snapshot and sends the same signed cancel again, once, only
// when the round is still `active` with no move. It never signs a second
// cancel and never sends a third time. A 503 marked `retryable: false` earns
// no resend, but may come with the cancel stored: the reads decide, and a
// failed read leaves it `settling`.

import { ProtocolError } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
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
import { snapshot } from "./fixtures/vectors.ts";
import type { RoundFlow } from "./round-flow.ts";

const UNKNOWN: readonly (readonly [string, Responder])[] = [
  ["a lost response", lost],
  ["a 503 marked retryable: true", problem(503, "UNAVAILABLE", true)],
  [
    "a 503 with no problem body",
    request => {
      throw new ProtocolError(request, 503, "unexpected response");
    },
  ],
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
    // The resend's `canceled` answer is final (W-25): no further read.
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
      // The second unknown outcome and an `active` read with no move: the
      // cancel may be stored, so it is settling (that read counted as 1).
      expect(flow.cancel()).toBe("settling");
      await flow.observe(setup.at(0));
      // The next counted read decides: `active` means the cancel did not take.
      await flow.refresh();
      expect(flow.cancel()).toBe("not-taken");
      expect(setup.play.sent("cancelRound")).toHaveLength(2);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );

  it.each<[string, (setup: FlowSetup) => ValidSnapshot, string]>([
    ["active", st => st.at(0), "not-taken"],
    ["canceled", st => st.closed("canceled", 0), "sent"],
    ["idle", () => snapshot("idle"), "ended"],
    [
      "resolving",
      st => st.read(p => (p.input["status"] = "resolving")),
      "settling",
    ],
  ])(
    "is settling when the read shows a re-issue, and a counted %s read decides it",
    async (__, read, decided) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", unknown);
        s.play.answer("getSnapshot", ok(s.reissued()));
      });
      // No resend is allowed after a re-issue, but the cancel may be stored.
      expect(flow.cancel()).toBe("settling");
      setup.play.answer("getSnapshot", ok(read(setup)));
      await flow.refresh();
      expect(flow.cancel()).toBe(decided);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
    },
  );

  it.each<[string, (setup: FlowSetup) => Responder]>([
    ["a move played", s => ok(s.at(1))],
    ["the round canceled", s => ok(s.closed("canceled", 0))],
    [
      "the round resolving",
      s => ok(s.read(p => (p.input["status"] = "resolving"))),
    ],
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

describe("after a 503 marked retryable: false to the cancel (W-25, W-42)", () => {
  it.each<[string, (setup: FlowSetup) => Responder, string]>([
    ["active", s => ok(s.at(0)), "not-taken"],
    ["canceled", s => ok(s.closed("canceled", 0)), "sent"],
    ["unread (the read lost)", () => lost, "settling"],
  ])(
    "sends nothing more, and a read that shows the round %s decides it",
    async (_, read, decided) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", problem(503, "UNAVAILABLE", false));
        s.play.answer("getSnapshot", read(s));
      });
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
      expect(flow.cancel()).toBe(decided);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );
});
