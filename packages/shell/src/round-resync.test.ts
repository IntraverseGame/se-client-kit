// T-4, T-8 (W-19, W-25, W-26): a refused move resynchronizes from the
// Snapshot; a failed check signs nothing; the cancel W-26 requires is signed
// and sent once and never again; a re-issue stops new signatures while a W-16
// resend still goes out.

import { describe, expect, it } from "vitest";

import { lost, ok, problem } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { HASH } from "./fixtures/round-edits.ts";
import {
  ACCEPTED,
  bodyOf,
  NOT_ACTIVE,
  setUpFlow,
  started,
  startFlow,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";

describe.each([
  [400, "INVALID_ARGUMENT"],
  [409, "STALE_ACTION"],
])("a %i %s to a move (W-19)", (status, code) => {
  it("holds, reads the Snapshot, and continues from the next sequence when it shows the action applied", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", problem(status, code));
    setup.play.answer("getSnapshot", ok(setup.at(1)));
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
    expect(setup.play.sent("getSnapshot")).toHaveLength(1);
    expect(flow.phase()).toBe("adopted");
    setup.play.answer("continueRound", ok(setup.at(2)));
    expect(await flow.pick({ step: 1, option: 0 })).toEqual(ACCEPTED);
    const [first, second] = flow.evidence().signed;
    expect(second?.message.sequence).toBe(2);
    expect(second?.message.previous).toBe(first?.structHash);
  });

  it("holds again after an adopted read, when the next move is refused too", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", problem(status, code));
    setup.play.answer("getSnapshot", ok(setup.at(1)), lost);
    await flow.pick({ step: 0, option: 1 });
    expect(flow.phase()).toBe("adopted");
    setup.play.answer("continueRound", problem(status, code));
    expect(await flow.pick({ step: 1, option: 0 })).toEqual(ACCEPTED);
    expect(flow.phase()).toBe("stale");
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(await flow.pick({ step: 1, option: 1 })).toEqual(NOT_ACTIVE);
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.evidence().signed).toHaveLength(2);
  });

  it("shows the out-of-sync state, and signs nothing more, when the Snapshot does not show it", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", problem(status, code));
    setup.play.answer("getSnapshot", ok(setup.at(0)));
    await flow.pick({ step: 0, option: 1 });
    expect(flow.phase()).toBe("out-of-sync");
    expect(await flow.pick({ step: 0, option: 2 })).toEqual(NOT_ACTIVE);
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("stays held, the resend included, when the Snapshot cannot be read", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", problem(status, code));
    setup.play.answer("getSnapshot", lost, ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    expect(flow.phase()).toBe("stale");
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    await flow.refresh();
    expect(flow.phase()).toBe("adopted");
    expect(setup.play.sent("continueRound")).toHaveLength(1);
  });
});

describe("a failed check (T-8, W-26)", () => {
  it("signs nothing, not even a cancel, when T_0 is not settled", async () => {
    const { setup, flow } = await started({
      tip: TIP_FAILED,
      after: p => (p.fairnessProof["readyHash"] = HASH),
    });
    expect(flow.verdict()).toMatchObject({
      state: "failed",
      failure: "ready-mismatch",
      cancel: false,
    });
    expect(flow.phase()).toBe("unopened");
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(flow.cancel()).toBe("none");
    expect(flow.evidence().signed).toEqual([]);
    expect(setup.play.sent("cancelRound")).toEqual([]);
  });

  it("signs nothing when a check before the signature fails", async () => {
    const { setup, flow } = await started({
      after: p => (p.newRound["playerRef"] = HASH),
    });
    expect(flow.verdict()).toMatchObject({ failure: "recover-mismatch" });
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    expect(flow.evidence().signed).toEqual([]);
    expect(setup.play.sent("continueRound")).toEqual([]);
  });
});

describe("the required cancel (W-25, W-26)", () => {
  it("with T_0 settled and only the tip check failed, signs only the cancel, once, on its own route", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    setup.play.answer("cancelRound", ok(setup.closed("canceled", 0)));
    const flow = await startFlow(setup);
    const signed = flow.evidence().signed;
    expect(signed).toHaveLength(1);
    expect(signed[0]?.kind).toBe("cancel");
    expect(signed[0]?.message).toMatchObject({
      action: "cancel",
      path: [],
      sequence: 1,
      previous: setup.issued.initial,
    });
    const [cancel] = setup.play.sent("cancelRound");
    expect(cancel?.retry).toBe("never");
    expect(bodyOf(cancel)["signature"]).toBe(signed[0]?.signature);
    // `canceled` is final (W-25).
    expect(flow.cancel()).toBe("sent");
    expect(flow.phase()).toBe("closed");
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(setup.play.sent("continueRound")).toEqual([]);
  });

  it.each([
    // An `active` read after a refusal: the cancel did not take (W-25).
    ["a 400", problem(400, "INVALID_ARGUMENT"), "not-taken", 400],
    ["a 422", problem(422, "FAILED_PRECONDITION"), "not-taken", 422],
  ] as const)(
    "after %s, reads the Snapshot and never signs or sends a cancel again, even when the round is still cancelable",
    async (_, answer, state, status) => {
      const setup = await setUpFlow({ tip: TIP_FAILED });
      setup.play.answer("cancelRound", answer);
      setup.play.answer("getSnapshot", ok(setup.at(0)));
      const flow = await startFlow(setup);
      expect(flow.cancel()).toBe(state);
      expect(setup.play.sent("getSnapshot")).toHaveLength(1);
      await flow.observe(setup.at(0));
      await flow.observe(setup.at(0));
      expect(await flow.resend()).toEqual(NOT_ACTIVE);
      expect(flow.evidence().signed).toHaveLength(1);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
      // The refusal is kept in the round's evidence (W-27).
      expect(flow.evidence().cancelRefusals).toEqual([
        expect.objectContaining({ status }),
      ]);
    },
  );
});

describe("a re-issue (T-8, W-26)", () => {
  it("rejects picks and offers no cash-out", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(setup.reissued());
    expect(flow.verdict()).toMatchObject({
      failure: "reissued",
      cancel: false,
    });
    expect(flow.phase()).toBe("reissued");
    expect(await flow.pick({ step: 1, option: 1 })).toEqual(NOT_ACTIVE);
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(flow.evidence().signed).toHaveLength(1);
    expect(flow.evidence().auth.reissues).toHaveLength(1);
  });

  it("still sends the W-16 resend of a move already signed", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    setup.play.answer("continueRound", lost, ok(setup.reissued()));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(setup.reissued());
    expect(flow.phase()).toBe("reissued");
    expect(await flow.resend()).toEqual(ACCEPTED);
    const [first, again] = setup.play.sent("continueRound");
    expect(bodyOf(again)).toEqual(bodyOf(first));
    expect(flow.evidence().signed).toHaveLength(1);
  });
});
