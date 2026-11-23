// T-45's flow half (W-25, W-26, W-72): a delegated round whose evidence fails
// the delegation check with `T_0` settled signs exactly one `PlayerCancel` once
// it is `active`, also when the tip check fails too; one whose checks 1 to 5
// fail signs nothing; and a later read with another `proofs.keyDelegation` is
// handled as a re-issue: nothing more is signed, picks get `reject`, no
// cash-out, and a W-16 resend of a move already signed still goes out.
// Scripted Play API, fake locks, no clock.

import { describe, expect, it } from "vitest";

import { carrying, expectedOf } from "./fixtures/delegation.ts";
import { lost, ok } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import type { RoundParts } from "./fixtures/round-auth.ts";
import {
  bodyOf,
  type FlowSetup,
  type FlowSetupOptions,
  NOT_ACTIVE,
  setUpFlow,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";
import type { RoundFlow } from "./round-flow.ts";
import { startRoundFlow } from "./round-start.ts";

/**
 * A round whose start carried the vector's delegation, for the set-up session's
 * key; `edit` changes the object the round's Snapshots carry.
 */
const delegated = async (
  options: FlowSetupOptions = {},
  edit?: (object: Record<string, unknown>) => void,
): Promise<{
  readonly setup: FlowSetup;
  readonly carried: (
    ...edits: ((parts: RoundParts) => void)[]
  ) => ReturnType<FlowSetup["read"]>;
  readonly start: () => Promise<RoundFlow>;
}> => {
  const setup = await setUpFlow(options);
  // The delegation names the session's own key, as the shell would send it.
  const sent = { ...expectedOf(), actionKey: setup.actionKey };
  const carried = (
    ...edits: ((parts: RoundParts) => void)[]
  ): ReturnType<FlowSetup["read"]> =>
    setup.read(parts => {
      carrying(object => {
        object["actionKey"] = setup.actionKey.toLowerCase();
        edit?.(object);
      })(parts);
      for (const more of edits) more(parts);
    });
  return {
    setup,
    carried,
    start: () => {
      setup.play.answer("startRound", ok(carried()));
      return startRoundFlow(
        { ...setup.options, delegation: sent },
        setup.hooks,
      );
    },
  };
};

const cancelsSent = (setup: FlowSetup): number =>
  setup.play.sent("cancelRound").length;

describe("a failed delegation check with T_0 settled (W-25, W-26)", () => {
  it("signs one PlayerCancel once active", async () => {
    const round = await delegated({}, o => (o["notice"] = "Another text."));
    round.setup.play.answer(
      "cancelRound",
      ok(round.setup.closed("canceled", 0)),
    );
    const flow = await round.start();
    expect(flow.verdict()).toMatchObject({
      failure: "delegation",
      delegationFailure: "mismatch",
    });
    expect(cancelsSent(round.setup)).toBe(1);
    expect(flow.evidence().signed.map(entry => entry.kind)).toEqual(["cancel"]);
  });

  it("signs exactly one PlayerCancel when the tip check fails too", async () => {
    const round = await delegated(
      { tip: TIP_FAILED },
      o => (o["wallet"] = `0x${"12".repeat(20)}`),
    );
    round.setup.play.answer(
      "cancelRound",
      ok(round.setup.closed("canceled", 0)),
    );
    const flow = await round.start();
    await flow.observe(round.carried());
    expect(cancelsSent(round.setup)).toBe(1);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("signs nothing, not even a cancel, when check 5 fails", async () => {
    const round = await delegated({}, o => (o["notice"] = "Another text."));
    round.setup.play.answer(
      "startRound",
      ok(
        round.carried(
          p => (p.fairnessProof["readyHash"] = `0x${"ab".repeat(32)}`),
        ),
      ),
    );
    const flow = await startRoundFlow(
      { ...round.setup.options, delegation: expectedOf() },
      round.setup.hooks,
    );
    expect(flow.verdict()).toMatchObject({
      failure: "ready-mismatch",
      cancel: false,
    });
    expect(cancelsSent(round.setup)).toBe(0);
    expect(flow.evidence().signed).toHaveLength(0);
  });

  it("keeps each object read in the round's evidence", async () => {
    const round = await delegated();
    const flow = await round.start();
    expect(flow.verdict().state).toBe("ready");
    expect(flow.evidence().delegation).toHaveLength(1);
  });
});

/** A later read of the round carrying another `proofs.keyDelegation`. */
const changed = (
  round: Awaited<ReturnType<typeof delegated>>,
): ReturnType<FlowSetup["read"]> =>
  round.carried(
    carrying(o => {
      o["actionKey"] = round.setup.actionKey.toLowerCase();
      o["acceptedAt"] = 1794990001;
    }),
  );

/** An undelegated round, started and judged `ready` without the object. */
const undelegated = async (): Promise<{
  readonly setup: FlowSetup;
  readonly flow: RoundFlow;
  readonly appeared: ReturnType<FlowSetup["read"]>;
}> => {
  const setup = await setUpFlow({ steps: THREE_STEPS });
  const key = setup.actionKey.toLowerCase();
  const appeared = setup.read(carrying(o => (o["actionKey"] = key)));
  setup.play.answer("startRound", ok(setup.issued.snapshot));
  const flow = await startRoundFlow(setup.options, setup.hooks);
  return { setup, flow, appeared };
};

describe("a delegation appearing on an undelegated round already judged (W-72)", () => {
  it("is changed: no cancel, picks get reject, no cash-out", async () => {
    const { setup, flow, appeared } = await undelegated();
    expect(flow.verdict().state).toBe("ready");
    setup.play.answer("continueRound", ok(setup.at(1)));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(appeared);
    expect(flow.verdict()).toMatchObject({
      failure: "delegation",
      delegationFailure: "changed",
      cancel: false,
    });
    expect(flow.phase()).toBe("reissued");
    expect(await flow.pick({ step: 1, option: 1 })).toEqual(NOT_ACTIVE);
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(cancelsSent(setup)).toBe(0);
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("still sends the W-16 resend of a move already signed", async () => {
    const { setup, flow, appeared } = await undelegated();
    setup.play.answer("continueRound", lost, ok(appeared));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(appeared);
    expect(flow.phase()).toBe("reissued");
    const [first, again] = setup.play.sent("continueRound");
    expect(bodyOf(again)).toEqual(bodyOf(first));
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(setup.play.sent("continueRound")).toHaveLength(2);
    expect(cancelsSent(setup)).toBe(0);
  });
});

describe("a changed delegation is handled as a re-issue (W-72)", () => {
  it("signs nothing more: picks get reject, no cash-out", async () => {
    const round = await delegated({ steps: THREE_STEPS });
    const flow = await round.start();
    round.setup.play.answer(
      "continueRound",
      ok(round.carried(p => (p.input["step"] = 1))),
    );
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(changed(round));
    expect(flow.verdict()).toMatchObject({
      failure: "delegation",
      delegationFailure: "changed",
      cancel: false,
    });
    expect(flow.phase()).toBe("reissued");
    expect(await flow.pick({ step: 1, option: 1 })).toEqual(NOT_ACTIVE);
    expect(await flow.cashOut()).toEqual(NOT_ACTIVE);
    expect(flow.evidence().signed).toHaveLength(1);
    expect(cancelsSent(round.setup)).toBe(0);
    expect(flow.evidence().delegation).toHaveLength(2);
  });

  it("still sends the W-16 resend of a move already signed", async () => {
    const round = await delegated({ steps: THREE_STEPS });
    const flow = await round.start();
    round.setup.play.answer("continueRound", lost, ok(changed(round)));
    await flow.pick({ step: 0, option: 1 });
    await flow.observe(changed(round));
    expect(flow.phase()).toBe("reissued");
    const [first, again] = round.setup.play.sent("continueRound");
    expect(bodyOf(again)).toEqual(bodyOf(first));
    expect(await flow.resend()).toEqual(NOT_ACTIVE);
    expect(round.setup.play.sent("continueRound")).toHaveLength(2);
    expect(flow.evidence().signed).toHaveLength(1);
  });
});
