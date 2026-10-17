// The player actions' own guards, each pinned on its own (W-15, W-16, W-23,
// W-26). The flow layers them (the verdict, the transcript state's phase, the
// pending action, the steps signed, the resend's identity), so a flow test
// cannot show one alone; here the tracking and the transcript state are
// stand-ins that let exactly one guard decide, and a positive control shows
// the same set-up signs when that guard allows it.

import { describe, expect, it } from "vitest";

import { createFakePlay, ok } from "./fixtures/fake-play.ts";
import { recordingEncoder } from "./fixtures/flow-stand-ins.ts";
import {
  openTestSession,
  openWorkedRound,
  settledForTest,
} from "./fixtures/session.ts";
import { snapshot, workedInitial } from "./fixtures/vectors.ts";
import type { RoundSigner } from "./pending-action.ts";
import { createRoundActions } from "./round-actions.ts";
import { createRoundDelivery } from "./round-delivery.ts";
import type { RoundTracking } from "./round-tracking.ts";
import type { RoundVerdict } from "./round-verification.ts";

const READY: RoundVerdict = {
  state: "ready",
  initial: settledForTest(workedInitial),
};
const CHECKING: RoundVerdict = { state: "checking" };

/** A function that gives nothing: no tip-check error, no pending action. */
const nothing = (): undefined => {};

/** A transcript state whose resendable action is a copy of the pending one. */
const resendingACopy = (real: RoundSigner): RoundSigner => ({
  ...real,
  resendable: () => {
    const pending = real.pending();
    return pending === undefined ? undefined : Object.freeze({ ...pending });
  },
});

const setUp = async (
  verdict: RoundVerdict,
  wrap: (signer: RoundSigner) => RoundSigner = signer => signer,
): Promise<{
  readonly actions: ReturnType<typeof createRoundActions>;
  readonly play: ReturnType<typeof createFakePlay>;
  readonly signer: RoundSigner;
}> => {
  const session = await openTestSession();
  const signer = wrap(openWorkedRound(session));
  const latest = snapshot("active", { step: 0 });
  const tracking: RoundTracking = {
    roundId: signer.roundId,
    observe: () => Promise.resolve(verdict),
    verdict: () => verdict,
    signer: () => signer,
    latest: () => latest,
    evidence: () => ({
      auth: { first: undefined, reissues: [] },
      tip: undefined,
    }),
    tipError: nothing,
  };
  const play = createFakePlay();
  play.answer("continueRound", ok(latest), ok(latest));
  const delivery = createRoundDelivery(
    {
      transport: play.transport,
      authorization: () => "Bearer placeholder",
    },
    {
      roundId: signer.roundId,
      observe: () => Promise.resolve(),
      signer: () => signer,
    },
    { encodeTypedData: recordingEncoder() },
  );
  return {
    actions: createRoundActions(session, tracking, delivery),
    play,
    signer,
  };
};

const PICK = { step: 0, option: 2 } as const;

describe("the guards of a new signature", () => {
  it("signs when every guard allows it (the positive control)", async () => {
    const { actions, play } = await setUp(READY);
    expect(await actions.pick(PICK)).toEqual({ accepted: true });
    expect(play.sent("continueRound")).toHaveLength(1);
  });

  it("refuses a verdict that is not ready, even with an open transcript state", async () => {
    const { actions, play, signer } = await setUp(CHECKING);
    expect(signer.phase()).toBe("open");
    expect(await actions.pick(PICK)).toEqual({
      accepted: false,
      reason: "not_active",
    });
    expect(await actions.cashOut()).toEqual({
      accepted: false,
      reason: "not_active",
    });
    expect(signer.pending()).toBeUndefined();
    expect(play.all()).toEqual([]);
  });

  it("refuses a transcript state that takes no new signature, even with a ready verdict", async () => {
    // Its phase says `failed`, but its `sign` would still sign: only the
    // actions' phase check stands between them.
    const { actions, play, signer } = await setUp(READY, real => ({
      ...real,
      phase: () => "failed",
    }));
    expect(await actions.pick(PICK)).toEqual({
      accepted: false,
      reason: "not_active",
    });
    expect(signer.pending()).toBeUndefined();
    expect(play.all()).toEqual([]);
  });

  it("refuses a step already signed, even when no action is pending", async () => {
    // A transcript state that never reports its pending action: only the
    // steps-signed check refuses the same pick again.
    const { actions, play } = await setUp(READY, real => ({
      ...real,
      // Never reports the action it holds.
      pending: nothing,
    }));
    expect(await actions.pick(PICK)).toEqual({ accepted: true });
    expect(await actions.pick(PICK)).toEqual({
      accepted: false,
      reason: "not_legal",
    });
    expect(play.sent("continueRound")).toHaveLength(1);
  });
});

describe("the resend (W-16)", () => {
  it("sends only the body recorded with the pending action itself", async () => {
    const { actions, play } = await setUp(READY, resendingACopy);
    expect(await actions.pick(PICK)).toEqual({ accepted: true });
    expect(await actions.resend()).toEqual({
      accepted: false,
      reason: "not_active",
    });
    expect(play.sent("continueRound")).toHaveLength(1);
  });
});
