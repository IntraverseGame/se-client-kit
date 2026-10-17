// T-8 (W-25, W-26): nothing is signed for a round before its verdict is
// `ready`, and a failed round's transcript state takes no new signature, so a
// pick or a cash-out is refused by two independent guards. A tip check that
// rejects gives no decision: the verdict stays `checking`.

import { describe, expect, it } from "vitest";

import type { SettledInitial } from "./create-round-auth.ts";
import { ok, problem } from "./fixtures/fake-play.ts";
import { TIP_FAILED, TIP_PASSED } from "./fixtures/flow-stand-ins.ts";
import {
  ACCEPTED,
  type FlowSetup,
  NOT_ACTIVE,
  setUpFlow,
  startFlow,
} from "./fixtures/round-flow.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createRoundCancel } from "./round-cancel.ts";
import { createRoundDelivery } from "./round-delivery.ts";
import { createRoundFlow, type RoundFlow } from "./round-flow.ts";
import { createRoundTracking } from "./round-tracking.ts";

/** Refuses a pick and a cash-out, and signs nothing more. */
const refusesActions = async (
  flow: RoundFlow,
  signedBefore: number,
): Promise<void> => {
  expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
  expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
  expect(flow.evidence().signed).toHaveLength(signedBefore);
};

/** The set-up round's flow, built without a `start`, with `tipCheck`. */
const flowWith = (
  setup: FlowSetup,
  tipCheck: FlowSetup["options"]["tipCheck"],
): RoundFlow =>
  createRoundFlow(
    { ...setup.options, tipCheck },
    {
      roundId: ROUND_ID,
      request: { actionKey: setup.actionKey, bet: setup.options.bet },
    },
    setup.issued.snapshot,
  );

describe("a failed round signs no move (W-26)", () => {
  it("with no cancel encoding, after the tip check failed", async () => {
    const setup = await setUpFlow({
      tip: TIP_FAILED,
      session: { withoutCancel: true },
    });
    const flow = await startFlow(setup);
    expect(flow.cancel()).toBe("unavailable");
    expect(flow.phase()).toBe("failed");
    await refusesActions(flow, 0);
  });

  it("after the cancel was sent and the round is still active", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    setup.play.answer("cancelRound", ok(setup.at(0)));
    const flow = await startFlow(setup);
    expect(flow.cancel()).toBe("sent");
    expect(flow.phase()).toBe("failed");
    await refusesActions(flow, 1);
  });

  it("after the cancel was refused", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    setup.play.answer("cancelRound", problem(400, "INVALID_ARGUMENT"));
    setup.play.answer("getSnapshot", ok(setup.at(0)));
    const flow = await startFlow(setup);
    expect(flow.cancel()).toBe("refused");
    expect(flow.phase()).toBe("failed");
    await refusesActions(flow, 1);
  });
});

describe("nothing is signed before the verdict is ready (W-26)", () => {
  it("while the tip check is still running", async () => {
    const setup = await setUpFlow();
    let release: (() => void) | undefined;
    const held = new Promise<void>(done => {
      release = done;
    });
    const flow = flowWith(setup, async () => {
      await held;
      return TIP_PASSED;
    });
    const observing = flow.observe(setup.issued.snapshot);
    expect(flow.verdict()).toEqual({ state: "checking" });
    expect(flow.phase()).toBe("unopened");
    await refusesActions(flow, 0);
    release?.();
    await observing;
    expect(flow.verdict().state).toBe("ready");
    setup.play.answer("continueRound", ok(setup.closed("won", 1)));
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
  });

  it("when the tip check rejects: the verdict stays checking and the error is kept", async () => {
    const setup = await setUpFlow();
    const failure = new Error("tip check failed");
    const flow = flowWith(setup, () => Promise.reject(failure));
    await flow.observe(setup.issued.snapshot);
    await flow.observe(setup.at(0));
    expect(flow.verdict()).toEqual({ state: "checking" });
    expect(flow.phase()).toBe("unopened");
    expect(flow.lastError()).toBe(failure);
    await refusesActions(flow, 0);
    expect(setup.play.all()).toEqual([]);
  });
});

describe("the tracking fails the transcript state itself (W-26)", () => {
  it("once a verdict that required the cancel no longer does", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const tracking = createRoundTracking(
      setup.options,
      {
        roundId: ROUND_ID,
        request: { actionKey: setup.actionKey, bet: setup.options.bet },
      },
      setup.issued.snapshot,
    );
    await tracking.observe(setup.at(0));
    // The tracking alone signs no cancel: the state is open for it.
    expect(tracking.verdict()).toMatchObject({ cancel: true });
    expect(tracking.signer()?.phase()).toBe("open");
    await tracking.observe(setup.read(p => (p.input["status"] = "resolving")));
    expect(tracking.verdict()).toMatchObject({ cancel: false });
    expect(tracking.signer()?.phase()).toBe("failed");
  });
});

describe("a signed message that differs from the encoded one (W-16, W-20)", () => {
  it("is never sent, fails the round, and shows the error", async () => {
    const setup = await setUpFlow();
    // An encoder that changes the message it was given after encoding it: the
    // bytes then no longer describe what is signed next.
    const flow = await startFlow({
      ...setup,
      options: {
        ...setup.options,
        encodeTypedData: action => {
          const bytes = setup.encoder(action);
          (action.message as { previous: string }).previous =
            `0x${"11".repeat(32)}`;
          return bytes;
        },
      },
    });
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(NOT_ACTIVE);
    expect(setup.play.sent("continueRound")).toEqual([]);
    expect(flow.phase()).toBe("failed");
    expect(flow.lastError()).toMatchObject({ code: "invalid-input" });
    expect(await flow.pick({ step: 0, option: 0 })).toEqual(NOT_ACTIVE);
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(setup.play.all()).toHaveLength(1);
  });
});

/** An encoder that changes `previous` in the message after encoding it. */
const changingPrevious =
  (setup: FlowSetup): NonNullable<FlowSetup["options"]["encodeTypedData"]> =>
  action => {
    const bytes = setup.encoder(action);
    (action.message as { previous: string }).previous = `0x${"11".repeat(32)}`;
    return bytes;
  };

/** The tracking's transcript state and settled `T_0`, or a thrown error. */
const openedFor = (
  tracking: ReturnType<typeof createRoundTracking>,
): {
  readonly signer: NonNullable<ReturnType<typeof tracking.signer>>;
  readonly initial: SettledInitial;
} => {
  const signer = tracking.signer();
  const verdict = tracking.verdict();
  const initial = verdict.state === "failed" ? verdict.initial : undefined;
  if (signer === undefined || initial === undefined) {
    throw new TypeError("fixture: no transcript state or no settled T_0");
  }
  return { signer, initial };
};

describe("a signed cancel that differs from its typed data (W-25, W-26)", () => {
  it("is never sent, and the round signs and sends nothing more", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const flow = await startFlow({
      ...setup,
      options: { ...setup.options, encodeTypedData: changingPrevious(setup) },
    });
    expect(setup.play.sent("cancelRound")).toEqual([]);
    expect(flow.cancel()).toBe("unavailable");
    expect(flow.phase()).toBe("failed");
    expect(flow.lastError()).toMatchObject({ code: "invalid-input" });
    const signed = flow.evidence().signed.length;
    await flow.observe(setup.at(0));
    expect(flow.evidence().signed).toHaveLength(signed);
    expect(flow.cancel()).toBe("unavailable");
    expect(setup.play.all()).toHaveLength(1);
  });

  it("fails the transcript state from the cancel itself, without the flow", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const tracking = createRoundTracking(
      setup.options,
      {
        roundId: ROUND_ID,
        request: { actionKey: setup.actionKey, bet: setup.options.bet },
      },
      setup.issued.snapshot,
    );
    await tracking.observe(setup.at(0));
    const { signer, initial } = openedFor(tracking);
    const options = {
      ...setup.options,
      encodeTypedData: changingPrevious(setup),
    };
    const delivery = createRoundDelivery(options, {
      roundId: ROUND_ID,
      observe: tracking.observe,
      signer: tracking.signer,
    });
    const cancel = createRoundCancel(
      options,
      { roundId: ROUND_ID, reissued: () => false },
      delivery,
    );
    await cancel.run(signer, initial);
    expect(cancel.state()).toBe("unavailable");
    expect(signer.phase()).toBe("failed");
    expect(delivery.lastError()).toMatchObject({ code: "invalid-input" });
    expect(setup.play.sent("cancelRound")).toEqual([]);
  });
});
